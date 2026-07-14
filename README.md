# ATCMH Exams

The ATCMH Exams service owns [https://exams.atcmh.org/](https://exams.atcmh.org/).

## Local development

```bash
npm install
npm run dev
```

Run the quality and production-build checks with:

```bash
npm run lint
npm run build
```

The health endpoint is available at `GET /api/health` and returns:

```json
{ "status": "ok" }
```

## Central authentication

Discord and Infinite Flight login are owned by Dashboard-Backend. Configure
`DASHBOARD_API_URL`, a dedicated `EXAMS_AUTH_KEY`, `EXAMS_CSRF_SECRET` (at
least 32 characters), and the public `APP_BASE_URL`. Exams exchanges a one-use
handoff for an opaque 30-day session and introspects it before every protected
learner or management operation. The browser never receives provider tokens.

`EXAMS_AUTH_KEY` must be different from `EXAMS_AUDIT_INGEST_KEY`. The audit
client uses only `EXAMS_AUDIT_INGEST_URL` and `EXAMS_AUDIT_INGEST_KEY`.

## Management import safety

Learner reads and management writes use the `MYSQL_HOST`, `MYSQL_PORT`,
`MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` variables.
`MYSQL_DATABASE` must be `atcmh_lms`. Grant this account only the required
`SELECT`, `INSERT`, and `UPDATE` access to the existing quiz tables and import
audit tables; do not grant schema changes or general application access.
Before enabling management imports, apply the additive
`sql/2026-07-10-exam-import-audit.sql` migration through the normal deployment
process.

Imports are disabled unless `EXAMS_MANAGEMENT_WRITES_ENABLED=true`. Enabling
them also requires a random `IMPORT_IDEMPOTENCY_SECRET` of at least 32
characters. A preview creates a server-stored, actor- and payload-bound nonce
that expires after `EXAMS_IMPORT_PREVIEW_TTL_SECONDS` (default 900 seconds) and
is consumed in the same transaction as the import. A preview can never be
forged, replayed, or committed by a different Discord identity.

## Docker

Build and run the production image locally:

```bash
docker build -f .dockerfile -t atcmh-exams:local .
docker run --rm -p 3000:3000 atcmh-exams:local
```
