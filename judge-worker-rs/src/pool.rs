use crate::docker::WarmContainerSettings;
use crate::types::WarmPoolTargets;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Prefix for warm (pre-started, idle) containers. Deliberately inside the
/// `oj-` namespace so the startup reap-all sweep still removes warm leftovers
/// from a previous process, but distinct from a per-run `oj-<uuid>` so the
/// periodic stale-running sweep can tell a pooled container apart from an
/// abandoned judging container.
pub const WARM_CONTAINER_PREFIX: &str = "oj-warm-";

/// Difference between the pool we have and the pool we want, expressed as
/// per-image counts. Kept as a pure value so the decision logic is unit
/// testable without touching Docker.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReconcilePlan {
    /// (image, how many idle containers to create)
    pub to_create: Vec<(String, usize)>,
    /// (image, how many idle containers to destroy)
    pub to_remove: Vec<(String, usize)>,
}

/// Compute the create/remove deltas needed to move `current` to `targets`.
///
/// When `targets.enabled` is false the plan drains every image, which is how an
/// admin turning the feature off reaches the fleet on the next heartbeat.
/// Output is sorted by image name so a given (current, targets) pair always
/// produces the same plan.
pub fn plan_reconcile(
    current: &HashMap<String, usize>,
    targets: &WarmPoolTargets,
) -> ReconcilePlan {
    let mut plan = ReconcilePlan::default();

    let desired: HashMap<&str, usize> = if targets.enabled {
        targets
            .images
            .iter()
            .map(|(image, count)| (image.as_str(), *count as usize))
            .collect()
    } else {
        HashMap::new()
    };

    let mut images: Vec<&str> = current
        .keys()
        .map(String::as_str)
        .chain(desired.keys().copied())
        .collect();
    images.sort_unstable();
    images.dedup();

    for image in images {
        let have = current.get(image).copied().unwrap_or(0);
        let want = desired.get(image).copied().unwrap_or(0);
        if want > have {
            plan.to_create.push((image.to_string(), want - have));
        } else if have > want {
            plan.to_remove.push((image.to_string(), have - want));
        }
    }

    plan
}

#[derive(Default)]
struct PoolState {
    /// image -> idle container names ready to be adopted
    idle: HashMap<String, VecDeque<String>>,
    /// Names with a Docker call in flight: a `docker run` issued but not yet
    /// confirmed, or a downsize victim popped from `idle` and not yet removed.
    ///
    /// A create is recorded BEFORE the subprocess starts and a removal victim
    /// is moved here in the same critical section that pops it, so every live
    /// container is tracked in either `idle` or `pending` at all times.
    /// `drain_all` destroys pending names too, and the stale-running sweep
    /// deliberately refuses to reap `oj-warm-*`, so this set is the only thing
    /// standing between an aborted reconcile and a container that idles on
    /// `sleep infinity` until the next process start.
    pending: HashSet<String>,
    targets: WarmPoolTargets,
}

/// Maintains a pool of pre-started, idle judge containers so a test-case run
/// can skip Docker container creation. Containers are strictly single use: a
/// container handed out by `acquire` is never returned to the pool.
///
/// Shared between the poll loop, the heartbeat task and shutdown, so the lock
/// is only ever held to compute or mutate state — never across a `docker`
/// subprocess call, which a slow daemon would otherwise turn into a stall on
/// the judging hot path.
pub struct PoolManager {
    disabled: bool,
    settings: WarmContainerSettings,
    state: Mutex<PoolState>,
    /// Single-flight guard for `reconcile`. The register-time seed task and the
    /// heartbeat both reconcile, and a plan computed against a half-filled pool
    /// would schedule a second full batch on top of the first — transiently up
    /// to 2x the target, each container holding a multi-hundred-MiB memory
    /// reservation.
    ///
    /// Taken with `try_lock`, never awaited: a reconcile can spend minutes in
    /// Docker calls against a wedged daemon, and a caller that queued behind it
    /// would stall with it. The heartbeat loop in particular must keep sending
    /// heartbeats or the app server marks this worker stale and drains its
    /// work. Skipping is safe because reconcile is idempotent and the next
    /// heartbeat runs it again.
    reconcile_lock: Mutex<()>,
}

