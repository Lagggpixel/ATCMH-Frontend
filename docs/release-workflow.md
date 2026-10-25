# Web release workflow

ATCMH Frontend and standalone Sweatbox use the same portable Node release helper,
with explicit per-project image and Portainer mappings. Run commands from the
appropriate repository. Build and test natively on Windows/macOS; Docker builds
Linux images locally. The deployment target remains `linux/amd64`, independently
of the developer's CPU. Keep Docker Desktop/WSL and the existing 6 GiB memory cap.

Prerequisites: Node.js 24, installed native dependencies (`npm ci` after lockfile
changes), and a running local Docker Desktop Linux engine with Buildx. Authenticate
Docker to `registry.lagggpixel.com` outside source control: Sweatbox also needs
registry read access for build-only asset preservation, and publication needs
write access. Windows deployment additionally needs PowerShell 7 and the saved
Portainer DPAPI credential described below. Browser hooks need their own installed
browser/testing dependencies.

## Local verification and release gates

```text
npm run release:check -- --dry-run
npm run release:check
npm run release:qa -- --script /absolute/path/to/image-browser-check.mjs
```

`release:check` copies tracked and non-ignored untracked files into a unique,
ignored `build/release/sources/` snapshot. Review untracked files before running.
It rejects symlinks and credential files. It runs every source test and ESLint on
the snapshot concurrently, then builds and loads the production Docker image.
The build runs Next.js's full TypeScript check; there is no extra, duplicate native
`tsc` invocation and no `ignoreBuildErrors` setting. Tests and lint must both pass
before Docker starts. Docker builds should run one at a time across both hosts to
respect the WSL memory cap. Test concurrency remains four.

Keep the checkouts beside each other as `Frontend` and `Simulator`. The shared
simulator file/asset parity check runs before checks, before building, and again
before QA/publication/deployment; differences block release rather than being
automatically overwritten.

Native tests use the checkout's installed `node_modules`; run `npm ci` after
dependency changes. Docker independently installs the exact Linux lockfile.
ATCMH's recorded-audio tests need standalone's existing recording fixture beside
the checkout. `RELEASE_RECORDINGS_FIXTURE` can specify another local copy. The
helper hashes these fixtures and links them only while tests run, removing the
link before Docker starts. It never adds these test fixtures to ATCMH images.

The helper verifies source hashes before/after checks and the frozen snapshot
after tests and build. Receipts and per-step timing/logs live in
`build/release/receipt.json`. Changes to source, configuration, dependency locks,
test fixtures, browser scripts or the checked image invalidate downstream gates.
No successful test result is reused across different source hashes. A failed check
invalidates earlier evidence. A per-checkout lock prevents overlapping release
commands; inspect an interrupted operation before removing a stale
`build/release/lock` directory.

Browser checks remain mandatory. Pass a reviewed Node script that tests the exact
built image, starts any temporary web container without a local database, uses
synthetic identities/data and intercepts production writes. It must fail with a
nonzero exit code on errors. The hook receives:

| Variable | Image QA | Published QA |
| --- | --- | --- |
| `RELEASE_PHASE` | `image` | `published` |
| `RELEASE_IMAGE` | Immutable local image ID | Same verified image ID |
| `RELEASE_IMAGE_ID` | Not supplied; use `RELEASE_IMAGE` | Verified registry image config digest expected on the remote daemon |
| `RELEASE_VERSION` | Expected package version | Expected public version |
| `RELEASE_ORIGIN` | Production origin for identifying the host; start/use the local image for this phase | Public origin to verify |

Choose checks for the affected behavior and desktop/tablet/phone layouts. Retain
the radar/workspace/status-surface regressions for changes affecting those areas,
console/error checks, anonymous authorization gates, static-asset continuity and
retention dry runs. A zero-exit empty script is not meaningful browser QA. This
workflow intentionally requires a task-appropriate script; it does not replace
feature verification with a health request or claim native Safari/iPad coverage.

