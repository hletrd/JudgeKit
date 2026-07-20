use crate::docker::WarmContainerSettings;
use crate::types::WarmPoolTargets;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::Mutex;

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
}

impl PoolManager {
    pub fn new(disabled: bool, settings: WarmContainerSettings) -> Arc<Self> {
        Arc::new(Self {
            disabled,
            settings,
            state: Mutex::new(PoolState::default()),
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

    /// Bring the live pool in line with the current targets. Creates missing
    /// idle containers and destroys excess ones. Failures are logged and
    /// ignored: a pool that cannot be filled simply means cold runs.
    pub async fn reconcile(&self) {
        if self.disabled {
            return;
        }

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
                // out a container that is about to be removed.
                let victim = {
                    let mut state = self.state.lock().await;
                    state.idle.get_mut(&image).and_then(VecDeque::pop_front)
                };
                match victim {
                    Some(name) => crate::docker::remove_container_by_name(&name).await,
                    None => break,
                }
            }
        }

        for (image, count) in plan.to_create {
            for _ in 0..count {
                match crate::docker::create_warm_container(&image, &self.settings).await {
                    Ok(name) => {
                        let mut state = self.state.lock().await;
                        state.idle.entry(image.clone()).or_default().push_back(name);
                    }
                    Err(e) => {
                        // Stop trying this image for this pass: a failure is
                        // almost always systemic (missing image, wedged
                        // daemon), and retrying N times just multiplies the
                        // stall.
                        tracing::warn!(image = %image, error = %e, "failed to create warm container");
                        break;
                    }
                }
            }
        }

        let idle = self.idle_counts().await;
        tracing::debug!(?idle, "warm pool reconciled");
    }

    /// Destroy every idle container (graceful shutdown).
    pub async fn drain_all(&self) {
        let drained: Vec<String> = {
            let mut state = self.state.lock().await;
            state.idle.drain().flat_map(|(_, queue)| queue).collect()
        };
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
    use std::collections::HashMap;
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

    #[tokio::test]
    async fn acquire_pops_a_registered_idle_container_once() {
        let manager = manager(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-abc")
            .await;
        assert_eq!(
            manager.acquire("judge-cpp:latest").await,
            Some("oj-warm-abc".to_string())
        );
        // Single-use: the same container is never handed out twice.
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

    /// The warm prefix must stay inside the `oj-` namespace so the startup
    /// reap-all sweep (`name=oj-`) still removes warm leftovers from a previous
    /// process, while remaining distinguishable from a per-run `oj-<uuid>`.
    #[test]
    fn warm_prefix_is_inside_the_oj_namespace_but_distinct() {
        assert!(super::WARM_CONTAINER_PREFIX.starts_with("oj-"));
        assert_ne!(super::WARM_CONTAINER_PREFIX, "oj-");
    }
}
