use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

/// A temporary workspace directory intended for sandboxed compiler/judge runs.
///
/// The directory is created under the system temp folder. Callers chown the
/// directory and its contents to the sandbox uid (65534) before mounting it
/// into a container. When the value is dropped we recursively chown the tree
/// back to the worker process uid/gid and then remove it, preventing leaks
/// when the sandbox user created files or subdirectories.
pub struct SandboxWorkspace {
    path: Option<PathBuf>,
}

impl SandboxWorkspace {
    /// Create a new temporary workspace directory.
    pub fn new() -> io::Result<Self> {
        let dir = tempfile::TempDir::new()?;
        let path = dir.keep();
        Ok(Self { path: Some(path) })
    }

    /// Path to the workspace directory.
    pub fn path(&self) -> &Path {
        self.path
            .as_ref()
            .expect("workspace path is always set until drop")
    }
}

fn chown_recursive(path: &Path, uid: u32, gid: u32) -> io::Result<()> {
    // SECURITY: never follow symlinks (RPF cycle-1 H1). The sandbox user can
    // plant `ln -s /etc pwn` inside the RW workspace; the previous
    // `fs::chown` + `path.is_dir()` combination both dereferenced symlinks,
    // so a root worker would chown arbitrary host paths and recurse into
    // them. `lchown` changes the link itself, and `symlink_metadata` reports
    // the link (not its target), so a symlink is never treated as a
    // directory to descend into.
    std::os::unix::fs::lchown(path, Some(uid), Some(gid))?;
    if path.symlink_metadata()?.file_type().is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            chown_recursive(&entry.path(), uid, gid)?;
        }
    }
    Ok(())
}

fn cleanup_with_docker(path: &Path) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "workspace path has no parent")
    })?;
    let name = path.file_name().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "workspace path has no file name")
    })?;

    let mount = format!("{}:/work", parent.display());
    let target = format!("/work/{}", name.to_string_lossy());

    let output = Command::new("docker")
        .args([
            "run",
            "--rm",
            "--user",
            "root",
            "-v",
            &mount,
            "alpine:3.21",
            "rm",
            "-rf",
            &target,
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!("docker cleanup failed: {stderr}"),
        ));
    }
    Ok(())
}

