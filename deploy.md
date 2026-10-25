# Deploy the ATCMH Frontend

The Frontend is one standalone Next.js service for `www.atcmh.org`. Dashboard-Backend remains a separate Java service at `dashboard-api.atcmh.org` and continues to own OAuth callbacks, Dashboard APIs, central authentication, consent, and the Discord bot. The bare `atcmh.org` host redirects permanently to the matching path and query on `www.atcmh.org`.

## Production routes

- Marketing and legal: `/`, `/terms`, `/policy`
- Shared identity: `/auth`, `/account`, `/consent`
- Dashboard: `/dashboard` and descendants
- Leaderboard: `/leaderboard`
- Exam Center: `/exams` and descendants
- Course learning UI: `/exams/courses` and descendants; its data and mutations are served by Dashboard-Backend at `/courses` and `/admin/courses`
- Exams handlers: `/exams/api/auth/*`, `/exams/api/management/*`, `/exams/api/quizzes/*`
- Health: `/api/health`

There is intentionally no `/apply` route.

## Runtime configuration

Use `.env.example` as the Frontend variable inventory. Production requires:

```env
FRONTEND_PUBLIC_ORIGIN=https://www.atcmh.org
DASHBOARD_API_URL=https://dashboard-api.atcmh.org
DASHBOARD_AUTH_URL=https://dashboard-api.atcmh.org
EXAMS_AUDIT_INGEST_URL=https://dashboard-api.atcmh.org
APPLICATION_IFC_RESULT_SECRET=<shared server-only value, at least 32 random bytes>
```

Supply the MySQL, shared-session, Discord role, import, and audit values through the runtime environment. Keep these rules:

- Add `INFINITE_FLIGHT_API_KEY` to the Portainer stack environment; the backend will not deploy when it is blank.
- Set `MYSQL_PORT=3306` unless the selected MySQL service explicitly uses another port.
- Never pass secrets through Docker build arguments or `NEXT_PUBLIC_*` variables.
- Use a least-privilege MySQL account for the Exams tables.
- `EXAMS_AUTH_KEY` must match Dashboard-Backend's handoff key.
- `EXAMS_AUDIT_INGEST_KEY` must match Dashboard-Backend's audit-ingest key and must differ from `EXAMS_AUTH_KEY`.
- `APPLICATION_IFC_RESULT_SECRET` must be the same independent server-only value in Frontend and Dashboard-Backend. It signs short-lived `/link-results` outcomes and must never use a `NEXT_PUBLIC_*` name.
- `EXAMS_CSRF_SECRET` must be the same server-only value in Frontend and Dashboard-Backend; the backend validates the HMAC token returned by the shared session route for course completion and management writes.
- Apply Dashboard-Backend's `sql/2026-08-25-courses.sql` to `MYSQL_LMS_DATABASE` before using Course Center or learner courses. The backend may also use `MYSQL_LMS_URL` when the LMS schema is not derived from `MYSQL_URL`.
- Keep `EXAMS_MANAGEMENT_WRITES_ENABLED=false` until database migrations and staff write checks are complete.
- Use strong independent values for `EXAMS_LEARNER_SESSION_SECRET` and `IMPORT_IDEMPOTENCY_SECRET`.

Dashboard-Backend must use:

```env
FRONTEND_PUBLIC_ORIGIN=https://www.atcmh.org
DASHBOARD_PUBLIC_URL=https://www.atcmh.org/dashboard
EXAMS_PUBLIC_URL=https://www.atcmh.org/exams
ALLOWED_ORIGINS=https://www.atcmh.org
DISCORD_OAUTH_REDIRECT_URI=https://dashboard-api.atcmh.org/auth/callback/discord
IFC_OAUTH_REDIRECT_URI=https://dashboard-api.atcmh.org/auth/callback/ifc
IFC_OAUTH_PUBLIC_BASE_URL=https://dashboard-api.atcmh.org
```

Production OAuth callback registrations remain on `dashboard-api.atcmh.org`.

## Build and publish

From the `Frontend` directory, publish the version in `package.json` plus the `latest` tag with:

```bash
npm run docker:push
```

