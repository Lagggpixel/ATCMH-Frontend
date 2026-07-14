# Exams and Dashboard Exam Center rollout

This runbook releases staff management and the learner attempt flow against the
existing `atcmh_lms` system of record. The learner flow requires the reviewed,
targeted nullable-answer migration below; do not perform any other import or
schema repair as part of this procedure.

## Preconditions

1. Build the `Exams` image with its existing learner routes enabled and stage it
   in the deployment registry. Do not deploy the image until the migration and
   post-migration column verification below have completed successfully. After
   deployment, the health check is `GET https://exams.atcmh.org/api/health` and
   must return `200` with `{ "status": "ok" }`.
2. Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and
   `MYSQL_DATABASE=atcmh_lms` for the service MySQL account. Grant only the
   required `SELECT`, `INSERT`, and `UPDATE` permissions on existing quiz and
   import-audit tables; do not grant schema changes or general application
   access. These runtime credentials must remain least-privileged and must not
   be used to apply migrations.
3. Run the read-only preflight from the exact release artifact or the checked
   out `Exams` directory:

   ```bash
   npm run verify:lms-contract
   ```

   It checks required tables, their required columns, primary-key shapes, row
   counts, and the legacy result-link prerequisite that `attempts.code` is
   `VARCHAR(32) NOT NULL` with a single-column unique index. It issues only
   `SELECT` statements and exits nonzero on schema
   drift, unavailable data, or missing required production data. Stop the
   rollout if it fails; do not repair production from this command.

   The production read-only audit for this release found 426 attempt rows and
   426 distinct codes; every code was exactly 32 lowercase hexadecimal
   characters. The column uses a case-insensitive collation. No migration is
   required for legacy attempt codes: the application accepts either hex case
   in incoming links and canonicalizes code lookups to lowercase. Treat the
   verifier as the release gate if production changes after that audit.
4. Configure Discord role settings in `Exams`: `DISCORD_GUILD_ID`,
   `DISCORD_BOT_TOKEN`, `DISCORD_MENTOR_ROLE_IDS`, and
   `DISCORD_ADMIN_ROLE_IDS`. Map both the established practical mentor role and
   moderator role into `DISCORD_MENTOR_ROLE_IDS`; this is the private-quiz and
   manage-exams tier. Reserve `DISCORD_ADMIN_ROLE_IDS` for true administrator
   roles only. Put the established super-administrator user ID in
   the comma-separated `DISCORD_ADMIN_USER_IDS` value when that account does
   not hold one of those roles. Keep all deployment-specific IDs in environment
   configuration, never in application logic. Authorization remains
   server-side: Dashboard roles and requests cannot grant access.
5. Set `VITE_EXAMS_API_URL=https://exams.atcmh.org` in Dashboard. Keep
   `VITE_EXAMS_CENTER_ENABLED=false` until the pilot succeeds.
6. Permit credentialed API CORS only for `https://dashboard.atcmh.org` (and the
   explicit local-development origin where appropriate). Never configure `*`.

## Learner attempt configuration

Configure the learner flow with central authentication and these server-side
values:

