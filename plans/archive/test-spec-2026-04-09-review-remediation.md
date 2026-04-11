# Test Spec — 2026-04-09 review remediation

## Verification targets
- auth/API behavior regressions prevented with Vitest route/component tests
- DB import/export failure paths covered with unit tests
- file authorization and storage behavior covered with unit tests
- email normalization and uniqueness/login behavior covered with unit tests
- rate-limiter Rust crate gains real tests
- lint, typecheck, unit tests, Rust tests, build all pass

## Commands
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test:unit`
- `cargo test --quiet --manifest-path judge-worker-rs/Cargo.toml`
- `cargo test --quiet --manifest-path code-similarity-rs/Cargo.toml`
- `cargo test --quiet --manifest-path rate-limiter-rs/Cargo.toml`
- `npm run build`
