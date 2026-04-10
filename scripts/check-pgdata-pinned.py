#!/usr/bin/env python3
"""Assert that every postgres service in a docker-compose file pins PGDATA.

Background
----------
The postgres:18-alpine image defaults PGDATA to a non-standard path
(/var/lib/postgresql/18/docker). If a compose file mounts a named volume at
/var/lib/postgresql/data WITHOUT explicitly setting PGDATA=/var/lib/postgresql/data,
postgres initialises its cluster at the image default, which lands outside
the mount. The named volume stays empty, the real cluster ends up in an
anonymous volume, and the next `docker compose up` after the operator "fixes"
the compose file silently initialises a fresh cluster — wiping all data from
the application's point of view. This was the Apr 2026 incident on
oj.auraedu.me and (nearly) test.worv.ai.

The fix is to set `PGDATA: /var/lib/postgresql/data` (matching the mount
point) in the service environment. This script enforces that invariant at
CI time so a regression cannot land silently.

Usage
-----
    python3 scripts/check-pgdata-pinned.py <compose-file> [<compose-file>...]

Exit codes
----------
    0 — all postgres services in all files are pinned correctly
    1 — at least one service is missing the pinning (prints details)
    2 — usage / parse error
"""
from __future__ import annotations

import sys
from pathlib import Path


REQUIRED_PGDATA = "/var/lib/postgresql/data"


def load_yaml(path: Path):
    try:
        import yaml  # type: ignore[import-not-found]
    except ImportError:
        print(
            "ERROR: PyYAML is required. On GitHub's ubuntu-latest it is "
            "pre-installed; locally run `pip install pyyaml`.",
            file=sys.stderr,
        )
        sys.exit(2)
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def extract_env(service: dict) -> dict:
    """Return service environment as a dict, regardless of whether it was
    written as a mapping or a list of KEY=VALUE strings."""
    env = service.get("environment", {}) or {}
    if isinstance(env, dict):
        return {str(k): str(v) if v is not None else "" for k, v in env.items()}
    if isinstance(env, list):
        out: dict[str, str] = {}
        for entry in env:
            if isinstance(entry, str) and "=" in entry:
                k, v = entry.split("=", 1)
                out[k.strip()] = v.strip()
            elif isinstance(entry, str):
                out[entry.strip()] = ""
        return out
    return {}


def volume_mounts_data(service: dict) -> bool:
    """True iff the service mounts anything at /var/lib/postgresql/data.

    We accept both the short form (`name:/var/lib/postgresql/data[:mode]`)
    and the long form ({type, source, target}).
    """
    volumes = service.get("volumes", []) or []
    target_path = "/var/lib/postgresql/data"
    for v in volumes:
        if isinstance(v, str):
            # short form: [source]:target[:mode]
            parts = v.split(":")
            if len(parts) >= 2 and parts[1] == target_path:
                return True
        elif isinstance(v, dict):
            if v.get("target") == target_path:
                return True
    return False


def is_postgres_service(service: dict) -> bool:
    image = service.get("image", "") or ""
    if not isinstance(image, str):
        return False
    return image.startswith("postgres:") or image == "postgres" or ":postgres-" in image


def check_file(path: Path) -> list[str]:
    """Return a list of violation strings. Empty list means OK."""
    data = load_yaml(path)
    if not isinstance(data, dict):
        return [f"{path}: not a YAML mapping at the top level"]
    services = data.get("services", {}) or {}
    if not isinstance(services, dict):
        return [f"{path}: 'services' is not a mapping"]

    violations: list[str] = []
    for name, svc in services.items():
        if not isinstance(svc, dict):
            continue
        if not is_postgres_service(svc):
            continue
        env = extract_env(svc)
        pgdata = env.get("PGDATA", "")
        if pgdata != REQUIRED_PGDATA:
            violations.append(
                f"{path}:service[{name}]: PGDATA is {pgdata!r}, "
                f"expected {REQUIRED_PGDATA!r}. "
                f"Set `PGDATA: {REQUIRED_PGDATA}` in the service "
                f"environment to avoid the anonymous-volume data-loss "
                f"scenario (see scripts/pg-volume-safety-check.sh)."
            )
            continue
        if not volume_mounts_data(svc):
            violations.append(
                f"{path}:service[{name}]: no volume mounted at "
                f"{REQUIRED_PGDATA}. PGDATA is pinned but nothing is "
                f"mounted there — the cluster would live in an anonymous "
                f"volume. Add a volume mount at {REQUIRED_PGDATA}."
            )
    return violations


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "Usage: check-pgdata-pinned.py <compose-file> [<compose-file>...]",
            file=sys.stderr,
        )
        return 2

    all_violations: list[str] = []
    for arg in argv[1:]:
        path = Path(arg)
        if not path.exists():
            print(f"ERROR: {path} does not exist", file=sys.stderr)
            return 2
        all_violations.extend(check_file(path))

    if all_violations:
        print("PGDATA pinning violations detected:", file=sys.stderr)
        for v in all_violations:
            print(f"  - {v}", file=sys.stderr)
        return 1

    print(
        f"OK: PGDATA pinning verified in {len(argv) - 1} compose file(s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