```env
APP_BASE_URL=https://exams.atcmh.org
DASHBOARD_API_URL=https://dashboard-api.atcmh.org
EXAMS_AUTH_KEY=<dedicated random service key>
EXAMS_CSRF_SECRET=<at least 32 random characters>
EXAMS_AUDIT_INGEST_URL=https://dashboard-api.atcmh.org
EXAMS_AUDIT_INGEST_KEY=<separate audit-only key>
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

The auth key and audit key must be different. Dashboard-Backend must expose the
service-authenticated handoff exchange, introspection, logout, and logout-all
contracts before this image is enabled. Verify a handoff is accepted once and
then rejected on replay. Verify a revoked or suspended central session loses
quiz and management access immediately.

`APP_BASE_URL` is mandatory in production and must be the public Exams origin.
The application uses it for browser redirects and links, including post-login,
quiz-start, and Discord result links; never set it to a Docker service hostname
or reverse-proxy origin. `DISCORD_WEBHOOK_URL` is optional: when it is blank, attempt
submission still succeeds and notification delivery is skipped. Keep the
webhook URL server-only and out of browser configuration and logs.

Attempt data is committed before Discord delivery begins. Webhook delivery is
best-effort and non-blocking with respect to the saved result: a non-2xx
response, timeout, network error, or Discord outage logs a sanitized warning
but does not roll back or fail the committed attempt. There is no automatic
webhook retry or notification queue.

## Safe enablement sequence

1. Take and verify a restorable backup of `atcmh_lms`. The learner attempt
   release uses the original `attempts` and `attempt_answers` layout and does
   not require an attempt-schema migration. Unanswered questions intentionally
   have no `attempt_answers` row so `selected_option_id` can remain non-null.
2. Deploy Exams with management writes disabled:

   ```env
   EXAMS_MANAGEMENT_WRITES_ENABLED=false
   ```

   Confirm the health endpoint, learner catalogue, quiz detail, a fully answered
   submission, an unanswered-question submission, and the learner's own result
   page work against existing data. Verify a private quiz remains hidden until
   its existing `quiz_unlocks` row is present.
3. Sign in as a designated administrator and call the management identity
   endpoint. Confirm it reports administrator capabilities from Discord; do
   not accept a Dashboard-provided role.
4. Enable `VITE_EXAMS_CENTER_ENABLED=true` only in the Dashboard pilot
   deployment. Confirm an administrator sees global actions and a mentor does
   not see administrator-only controls.
5. With a mentor, verify owned-quiz editing/import preview, learner unlock, and
   attempt review. Confirm the mentor cannot operate on another mentor's quiz.
6. With an administrator, verify cross-owner management and category/tag
   controls. Keep imports in preview mode during the initial pilot.
7. Before enabling import commits, review and apply the additive
   `sql/2026-07-10-exam-import-audit.sql` migration through the normal
   database-change process. Supply an `IMPORT_IDEMPOTENCY_SECRET` of at least
   32 random characters, then set `EXAMS_MANAGEMENT_WRITES_ENABLED=true`.
   Confirm a preview, an explicit confirmation, one committed import, its
   audit record, and rejection of a replayed idempotency key.

## Learner parity checks

The restored attempt flow currently supports quizzes whose displayed content is
stored directly in `quiz_questions` and `quiz_options`. Full parity is pending
for bank-draw-only and mixed direct-plus-bank quizzes: the confirmed repository
contract exposes `quiz_bank_draws`, but does not yet expose the question-bank
membership resolver needed to select canonical bank questions and options.
Keep those quizzes out of the learner pilot until that resolver is confirmed
and implemented.

Before broad enablement, compare the live and rebuilt services using an
existing public quiz, an existing private unlocked quiz, and a private locked
quiz. Verify canonical IDs, titles, question/option order behavior, feedback
mode, time limit, tags, scores, and historical attempt access. A learner may
only read attempts whose strict Discord mention in `student_name` matches their
verified Discord subject.

## Learner attempt manual checks

Complete these checks in the pilot environment before broad enablement:

1. In a signed-out browser, test both Discord and Infinite Flight sign-in. For
   an unlinked IFC identity, complete the required Discord linking step and
   confirm the learner returns to the selected quiz. A conflicting link must
   show the support/review state without changing either identity.
2. Answer a quiz and submit it manually. Confirm exactly one attempt is saved,
   the request reports a manual submission, and the browser redirects to that
   attempt's result page.
3. Use a short positive time limit and let the countdown reach zero. Confirm
   the form submits once, records a timeout submission, and redirects to the
   result page without requiring another click.
4. Open the saved result while signed in as its learner and confirm the score
   and answers render. Then use a different learner session and confirm the
   same attempt is not disclosed. Also confirm a signed-out visit returns
   through OAuth before the owned result is shown.
5. With `DISCORD_WEBHOOK_URL` configured, submit an attempt and confirm Discord
   receives one embed with the learner, quiz, score, attempt code, and correct
   manual-or-timeout label. Follow **View result** and confirm its URL uses
   `APP_BASE_URL` and still enforces learner ownership.
6. Make the webhook endpoint unavailable (or point it at a controlled endpoint
   returning non-2xx), then submit another attempt. Confirm the result is saved
   and remains viewable, the learner sees a successful redirect, and the server
   records only a sanitized delivery warning without the webhook URL, secrets,
   or submitted answers. Restore the webhook configuration after the check.

## Rollback

If the application deployment fails, roll back the application image first.
Leaving `selected_option_id` nullable is backward-compatible with older code
and is the safe database state. Do not immediately change it back to `NOT NULL`:
new attempt rows may already contain `NULL`, and that reverse DDL can fail or
discard the legitimate unanswered-question state. Reverting the column requires
a separate maintenance window, verification that no `NULL` rows exist (or an
approved data-remediation decision), and the same backup and metadata-lock
precautions. A database restore is the disaster-recovery option, not a routine
application rollback, because it also rolls back all writes made after backup.

If the Dashboard management interface misbehaves, immediately set
`VITE_EXAMS_CENTER_ENABLED=false` and redeploy Dashboard. This removes the
staff entry point while leaving `exams.atcmh.org`, learner APIs, existing rows,
and quiz attempts untouched. Do not drop tables, delete imports, or point the
learner app at Dashboard during rollback.

If only imports are affected, set `EXAMS_MANAGEMENT_WRITES_ENABLED=false` and
leave Dashboard read-only management disabled or hidden as appropriate. Keep
the audit tables and captured logs for investigation; rollback does not mutate
or remove production data.
