# Mentor application decisions

Local implementation and screenshot evidence, 8 October 2026. All displayed
applications are fictional. Prototype: http://127.0.0.1:4320/.

## Workflow

- Pending: submitted and awaiting a decision.
- Next stage: a moderator or administrator approved selection progress.
- Denied: staff feedback and the exact UTC reapplication deadline are shown.
- Mentor: the applicant's linked Discord account has the Mentor role.

Approval changes application status only. It never assigns a Discord role.
Fresh role verification runs when the latest application is opened by its owner
or reviewer. The resulting Mentor confirmation is persisted and audited once;
role lookup failures preserve the previous status. This records completion of
the selection attempt, rather than reflecting later removal of the role.

## Decisions, waits and history

Only moderators and administrators can review or decide. Impersonation is
rejected. Writes require the current central session and CSRF token. Reasons
are required and visible to the applicant. A next-stage applicant can still be
denied at the later selection stage. Previous attempts retain their original
identity and response snapshots and remain visible to their owner and staff.

The default denial wait is three calendar months in UTC. Staff can change the
default for future denials, replace all individual overrides and recalculate
existing denials, or set an account-specific wait and optional exact deadline.
Individual updates apply one eligibility deadline to prior denied attempts for
that account. Application creation checks account, Discord and IFC identities
to prevent concurrent or linked-identity duplicate attempts.

Submission, decisions, mentor confirmation and wait changes persist their audit
events in the same database transaction. Reads are also audited. A singleton
policy row serializes workflow writes; optimistic revisions reject stale staff
actions. Default changes invalidate open decision snapshots. Application answers
are not copied into audit details.

## Release requirement

Changes are not deployed. Back up affected application and audit tables, then
apply `Backend/sql/2026-10-08-mentor-application-decisions.sql` once before the
updated backend starts. It adds review/status/deadline/revision fields, migrates
NEW to PENDING and creates default/individual policy tables. Preserve the
existing release and Portainer conventions. No migration was run here.

Backend compilation, frontend production build/TypeScript and targeted lint
passed. Browser inspection used only the ignored fixture under
`Frontend/build/mentor-decisions-preview`; no real application or role changed.
No tests were added or run. Live database integration remains a release check.

See [screenshots.md](./screenshots.md) for all final views and
`Frontend/design-qa.md` for the reference comparison and resolved findings.