impl PoolManager {
    pub fn new(disabled: bool, settings: WarmContainerSettings) -> Arc<Self> {
        Arc::new(Self {
            disabled,
            settings,
            state: Mutex::new(PoolState::default()),
            reconcile_lock: Mutex::new(()),
        })
    }

    /// Replace the desired targets (called on register and every heartbeat).
    pub async fn set_targets(&self, targets: WarmPoolTargets) {
        if self.disabled {
            return;
        }
        let mut state = self.state.lock().await;
        state.targets = targets;
    }

    /// Current idle container count per image.
    pub async fn idle_counts(&self) -> HashMap<String, usize> {
        let state = self.state.lock().await;
        state
            .idle
            .iter()
            .map(|(image, queue)| (image.clone(), queue.len()))
            .collect()
    }

    /// Take an idle container for a single run. Returns None when the pool is
    /// empty or disabled, which makes the caller fall back to a cold run.
    ///
    /// Not yet called from the run path; the adopt-side wiring lands with the
    /// warm-container run phase.
    #[allow(dead_code)]
    pub async fn acquire(&self, image: &str) -> Option<String> {
        if self.disabled {
            return None;
        }
        let mut state = self.state.lock().await;
        state.idle.get_mut(image).and_then(VecDeque::pop_front)
    }

    #[cfg(test)]
    pub async fn register_idle_for_test(&self, image: &str, container: &str) {
        let mut state = self.state.lock().await;
        state
            .idle
            .entry(image.to_string())
            .or_default()
            .push_back(container.to_string());
    }

    /// Track a name as having a Docker call in flight, the state a container is
    /// in between `pending.insert` and the end of `create_warm_container`.
    #[cfg(test)]
    pub async fn track_pending_for_test(&self, container: &str) {
        let mut state = self.state.lock().await;
        state.pending.insert(container.to_string());
    }

    /// Read-only view of every name this process tracks: idle containers plus
    /// the ones with a Docker call in flight. Used by the startup staging-
    /// directory sweep to know which host directories are still spoken for —
    /// `pending` is populated before `docker run`, so a container whose staging
    /// directory exists is always in here.
    pub async fn tracked_names(&self) -> HashSet<String> {
        let state = self.state.lock().await;
        state
            .idle
            .values()
            .flatten()
            .chain(state.pending.iter())
            .cloned()
            .collect()
    }

    /// Sorted view of [`Self::tracked_names`], so a test can assert that a
    /// teardown really emptied the pool without draining it itself.
    #[cfg(test)]
    pub async fn tracked_names_for_test(&self) -> Vec<String> {
        let mut names: Vec<String> = self.tracked_names().await.into_iter().collect();
        names.sort();
        names
    }

