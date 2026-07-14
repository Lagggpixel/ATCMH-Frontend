# Run the ATCMH Frontend locally

The unified Frontend is a Next.js 16 application serving the marketing site, shared account pages, Dashboard, Leaderboard, and Exam Center. It expects Dashboard-Backend to remain a separate service.

## Prerequisites

- Node.js 24 and npm
- Dashboard-Backend reachable on `http://localhost:3001` for login, Dashboard data, consent, and audit delivery
- A development or non-production copy of the Exams MySQL database
- Localhost callback registrations in the Discord and Infinite Flight developer configurations

Do not use production database credentials for local development. Use a dedicated least-privilege account and leave Exams management writes disabled unless a write test is intentional.

## Frontend environment

From the `Frontend` directory:

```bash
cp .env.example .env.local
npm ci
```

Keep these local values:

```env
FRONTEND_PUBLIC_ORIGIN=http://localhost:3000
DASHBOARD_API_URL=http://localhost:3001
DASHBOARD_AUTH_URL=http://localhost:3001
EXAMS_AUDIT_INGEST_URL=http://localhost:3001
EXAMS_MANAGEMENT_WRITES_ENABLED=false
```

Fill in the MySQL, Exams session, Discord, import, and audit values documented in `.env.example`. Never put secrets in a `NEXT_PUBLIC_*` variable.

## Backend environment

Run Dashboard-Backend on host port `3001` and configure:

```env
FRONTEND_PUBLIC_ORIGIN=http://localhost:3000
DASHBOARD_PUBLIC_URL=http://localhost:3000/dashboard
EXAMS_PUBLIC_URL=http://localhost:3000/exams
ALLOWED_ORIGINS=http://localhost:3000
DISCORD_OAUTH_REDIRECT_URI=http://localhost:3001/auth/callback/discord
IFC_OAUTH_REDIRECT_URI=http://localhost:3001/auth/callback/ifc
IFC_OAUTH_PUBLIC_BASE_URL=http://localhost:3001
```

Dashboard-Backend listens on container port `3000`. Its `docker-compose.local.yml` maps `127.0.0.1:3001` to that port. If you use the Compose configuration, run it from `Dashboard-Backend` with the production Compose file and local override, and select only the backend service when the Next development server will run separately:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up atcmh-dashboard-backend
```

The Compose deployment expects its external `internal` network, database hostname, and required secrets to exist. If those are unavailable on your development machine, run an equivalent backend container with `3001:3000` port mapping and point `MYSQL_URL` at the development database.

Register these exact callback URLs with both identity providers:

- `http://localhost:3001/auth/callback/discord`
- `http://localhost:3001/auth/callback/ifc`

Use `localhost` consistently. Do not mix it with `127.0.0.1`, because origin and cookie checks are exact.

## Start and verify

Start the Frontend:

```bash
npm run dev
```

Open `http://localhost:3000`. Useful routes include:

- `/` — marketing site and the only signed-out Login control
- `/leaderboard` — public attendance leaderboard
- `/dashboard` — staff Dashboard, protected by live backend authorization
- `/exams` — public Exam Center
- `/account` and `/consent` — shared identity pages
- `/api/health` — application health check

Run the local verification suite:

```bash
npm test
npm run lint
npm run build
```

After a production build, `npm run dev` uses `.next-dev` rather than `.next`; this prevents stale production proxy output from contaminating development. Development CSP permits React's debugging `eval()` support, while production CSP does not.

## Authentication checks

Verify both Discord and Infinite Flight login from the home modal. Confirm that:

1. Dashboard login returns to the requested `/dashboard` or `/account` path.
2. Exams login returns to the requested `/exams` path and creates the separate Exams session.
3. A signed-in non-admin receives the themed Dashboard 403 page.
4. Dashboard navigation appears only after `/admin/me` confirms staff access.
5. Logout clears the appropriate session without weakening the other application audience.

