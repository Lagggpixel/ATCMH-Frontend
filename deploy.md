# Deploy the ATCMH Frontend

The Frontend is one standalone Next.js service for `www.atcmh.org`. Dashboard-Backend remains a separate Java service at `dashboard-api.atcmh.org` and continues to own OAuth callbacks, Dashboard APIs, central authentication, consent, and the Discord bot. The bare `atcmh.org` host redirects permanently to the matching path and query on `www.atcmh.org`.

## Production routes

- Marketing and legal: `/`, `/terms`, `/policy`
- Shared identity: `/auth`, `/account`, `/consent`
- Dashboard: `/dashboard` and descendants
- Leaderboard: `/leaderboard`
- Exam Center: `/exams` and descendants
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
```

Supply the MySQL, Exams session, Discord role, import, and audit values through the runtime environment. Keep these rules:

- Add `INFINITE_FLIGHT_API_KEY` to the Portainer stack environment; the backend will not deploy when it is blank.
- Set `MYSQL_PORT=3306` unless the selected MySQL service explicitly uses another port.
- Never pass secrets through Docker build arguments or `NEXT_PUBLIC_*` variables.
- Use a least-privilege MySQL account for the Exams tables.
- `EXAMS_AUTH_KEY` must match Dashboard-Backend's handoff key.
- `EXAMS_AUDIT_INGEST_KEY` must match Dashboard-Backend's audit-ingest key and must differ from `EXAMS_AUTH_KEY`.
- Keep `EXAMS_MANAGEMENT_WRITES_ENABLED=false` until database migrations and staff write checks are complete.
- Use strong independent values for `EXAMS_CSRF_SECRET`, `EXAMS_LEARNER_SESSION_SECRET`, and `IMPORT_IDEMPOTENCY_SECRET`.

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

The equivalent command from the directory containing `Frontend` is:

```bash
docker buildx build \
  -f Frontend/.dockerfile \
  --platform linux/amd64,linux/arm64 \
  -t registry.lagggpixel.com/atcmh-frontend:1.0.1 \
  -t registry.lagggpixel.com/atcmh-frontend:latest \
  Frontend \
  --push
```

Increment the immutable version tag for every release. Production Compose should reference the versioned tag, not `latest`. The image runs the standalone Next server as the non-root `nextjs` user on port `3000`; its container healthcheck requests `/api/health`.

Publish the matching backend `2.8.1` image before updating the stack:

```bash
cd Dashboard-Backend
./gradlew pushImage
```

Before publishing, run:

```bash
cd Frontend
npm ci
npm test
npm run lint
npm run build
git diff --check
```

Do not publish if the committed tree or image contains an environment file, credential, local dump, build cache, transcript, or Git metadata.

## Compose deployment

`Dashboard-Backend/docker-compose.yml` defines:

- `atcmh-frontend` using `registry.lagggpixel.com/atcmh-frontend:<version>`
- internal port `3000`
- Traefik serving `www.atcmh.org` and permanently redirecting bare `atcmh.org` while preserving paths and queries
- the `/api/health` healthcheck
- all Frontend secrets as runtime environment references

Deploy the pinned Frontend and backend images together when origin or auth-return configuration changes:

```bash
cd Dashboard-Backend
docker compose pull atcmh-dashboard-backend atcmh-frontend
docker compose up -d --no-deps atcmh-dashboard-backend atcmh-frontend
docker compose ps atcmh-dashboard-backend atcmh-frontend
curl -fsS https://www.atcmh.org/api/health
```

## Release checks

Verify, in order:

1. `/`, `/terms`, `/policy`, and `/leaderboard` load on the canonical origin.
2. The home Login modal completes Discord and Infinite Flight login.
3. Dashboard login, consent, Account, permission-gated navigation, logout, and a representative staff mutation work.
4. Exams handoff, one-use callback behavior, learner quiz start/submission/result, and `/exams` cookie scoping work.
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

Keep the previous pinned Frontend `1.0.0` and backend `2.8.0` images and the previous Compose definition until production parity is confirmed. If cutover fails:

1. Restore the previous pinned image references and Compose configuration.
2. Redeploy the previous Frontend/backend pair together if auth origins changed.
3. Verify the old health endpoints and authentication flows.
4. Disable Exams management writes if the failure involves imports or mutations.

Do not reverse database migrations automatically or delete the old frontend repositories as part of application rollback.