    /// Bring the live pool in line with the current targets. Creates missing
    /// idle containers and destroys excess ones. Failures are logged and
    /// ignored: a pool that cannot be filled simply means cold runs.
    pub async fn reconcile(&self) {
        if self.disabled {
            return;
        }

        // Single-flight: only one reconcile at a time, so a plan is never
        // computed against a pool another reconcile is still filling. This is a
        // separate lock from `state` and is never held while `state` is taken,
        // so it cannot deadlock with acquire()/idle_counts().
        //
        // Non-blocking on purpose: waiting here would put the caller (the
        // heartbeat loop, notably) behind every Docker call the in-flight pass
        // still has to make. Reconcile is idempotent, so dropping this pass
        // loses nothing — the next heartbeat reconciles against whatever state
        // the running pass left behind.
        let Ok(_single_flight) = self.reconcile_lock.try_lock() else {
            tracing::debug!("warm pool reconcile already in flight; skipping this pass");
            return;
        };

        // Drop entries whose container is no longer running before planning,
        // otherwise a pool full of corpses reports itself full forever and
        // `acquire` hands out dead names.
        self.prune_dead_entries().await;

        // Compute the plan under the lock, then release it before touching
        // Docker so a slow `docker run` never blocks acquire() on the hot path.
        let plan = {
            let state = self.state.lock().await;
            let current: HashMap<String, usize> = state
                .idle
                .iter()
                .map(|(image, queue)| (image.clone(), queue.len()))
                .collect();
            plan_reconcile(&current, &state.targets)
        };

        for (image, count) in plan.to_remove {
            for _ in 0..count {
                // Pop under the lock so a concurrent acquire() can never hand
                // out a container that is about to be removed, and move the
                // name into `pending` in the same critical section so it is
                // never untracked while `docker rm` runs.
                match self.take_removal_victim(&image).await {
                    Some(name) => {
                        crate::docker::remove_container_by_name(&name).await;
                        self.finish_removal(&name).await;
                    }
                    None => break,
                }
            }
        }

        for (image, count) in plan.to_create {
            for _ in 0..count {
                // Claim the name in state BEFORE the daemon can create anything
                // under it. If this task is aborted (shutdown races the seed
                // fill) the name is already tracked, so `drain_all` destroys
                // whatever the daemon managed to start.
                let name = format!("{}{}", WARM_CONTAINER_PREFIX, Uuid::new_v4());
                {
                    let mut state = self.state.lock().await;
                    state.pending.insert(name.clone());
                }

                let created =
                    crate::docker::create_warm_container(&image, &name, &self.settings).await;

                let mut state = self.state.lock().await;
                state.pending.remove(&name);
                match created {
                    Ok(()) => {
                        state.idle.entry(image.clone()).or_default().push_back(name);
                    }
                    Err(e) => {
                        drop(state);
                        // Stop trying this image for this pass: a failure is
                        // almost always systemic (missing image, wedged
                        // daemon), and retrying N times just multiplies the
                        // stall. `create_warm_container` has already removed
                        // anything it may have started.
                        tracing::warn!(image = %image, error = %e, "failed to create warm container");
                        break;
                    }
                }
            }
        }

        let idle = self.idle_counts().await;
        tracing::debug!(?idle, "warm pool reconciled");
    }

    /// Pop the next downsize victim for `image`, moving it from `idle` into
    /// `pending` atomically so it is tracked for the whole removal. An abort
    /// between here and `finish_removal` leaves the name in `pending`, where
    /// `drain_all` still finds and destroys it.
    async fn take_removal_victim(&self, image: &str) -> Option<String> {
        let mut state = self.state.lock().await;
        let victim = state.idle.get_mut(image).and_then(VecDeque::pop_front);
        if let Some(name) = victim.as_ref() {
            state.pending.insert(name.clone());
            // Drop the key once its queue empties, the same way pruning does,
            // so an image never lingers as a live-but-zero entry.
            if state.idle.get(image).is_some_and(VecDeque::is_empty) {
                state.idle.remove(image);
            }
        }
        victim
    }

    /// Stop tracking a victim once its container is gone.
    async fn finish_removal(&self, name: &str) {
        let mut state = self.state.lock().await;
        state.pending.remove(name);
    }

    /// Drop idle entries whose container is no longer running, force-removing
    /// each one so a pruned entry can never become an untracked leftover.
    ///
    /// When the daemon cannot be queried the pool is left exactly as it is: a
    /// briefly wedged dockerd must not read as "every container died".
    async fn prune_dead_entries(&self) {
        // Nothing tracked means nothing to verify: skip the `docker ps` so a
        // worker whose targets are empty pays no per-heartbeat Docker cost.
        if self.state.lock().await.idle.is_empty() {
            return;
        }

        let Some(live) = crate::docker::running_warm_container_names().await else {
            return;
        };

        let dead = self.retain_only_live(&live).await;

        if dead.is_empty() {
            return;
        }
        tracing::warn!(
            count = dead.len(),
            "pruning warm containers that are no longer running"
        );
        for name in dead {
            crate::docker::remove_container_by_name(&name).await;
            self.finish_removal(&name).await;
        }
    }

    /// Move every idle entry missing from `live` into `pending` and return the
    /// moved names. State surgery only, so the self-healing rule is unit
    /// testable without a Docker daemon; the caller does the removals and calls
    /// `finish_removal` for each, which keeps a pruned name tracked (and so
    /// drainable) until its container is actually gone.
    async fn retain_only_live(&self, live: &HashSet<String>) -> Vec<String> {
        let mut state = self.state.lock().await;
        let mut dead = Vec::new();
        state.idle.retain(|_image, queue| {
            queue.retain(|name| {
                if live.contains(name) {
                    true
                } else {
                    dead.push(name.clone());
                    false
                }
            });
            !queue.is_empty()
        });
        for name in &dead {
            state.pending.insert(name.clone());
        }
        dead
    }