## Publish the checked image, then deploy

Only run these commands during an authorized release. Update both package/lock
versions first using the current Europe/London `YY.M.patch` convention; never
reuse a published version.

```text
npm run release:publish -- --dry-run
npm run release:publish
npm run release:deploy -- --dry-run
npm run release:deploy -- --script /absolute/path/to/published-browser-check.mjs
```

Publication requires unchanged checks and browser QA, tags the checked immutable
image ID and pushes versioned/latest tags without rebuilding. It refuses an
existing version or ambiguous registry errors, then verifies registry manifest,
version/latest digests and image ID. If a push partly succeeds, inspect the
registry and receipt; do not rerun blindly or reuse the version. A fresh release
version may be needed. Keep the checked local image until deployment completes.

Deployment uses PowerShell 7 on this Windows account because the saved credential
is DPAPI-bound. macOS supports verification, Docker builds and publication; use
this Windows account/checkout for the saved-credential deployment path. A separate
macOS credential mechanism is not introduced here.

The deployment helper rechecks endpoint **3** (`local`, remote Linux/amd64), stack
identity, preceding web/retention image references and concurrent configuration
changes. It saves and round-trip-verifies encrypted stack/container recovery under
`Documents/Codex/releases/<stack>/<version>/before.clixml`, outside Git. The key is
loaded from the established DPAPI credential and used only in an HTTPS header.
Never print decrypted snapshots, headers or raw credential-bearing API responses.

It changes only expected image lines, preserves all other Compose content and
environment values, requests a fresh pull with `Prune=false`, and verifies image
IDs, running state, health, restarts/OOM, other stack services, unrelated containers
and public health/version. The supplied published-browser hook must then pass
before the overall deployment is recorded complete. The helper does not roll
back automatically after a verification failure; preserve the encrypted recovery
and inspect state. It refuses existing recovery files/redeployments, so an
interrupted deployment requires inspection rather than an automatic retry.

| Host | Image | Stack / endpoint | Updated services |
| --- | --- | --- | --- |
| ATCMH | `registry.lagggpixel.com/atcmh-frontend` | 30 `atcmh` / 3 | `atcmh-frontend` |
| Sweatbox | `registry.lagggpixel.com/sweatbox` | 66 `sweatbox` / 3 | `sweatbox`, `sweatbox-retention` |

ATCMH retention stays pinned to its existing version. Backend, private speech,
navigation provider, shared datasets, databases and other stacks are outside this
web workflow. Schema/data migrations still need their own reviewed backup and
deployment sequence before consumers are started. No migrations run implicitly.

## Faster local Docker builds

Existing `npm run docker:push`, `docker:build:windows` and `docker:build:mac` remain.
`npm run docker:build` is build-only; `npm run docker:push` still builds/pushes only
and never deploys. Each supports `-- --dry-run`. Use these helpers instead of
invoking the Dockerfile directly: they provide a named `dependency-manifests`
build context containing normalized package/lock manifests.

Only application root version metadata is normalized to `0.0.0` for dependency
installation. Dependency versions, integrities, scripts and overrides remain
intact. The original manifests are restored by the builder's source copy, so the
application/image version remains authoritative. Version-only releases reuse the
`npm ci` layer. Real dependency/install-script changes invalidate it. A BuildKit
npm cache speeds real reinstalls, and a separate per-host Linux compiler cache at
`.next/cache` persists across builds. Cache mounts use `sharing=locked`; no cache
mount is copied into the runtime image. Clearing Docker build cache remains safe
and merely makes the next build cold. Persistent datasets retain their existing
delivery; this change performs no asset migration.

For both hosts, run their check/QA phases and publish both checked images before
deploying either. Keep Docker builds sequential under the current memory cap.
Do not rebuild after QA just to publish. If backend/provider support is also
changing, complete its existing independent checks and release it before these
web consumers.
