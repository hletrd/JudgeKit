use crate::types::WarmPoolTargets;
use std::collections::HashMap;

/// Difference between the pool we have and the pool we want, expressed as
/// per-image counts. Kept as a pure value so the decision logic is unit
/// testable without touching Docker.
///
/// Not yet consumed in production code; wired into the warm-pool reconciler
/// in a later task.
#[allow(dead_code)]
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
///
/// Not yet called in production code; Task 10 layers the actual container
/// create/destroy on top of this pure decision function.
#[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::plan_reconcile;
    use crate::types::WarmPoolTargets;
    use std::collections::HashMap;

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
}