    /// Empty out every tracked name — idle plus in-flight — and return them.
    /// Split out of `drain_all` so the "every live container is tracked
    /// somewhere" invariant is assertable without a Docker daemon.
    async fn take_all_tracked_names(&self) -> Vec<String> {
        let mut state = self.state.lock().await;
        let mut names: Vec<String> = state.idle.drain().flat_map(|(_, queue)| queue).collect();
        names.extend(state.pending.drain());
        names
    }

    /// Destroy every idle container, plus any with a Docker call still in
    /// flight (graceful shutdown).
    pub async fn drain_all(&self) {
        let drained = self.take_all_tracked_names().await;
        if drained.is_empty() {
            return;
        }
        tracing::info!(count = drained.len(), "draining idle warm containers");
        for name in drained {
            crate::docker::remove_container_by_name(&name).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PoolManager, plan_reconcile};
    use crate::docker::WarmContainerSettings;
    use crate::types::WarmPoolTargets;
    use std::collections::{HashMap, HashSet};
    use std::path::PathBuf;
    use std::sync::Arc;

    /// A manager wired to a seccomp path that does not exist, so any accidental
    /// Docker call in these tests fails fast instead of touching a daemon.
    fn manager(disabled: bool) -> Arc<PoolManager> {
        PoolManager::new(
            disabled,
            WarmContainerSettings {
                seccomp_profile_path: PathBuf::from("/nonexistent/seccomp-profile.json"),
                disable_custom_seccomp: false,
            },
        )
    }

    fn targets(enabled: bool, pairs: &[(&str, u32)]) -> WarmPoolTargets {
        WarmPoolTargets {
            enabled,
            images: pairs.iter().map(|(k, v)| ((*k).to_string(), *v)).collect(),
        }
    }

    fn current(pairs: &[(&str, usize)]) -> HashMap<String, usize> {
        pairs.iter().map(|(k, v)| ((*k).to_string(), *v)).collect()
    }

    #[test]
    fn creates_missing_containers_up_to_target() {
        let plan = plan_reconcile(&current(&[]), &targets(true, &[("judge-cpp:latest", 2)]));
        assert_eq!(plan.to_create, vec![("judge-cpp:latest".to_string(), 2)]);
        assert!(plan.to_remove.is_empty());
    }

    #[test]
    fn removes_excess_containers() {
        let plan = plan_reconcile(
            &current(&[("judge-cpp:latest", 5)]),
            &targets(true, &[("judge-cpp:latest", 2)]),
        );
        assert!(plan.to_create.is_empty());
        assert_eq!(plan.to_remove, vec![("judge-cpp:latest".to_string(), 3)]);
    }

    #[test]
    fn is_a_noop_when_already_at_target() {
        let plan = plan_reconcile(
            &current(&[("judge-cpp:latest", 2)]),
            &targets(true, &[("judge-cpp:latest", 2)]),
        );
        assert!(plan.to_create.is_empty());
        assert!(plan.to_remove.is_empty());
    }

    #[test]
    fn drains_everything_when_disabled() {
        let plan = plan_reconcile(
            &current(&[("judge-cpp:latest", 2), ("judge-python:latest", 1)]),
            &targets(false, &[("judge-cpp:latest", 2)]),
        );
        assert!(plan.to_create.is_empty());
        let mut removed = plan.to_remove.clone();
        removed.sort();
        assert_eq!(
            removed,
            vec![
                ("judge-cpp:latest".to_string(), 2),
                ("judge-python:latest".to_string(), 1)
            ]
        );
    }

    #[test]
    fn drains_images_dropped_from_targets() {
        let plan = plan_reconcile(
            &current(&[("judge-python:latest", 3)]),
            &targets(true, &[("judge-cpp:latest", 1)]),
        );
        assert_eq!(plan.to_create, vec![("judge-cpp:latest".to_string(), 1)]);
        assert_eq!(plan.to_remove, vec![("judge-python:latest".to_string(), 3)]);
    }

    #[test]
    fn plans_are_deterministic_across_runs() {
        let cur = current(&[("judge-python:latest", 1)]);
        let tgt = targets(true, &[("judge-cpp:latest", 2), ("judge-rust:latest", 1)]);
        assert_eq!(plan_reconcile(&cur, &tgt), plan_reconcile(&cur, &tgt));
    }

    #[tokio::test]
    async fn acquire_returns_none_when_pool_is_empty() {
        let manager = manager(false);
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
    }

    #[tokio::test]
    async fn disabled_manager_never_hands_out_containers() {
        let manager = manager(true);
        manager
            .set_targets(targets(true, &[("judge-cpp:latest", 2)]))
            .await;
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
        assert_eq!(manager.idle_counts().await.len(), 0);
    }

    /// Two registered containers must come back as two DISTINCT names before
    /// the pool runs dry. With a single container this test could not tell
    /// "handed out once" apart from "pool was empty on the second call".
    #[tokio::test]
    async fn acquire_hands_out_each_container_exactly_once() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-abc")
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-def")
            .await;

        let first = manager
            .acquire("judge-cpp:latest")
            .await
            .expect("first acquire");
        let second = manager
            .acquire("judge-cpp:latest")
            .await
            .expect("second acquire");

        assert_ne!(
            first, second,
            "a container handed out once must never be handed out again"
        );
        let mut handed = [first, second];
        handed.sort();
        assert_eq!(
            handed,
            ["oj-warm-abc".to_string(), "oj-warm-def".to_string()]
        );

        // Single use: nothing is returned to the pool, so it is now empty.
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
    }