impl Drop for SandboxWorkspace {
    fn drop(&mut self) {
        if let Some(path) = self.path.take() {
            unsafe {
                let uid = libc::getuid();
                if uid == 0 {
                    let gid = libc::getgid();
                    if let Err(e) = chown_recursive(&path, uid, gid) {
                        tracing::warn!(
                            error = %e,
                            path = %path.display(),
                            "Failed to chown workspace back to worker user; cleanup may fail",
                        );
                    }
                }
            }

            if let Err(e) = std::fs::remove_dir_all(&path) {
                unsafe {
                    if libc::getuid() != 0 {
                        if let Err(docker_err) = cleanup_with_docker(&path) {
                            tracing::warn!(
                                error = %docker_err,
                                path = %path.display(),
                                "Failed to clean up sandbox workspace via docker",
                            );
                        }
                    } else {
                        tracing::warn!(
                            error = %e,
                            path = %path.display(),
                            "Failed to clean up sandbox workspace",
                        );
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{cleanup_with_docker, SandboxWorkspace};
    use std::fs;
    use std::os::unix::fs::{chown, PermissionsExt};
    use std::process::Command;

    fn is_root() -> bool {
        // SAFETY: getuid is async-signal-safe and has no side effects.
        unsafe { libc::getuid() == 0 }
    }

    #[test]
    fn chown_recursive_does_not_follow_symlinks() {
        // Regression test for RPF cycle-1 H1: a dangling symlink inside the
        // workspace made the old fs::chown (which dereferences) fail with
        // ENOENT, and a symlink to a directory was recursed into. lchown must
        // succeed on the link itself and never descend through it.
        let workspace = SandboxWorkspace::new().expect("create workspace");
        let p = workspace.path().to_path_buf();

        std::os::unix::fs::symlink("/nonexistent/target", p.join("dangling"))
            .expect("create dangling symlink");

        let outside = tempfile::TempDir::new().expect("create outside dir");
        fs::write(outside.path().join("host-file"), b"host data").expect("write outside file");
        std::os::unix::fs::symlink(outside.path(), p.join("escape"))
            .expect("create dir symlink");

        // SAFETY: getuid/getgid are async-signal-safe with no side effects.
        let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
        super::chown_recursive(&p, uid, gid)
            .expect("chown_recursive must tolerate symlinks without following them");

        // The symlink target and its contents must be untouched (still exist,
        // never descended into / chowned via the link).
        assert!(outside.path().join("host-file").exists());
    }

    #[test]
    fn root_chown_recursive_leaves_symlink_target_ownership_unchanged() {
        if !is_root() {
            // Ownership changes require root; the non-root behavioral test
            // above covers the no-follow traversal.
            return;
        }

        let workspace = SandboxWorkspace::new().expect("create workspace");
        let p = workspace.path().to_path_buf();

        let outside = tempfile::TempDir::new().expect("create outside dir");
        let target_file = outside.path().join("host-file");
        fs::write(&target_file, b"host data").expect("write outside file");
        chown(&target_file, Some(65534), Some(65534)).expect("chown outside file");
        chown(outside.path(), Some(65534), Some(65534)).expect("chown outside dir");

        std::os::unix::fs::symlink(outside.path(), p.join("escape"))
            .expect("create dir symlink");

        super::chown_recursive(&p, 0, 0).expect("chown workspace tree");

        let meta = fs::metadata(&target_file).expect("stat outside file");
        use std::os::unix::fs::MetadataExt;
        assert_eq!(
            meta.uid(),
            65534,
            "chown_recursive followed a symlink and changed host file ownership"
        );
    }

    #[test]
    fn workspace_is_removed_after_drop() {
        let path = {
            let workspace = SandboxWorkspace::new().expect("create workspace");
            let p = workspace.path().to_path_buf();
            assert!(p.exists());
            p
        };
        assert!(!path.exists());
    }

    #[test]
    fn sandbox_owned_workspace_is_cleaned_up() {
        if !is_root() {
            // chown to the sandbox uid requires root/CAP_CHOWN; skip on normal dev hosts.
            return;
        }

        let workspace_name = {
            let workspace = SandboxWorkspace::new().expect("create workspace");
            let p = workspace.path().to_path_buf();
            let workspace_name = p
                .file_name()
                .expect("workspace has a directory name")
                .to_string_lossy()
                .to_string();

            let nested = p.join("build");
            fs::create_dir(&nested).expect("create nested dir");
            fs::write(nested.join("out.o"), b"").expect("write artifact");
            fs::write(p.join("solution.py"), b"print(1)").expect("write source");

            chown(&nested, Some(65534), Some(65534)).expect("chown nested dir");
            chown(&nested.join("out.o"), Some(65534), Some(65534)).expect("chown artifact");
            chown(&p.join("solution.py"), Some(65534), Some(65534)).expect("chown source");
            chown(&p, Some(65534), Some(65534)).expect("chown workspace");
            fs::set_permissions(&p, std::fs::Permissions::from_mode(0o700))
                .expect("chmod workspace");

            workspace_name
        };

        let tmp = std::env::temp_dir();
        let remaining: Vec<String> = fs::read_dir(&tmp)
            .expect("read temp dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(".tmp"))
            .collect();

        assert!(
            !remaining.contains(&workspace_name),
            "sandbox-owned workspace leaked: {workspace_name}"
        );
    }

    fn docker_can_reach_temp() -> bool {
        let tmp = std::env::temp_dir();
        let probe_name = format!("judgekit-docker-probe-{}", std::process::id());
        let probe = tmp.join(&probe_name);
        if fs::create_dir(&probe).is_err() {
            return false;
        }
        let mount = format!("{}:/work", tmp.display());
        let target = format!("/work/{}", probe_name);
        let result = Command::new("docker")
            .args([
                "run",
                "--rm",
                "--user",
                "root",
                "-v",
                &mount,
                "alpine:3.21",
                "rm",
                "-rf",
                &target,
            ])
            .output()
            .map(|o| o.status.success() && !probe.exists())
            .unwrap_or(false);
        let _ = fs::remove_dir_all(&probe);
        result
    }

    #[test]
    fn non_root_workspace_is_cleaned_up() {
        if is_root() {
            return;
        }

        let path = {
            let workspace = SandboxWorkspace::new().expect("create workspace");
            let p = workspace.path().to_path_buf();

            let nested = p.join("build");
            fs::create_dir(&nested).expect("create nested dir");
            fs::write(nested.join("out.o"), b"").expect("write artifact");
            fs::write(p.join("solution.py"), b"print(1)").expect("write source");

            // The production Dockerfile runs the worker as uid 1000, so this path
            // exercises the non-root direct-removal branch of Drop.
            p
        };
        assert!(!path.exists());
    }

    #[test]
    fn non_root_sandbox_owned_workspace_is_cleaned_up_via_docker() {
        if is_root() {
            // Root path uses direct chown+remove; this test exercises the non-root docker fallback.
            return;
        }
        if !docker_can_reach_temp() {
            // Privileged container cleanup requires a working Docker socket that can reach /tmp.
            return;
        }

        let workspace_name = {
            let workspace = SandboxWorkspace::new().expect("create workspace");
            let p = workspace.path().to_path_buf();
            let workspace_name = p
                .file_name()
                .expect("workspace has a directory name")
                .to_string_lossy()
                .to_string();

            let nested = p.join("build");
            fs::create_dir(&nested).expect("create nested dir");
            fs::write(nested.join("out.o"), b"").expect("write artifact");
            fs::write(p.join("solution.py"), b"print(1)").expect("write source");

            // Simulate production: the sandbox container writes files as uid 65534,
            // so the worker process (non-root) cannot remove them without the docker fallback.
            let parent = p.parent().expect("workspace has parent");
            let mount = format!("{}:/work", parent.display());
            let target = format!("/work/{}", workspace_name);
            let output = Command::new("docker")
                .args([
                    "run",
                    "--rm",
                    "--user",
                    "root",
                    "-v",
                    &mount,
                    "alpine:3.21",
                    "chown",
                    "-R",
                    "65534:65534",
                    &target,
                ])
                .output()
                .expect("docker chown command");
            assert!(
                output.status.success(),
                "docker chown failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );

            workspace_name
        };

        let tmp = std::env::temp_dir();
        let remaining: Vec<String> = fs::read_dir(&tmp)
            .expect("read temp dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(".tmp"))
            .collect();

        assert!(
            !remaining.contains(&workspace_name),
            "sandbox-owned workspace leaked: {workspace_name}"
        );
    }

    #[test]
    fn docker_cleanup_helper_removes_workspace() {
        if !docker_can_reach_temp() {
            // Privileged container cleanup requires a working Docker socket that can reach /tmp.
            return;
        }

        let workspace = SandboxWorkspace::new().expect("create workspace");
        let p = workspace.path().to_path_buf();

        let nested = p.join("build");
        fs::create_dir(&nested).expect("create nested dir");
        fs::write(nested.join("out.o"), b"").expect("write artifact");

        cleanup_with_docker(&p).expect("docker cleanup should remove workspace");

        assert!(!p.exists());
    }
}
