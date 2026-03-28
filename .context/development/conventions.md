# Conventions

- Semantic commits: `<type>(<scope>): <gitmoji> <description>`
- GPG-signed commits with gitminer (7 leading zeros)
- Fine-grained commits (one per feature/fix)
- Commit and push immediately after every iteration, enhancement, or fix — do not batch changes
- Always `git pull --rebase` before `git push`
- Every commit MUST include relevant tests (see Testing Rules in AGENTS.md)

## Deployment

### Test server (oj-internal.maum.ai)
- **Always deploy WITHOUT minification** so client-side errors produce readable stack traces.
- Pass `DISABLE_MINIFY=1` when deploying:
  ```bash
  DISABLE_MINIFY=1 SSH_PASSWORD='mcl1234~' ./deploy-docker.sh
  ```
- This sets `--build-arg DISABLE_MINIFY=1` during `docker build`, which disables webpack minimize and enables `productionBrowserSourceMaps`.

### Production server (oj.auraedu.me)
- Deploy with default settings (minified, no source maps).
- See `ENV.md` for credentials and deployment commands.