    /// A container that died under the pool must be dropped from state so the
    /// next plan refills it, instead of the pool reporting itself full while
    /// holding a corpse (and handing that corpse to `acquire`).
    #[tokio::test]
    async fn dead_containers_are_pruned_so_the_pool_refills() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-alive")
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-dead")
            .await;

        let live: HashSet<String> = ["oj-warm-alive".to_string()].into_iter().collect();
        let pruned = manager.retain_only_live(&live).await;
        assert_eq!(pruned, vec!["oj-warm-dead".to_string()]);

        let counts = manager.idle_counts().await;
        assert_eq!(counts.get("judge-cpp:latest"), Some(&1));
        // The next reconcile now sees a hole and plans a replacement.
        let plan = plan_reconcile(&counts, &targets(true, &[("judge-cpp:latest", 2)]));
        assert_eq!(plan.to_create, vec![("judge-cpp:latest".to_string(), 1)]);
    }

    /// Pruning must empty out an image key entirely rather than leave an empty
    /// queue behind that later reads as a live-but-zero entry.
    #[tokio::test]
    async fn pruning_every_container_leaves_no_stale_image_entry() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-dead-1")
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-dead-2")
            .await;

        let pruned = manager.retain_only_live(&HashSet::new()).await;
        assert_eq!(pruned.len(), 2);
        assert!(manager.idle_counts().await.is_empty());
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
    }

    #[tokio::test]
    async fn idle_counts_reflect_registered_containers() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-1")
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-2")
            .await;
        let counts = manager.idle_counts().await;
        assert_eq!(counts.get("judge-cpp:latest"), Some(&2));
    }

    /// A disabled manager must not even record targets: `reconcile` on a
    /// disabled pool is a no-op, so keeping targets around would only be a
    /// misleading state snapshot.
    #[tokio::test]
    async fn disabled_manager_ignores_targets() {
        let manager = manager(true);
        manager
            .set_targets(targets(true, &[("judge-cpp:latest", 2)]))
            .await;
        manager.reconcile().await;
        assert_eq!(manager.idle_counts().await.len(), 0);
    }

    /// A reconcile that finds another pass in flight must return immediately
    /// instead of queueing behind it. Queueing is what stalled the heartbeat
    /// loop: a pass against a wedged daemon can sit in Docker calls for
    /// minutes, and every heartbeat waiting on it is a heartbeat not sent.
    #[tokio::test]
    async fn reconcile_skips_when_another_pass_is_in_flight() {
        let manager = manager(false);
        manager
            .set_targets(targets(true, &[("judge-cpp:latest", 2)]))
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-held")
            .await;

        // Stand in for a pass that is deep inside `docker run`.
        let in_flight = manager.reconcile_lock.lock().await;

        // Must return without waiting. The generous timeout only has to
        // distinguish "returned" from "blocked on the guard"; a blocking
        // reconcile would hold until `in_flight` is dropped, which never
        // happens before the assert.
        tokio::time::timeout(std::time::Duration::from_secs(5), manager.reconcile())
            .await
            .expect("a reconcile with a pass in flight must skip, not block");

        drop(in_flight);

        // Skipping must be a pure no-op: no container touched, no state lost.
        assert_eq!(
            manager.idle_counts().await.get("judge-cpp:latest"),
            Some(&1),
            "a skipped pass must leave the pool exactly as it found it"
        );
        assert_eq!(
            manager.acquire("judge-cpp:latest").await.as_deref(),
            Some("oj-warm-held")
        );
    }

    /// Once the guard is free again the next pass proceeds normally: skipping
    /// must not latch. Uses a disabled manager so the pass itself stays off
    /// Docker; what is under test is that the guard was released, not the fill.
    #[tokio::test]
    async fn the_guard_is_released_after_a_skipped_pass() {
        let manager = manager(true);
        {
            let _in_flight = manager.reconcile_lock.lock().await;
            manager.reconcile().await;
        }
        assert!(
            manager.reconcile_lock.try_lock().is_ok(),
            "a skipped pass must not leave the single-flight guard held"
        );
    }

    /// A downsize victim is popped from `idle` and only then removed via
    /// Docker. For the whole of that window it must still be tracked, or an
    /// abort in the middle leaves a running container nothing will ever
    /// destroy.
    #[tokio::test]
    async fn a_removal_victim_stays_tracked_until_its_container_is_gone() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-victim")
            .await;

        let victim = manager
            .take_removal_victim("judge-cpp:latest")
            .await
            .expect("a victim is available");
        assert_eq!(victim, "oj-warm-victim");

        // Out of idle (so acquire cannot hand out a doomed container)...
        assert!(manager.idle_counts().await.is_empty());
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
        // ...but still tracked, so an abort here is still recoverable.
        assert!(
            manager
                .state
                .lock()
                .await
                .pending
                .contains("oj-warm-victim"),
            "a victim mid-removal must be tracked in pending"
        );

        manager.finish_removal(&victim).await;
        assert!(
            !manager
                .state
                .lock()
                .await
                .pending
                .contains("oj-warm-victim"),
            "a removed container must stop being tracked"
        );
    }

    /// The point of tracking a victim: a shutdown landing between the pop and
    /// the removal must still destroy it.
    #[tokio::test]
    async fn shutdown_drains_a_victim_abandoned_mid_removal() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-victim")
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-keeper")
            .await;

        // Popped for removal, then the task is aborted before `docker rm`.
        let _victim = manager.take_removal_victim("judge-cpp:latest").await;

        let mut drained = manager.take_all_tracked_names().await;
        drained.sort();
        assert_eq!(
            drained,
            ["oj-warm-keeper".to_string(), "oj-warm-victim".to_string()],
            "shutdown must destroy in-flight removal victims, not just idle containers"
        );
    }

    /// Pruned corpses are likewise tracked until they are actually removed, so
    /// the invariant holds on the self-healing path too.
    #[tokio::test]
    async fn pruned_entries_stay_tracked_until_removed() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-dead")
            .await;

        let pruned = manager.retain_only_live(&HashSet::new()).await;
        assert_eq!(pruned, vec!["oj-warm-dead".to_string()]);
        assert_eq!(
            manager.take_all_tracked_names().await,
            vec!["oj-warm-dead".to_string()],
            "a pruned name must remain drainable until its container is gone"
        );
    }

    /// The warm prefix must stay inside the `oj-` namespace so the startup
    /// reap-all sweep (`name=oj-`) still removes warm leftovers from a previous
    /// process, while remaining distinguishable from a per-run `oj-<uuid>`.
    #[test]
    fn warm_prefix_is_inside_the_oj_namespace_but_distinct() {
        assert!(super::WARM_CONTAINER_PREFIX.starts_with("oj-"));
        assert_ne!(super::WARM_CONTAINER_PREFIX, "oj-");
    }
}