Use the [checked-image release workflow](docs/release-workflow.md) for releases:
`release:check`, `release:qa`, `release:publish`, then `release:deploy`. It builds
locally for `linux/amd64` once, retains every required check, and publishes the
verified image without another compilation. `npm run docker:build` is build-only.
All commands support `-- --dry-run`. Use the portable Node helpers rather than
calling the Dockerfile directly: they supply its dependency-manifest context.

Increment the immutable version tag for every release. Production Compose should reference the versioned tag, not `latest`. The image runs the standalone Next server as the non-root `nextjs` user on port `3000`; its container healthcheck requests `/api/health`.

When backend changes are part of the authorized release, publish its independently
checked image using the version in `Backend/gradle.properties` before updating the
stack. Unchanged backend images do not need rebuilding for a web-only release:

```bash
cd Backend
./gradlew pushImage
```

The checked-image workflow runs the full source test suite, source/script lint,
shared-file parity and production TypeScript/build from a frozen source snapshot.
It requires built-image browser QA before publication and published-browser QA
after deployment. Run `npm ci` after native dependency changes and
`git diff --check` before committing. See the workflow guide for browser hooks,
registry access, timing logs and encrypted recovery.

Do not publish if the committed tree or image contains an environment file, credential, local dump, build cache, transcript, or Git metadata.

## Compose deployment

`Backend/docker-compose.yml` records the application services; the live Portainer
stack remains authoritative. Revalidate endpoint **3** and stack **30** (`atcmh`)
before changes. Preserve its current configuration, environment, volumes and
networks. The frontend uses:

- `atcmh-frontend` using `registry.lagggpixel.com/atcmh-frontend:<version>`
- internal port `3000`
- Traefik serving `www.atcmh.org` and permanently redirecting bare `atcmh.org` while preserving paths and queries
- the `/api/health` healthcheck
- all Frontend secrets as runtime environment references

Use `npm run release:deploy -- --script <published-browser-check.mjs>` on the
credential-owning Windows account after successful publication. This requests a
fresh pull through the remote Portainer API and verifies configuration, image
identity, health and public version. Origin/auth-return changes involving both
services still require their separately reviewed combined deployment sequence.

## Release checks

Verify, in order:

Use synthetic identities/data and intercepted writes for browser regression
checks. Production submissions or training-data changes require their own task
authorization.

1. `/`, `/terms`, `/policy`, and `/leaderboard` load on the canonical origin.
2. The home Login modal completes Discord and Infinite Flight login.
3. Dashboard login, consent, Account, permission-gated navigation, logout, and a representative staff mutation work.
4. Main-site login returns to Exam Center, the internal one-use callback bootstrap creates the shared session, and learner quiz start/submission/result work.
5. Staff Exams management respects Discord capabilities, CSRF, exact Origin validation, and the management-write flag.
6. Impersonation and audit events attribute the real administrator.
7. Browser console and mobile navigation are clean.

Existing host-only Exams cookies on `atcmh.org`, `dashboard.atcmh.org`, or `exams.atcmh.org` cannot migrate to `www.atcmh.org`; affected users must sign in again after cutover.

Privacy Policy revision `2026-07-14.1` changes the canonical Website reference. Its registered content hash also changes, so existing users must complete policy consent again before a new session is issued.

## Redirects

Keep query strings when configuring external redirects:

- `atcmh.org/*` → the matching path and query on `https://www.atcmh.org/*` with HTTP 308
- `dashboard.atcmh.org/admin/*` → `https://www.atcmh.org/dashboard/*`
- Dashboard `/`, `/home` → `https://www.atcmh.org/dashboard`
- Dashboard `/account`, `/auth`, `/consent` → the matching canonical path on `www.atcmh.org`
- `exams.atcmh.org/*` → `https://www.atcmh.org/exams/*`

## Rollback

Keep the actual preceding pinned images and encrypted pre-deployment stack
snapshot until verification completes. Inspect the saved recovery before an
authorized rollback; do not substitute historical example versions. If cutover fails:

1. Restore the previous pinned image references and Compose configuration.
2. Redeploy the previous Frontend/backend pair together if auth origins changed.
3. Verify the old health endpoints and authentication flows.
4. Disable Exams management writes if the failure involves imports or mutations.

Do not reverse database migrations automatically or delete the old frontend repositories as part of application rollback.
