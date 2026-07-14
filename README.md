# ATCMH Frontend

The unified ATCMH frontend is a Next.js 16 App Router application containing
the public website, Dashboard, and Exams. It replaces the separate RootSite,
Dashboard, and Exams frontend deployments while continuing to use
Dashboard-Backend for central authentication and Dashboard APIs.

## Local development

Requires Node.js 24 and npm. Copy the example environment and fill in any
credentials needed for the flows you are exercising:

```bash
cp .env.example .env.local
npm ci
npm run dev
```

The development defaults are `http://localhost:3000` for the frontend and
`http://localhost:3001` for Dashboard-Backend. Validate a change with:

```bash
npm test
npm run lint
npm run build
```

Vite remains a development-only dependency because two Node component tests
use its middleware-mode SSR loader to transform migrated Dashboard TSX and
resolve the `@` alias. The application itself is built and served by Next.js.

## Routes

- Marketing and legal: `/`, `/terms`, `/policy`
- Shared identity: `/auth`, `/account`, `/consent`
- Dashboard: `/dashboard` and its staff/account routes
- Exams UI: `/exams`, including quizzes and attempts
- Exams API: `/exams/api/auth/*`, `/exams/api/management/*`, and
  `/exams/api/quizzes/*`
- Healthcheck: `GET /api/health`

There is intentionally no `/apply` route. Dashboard calls Exams through the
same-origin `/exams/api` routes.

## Runtime configuration

Use `.env.example` as the deployment inventory. The two public runtime values
are:

- `FRONTEND_PUBLIC_ORIGIN`: the canonical origin serving this application
- `DASHBOARD_API_URL`: the Dashboard-Backend origin

`DASHBOARD_AUTH_URL` remains in `.env.example` only as a compatibility alias
for shared deployment inventories. This application does not read it;
`DASHBOARD_API_URL` is authoritative and both should point to the same backend
during cutover. `EXAMS_AUDIT_INGEST_URL` also points to Dashboard-Backend, but
is used only for server-side audit delivery.

Both are required in production and are validated fail-closed. They are safe
to pass to the Dashboard browser bundle through server-rendered configuration;
all other values are server-only credentials or feature settings. Do not put
secrets in `NEXT_PUBLIC_*` variables or Docker build arguments. Other variables
from the retired standalone frontends are not supported.

Exams authentication requires `EXAMS_AUTH_KEY`, `EXAMS_CSRF_SECRET`, and
`EXAMS_LEARNER_SESSION_SECRET`. Discord authorization, MySQL access, import
controls, and audit delivery use the corresponding groups in `.env.example`.
Management writes stay disabled unless
`EXAMS_MANAGEMENT_WRITES_ENABLED=true`; enabling them also requires a strong
`IMPORT_IDEMPOTENCY_SECRET` and the import-audit migration to be applied.

## Deployment

Build the standalone, non-root production image with:

```bash
docker build -f .dockerfile -t atcmh-frontend:local .
docker run --rm --env-file .env.production -p 3000:3000 atcmh-frontend:local
```

Supply runtime variables to the container rather than embedding them in the
image. The container healthcheck probes `/api/health` on port 3000.

For cutover:

1. Configure the production environment and required database migration.
2. Deploy the unified image and verify health, public pages, central login,
   Dashboard authorization, and an Exams session on the canonical origin.
3. Point public traffic at the unified service and update external redirects
   or bookmarks from legacy roots to `/dashboard` and `/exams` as needed.
4. Retire the legacy frontend deployments only after authenticated smoke tests
   pass; Dashboard-Backend remains a separate service.
