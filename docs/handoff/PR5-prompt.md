# PR 5 of 5 — CI workflow

You are continuing the **server-probe** project for `first2apply`. PRs 1-4 are merged. PR 5 is the last — it gates future PRs on tests + image build + runtime smoke.

## Step 1 — Load context

Read these in order:

1. `docs/plans/2026-04-27-server-probe-design.md` — PR 5's scope is in §5.PR-5 + §4.1 (build pipeline).
2. `decisions.md` — recent entries.
3. `apps/serverProbe/Dockerfile`, `apps/serverProbe/entrypoint.sh` — these are what CI builds.
4. `package.json` (root), `pnpm-workspace.yaml` — workspace setup.
5. `apps/nodeBackend/package.json`, `apps/invoiceDownloader/package.json` — both have `exit 1` test scripts that will break `nx run-many -t test`. PR 5 either excludes them or replaces with `echo 'noop'`.
6. `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/project_session_bootstrap.md`.

## Step 2 — Verify PR 4 state + branch

```bash
gh pr list --state open
# Merge PR 4 if open, then:
git checkout master && git pull --ff-only origin master
git checkout -b feat/pr5-ci
```

## Step 3 — Ship PR 5

### 3a. `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npx nx run-many -t typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npx nx run-many -t test --exclude=@first2apply/node-backend,@first2apply/invoice-downloader

  build-server-probe-image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: |
          cd libraries/core && npm run build && cd ../..
          cd libraries/scraper && npm run build && cd ../..
          cd apps/serverProbe && npm run build && cd ../..
      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/serverProbe/Dockerfile
          platforms: linux/arm64
          load: true
          tags: f2a-server-probe:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max

  runtime-smoke-server-probe:
    needs: build-server-probe-image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - name: Restore image from build job cache
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/serverProbe/Dockerfile
          platforms: linux/arm64
          load: true
          tags: f2a-server-probe:ci
          cache-from: type=gha
      - run: docker run --rm f2a-server-probe:ci --selftest
```

Note: `runtime-smoke` rebuilds via cache rather than carrying the image across jobs. Cleaner alternative is `actions/upload-artifact` between jobs but cache-restore is simpler.

### 3b. `.github/workflows/release.yml`

Push images to GHCR only on master merges:

```yaml
name: Release

on:
  push:
    branches: [master]

jobs:
  push-server-probe-image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: |
          cd libraries/core && npm run build && cd ../..
          cd libraries/scraper && npm run build && cd ../..
          cd apps/serverProbe && npm run build && cd ../..
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/serverProbe/Dockerfile
          platforms: linux/arm64
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/f2a-server-probe:latest
            ghcr.io/${{ github.repository_owner }}/f2a-server-probe:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 3c. Fix the `exit 1` test scripts

Edit `apps/nodeBackend/package.json` and `apps/invoiceDownloader/package.json` — change the `test` script from:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```
to:
```json
"test": "echo 'test: noop'"
```

Now `nx run-many -t test` works without `--exclude`. Update the workflow accordingly to drop the `--exclude` flag.

### 3d. `CODEOWNERS`

```
# .github/CODEOWNERS
*       @jacobaguon-blip
```

### 3e. PR template

`.github/PULL_REQUEST_TEMPLATE.md`:

```md
## Summary

## Test plan
- [ ]
- [ ]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 3f. Verify locally

```bash
# Verify the test exclusions land cleanly
npx nx run-many -t test 2>&1 | tail
# Verify typecheck across all projects
npx nx run-many -t typecheck 2>&1 | tail
```

Both should succeed. The `test` job in CI uses `nx run-many` and will fail if either of these fails locally.

You can validate the workflows by pushing the branch and watching the GHA Actions tab. The CI will run on the PR itself.

### 3g. Commit, push, PR

```bash
git add -A
git commit -m "feat(ci): GitHub Actions CI + release workflows (PR 5 of 5) ..."
git push -u origin feat/pr5-ci
gh pr create --base master --title "feat(ci): GitHub Actions CI + release (PR 5 of 5)" --body "..."
```

## Step 4 — After CI passes + merge

Once CI is green and PR 5 merges, the server-probe is **ready for go-live**.

The Pi go-live procedure (NOT a PR — manual):

```bash
ssh pi
echo $PAT | docker login ghcr.io -u <github-user> --password-stdin
sudo bash /opt/first2apply/deploy/deploy.sh
sudo systemctl enable f2a-server-probe.service
journalctl -u f2a-server-probe -f
```

**The user does this themselves** — don't run go-live from this prompt.

## Step 5 — Log + final handoff

1. Append a final entry to `decisions.md`: "Server-probe project complete: PRs 1-5 merged. Ready for Pi go-live."
2. Update memory: server-probe is done; only manual go-live remains.
3. Prompt the user:
   > "PR 5 (#XX) shipped — CI + release workflows. Server-probe project is complete: 5 PRs merged. **Run go-live manually on the Pi** (see `deploy/pi/deploy.sh` + the procedure in `docs/plans/2026-04-27-server-probe-design.md` §5.Post-merge)."

## Acceptance criteria

- [ ] `.github/workflows/ci.yml` exists and runs the four jobs
- [ ] `.github/workflows/release.yml` exists and pushes to GHCR on master merges only
- [ ] `apps/nodeBackend` + `apps/invoiceDownloader` test scripts changed from `exit 1` to noop echo
- [ ] CODEOWNERS + PR template added
- [ ] `nx run-many -t typecheck` clean locally
- [ ] `nx run-many -t test` clean locally
- [ ] CI green on the PR itself
- [ ] decisions.md + memory updated
