# Simulator retention operations

The `atcmh-simulator-retention` service runs daily in ATCMH stack 30 using the frontend image and database identity. On 2026-10-26 it was synchronized to the running frontend **26.10.47**, replacing the preceding **1.8.58** pin. Both containers use the same verified runtime image. Pre- and post-deployment maintenance dry-runs found no eligible records. Future checked releases update and verify frontend and retention together; see [the release workflow](release-workflow.md). Monitor maintenance failures; failed transactions roll back.

- Live links close after 90 inactive days, excluding occupied seats. Archive the recording and final snapshot in the same transaction before deleting a link. Pre-recording sessions receive a labelled partial recording of their surviving snapshot. Active attempts become ended with their result preserved.
- Replays, complete attempt results, message/event history and instructor feedback have no automatic expiry. Keep them permanently while ATCMH operates, subject to explicit scoped deletion requests. Recording metadata and frame rows are independent of live-session rows.
- Assessment summaries and assignments also have no automatic expiry. They preserve progression and attempt limits. Permanent storage does not override deletion rights.
- Staff speech settings are per-tab only; auto-readback preferences expire after 365 days without a preference change and with no saved staff session.
- Published scenarios/revisions are teaching content retained for reuse. Use fictional content. Review author notes/drafts for personal data on a deletion request; their immutability does not override erasure obligations. Do not delete a shared teaching scenario blindly if other learners depend on it.
- Backups: operational target of 30-day rotation for simulator personal records; restored backups must have maintenance and approved erasures replayed before reopening access. Backup operators must verify the actual rotation at release; this code does not configure external backups.

## Maintenance

Use a private shell with the normal `MYSQL_*` variables loaded from the service's protected environment. Do not put secrets into commands or paste database output. All simulator migrations must exist, including staff preferences and `migrations/2026-10-11-simulator-replays.sql`. Apply the replay migration before starting either the new frontend or maintenance image. The existing database identity needs SELECT/INSERT/UPDATE/DELETE on `simulator_replays` and `simulator_replay_frames`; verify permissions privately before release. There is no public maintenance API and no startup cleanup.

From Frontend:

```powershell
node --import tsx scripts/simulator-retention.ts --dry-run
node --import tsx scripts/simulator-retention.ts --apply
```

Dry-run is the default. Each batch locks and processes up to 500 eligible records per category in one transaction, prints counts only and rolls back on failure. Repeat until counts reach zero. The deployed daily service runs one batch per invocation; operators should process any backlog privately. The production image packages the same CLI at `maintenance/src/simulator/maintenance.js`, with only its locked database dependencies. Run it inside the frontend container using `node maintenance/src/simulator/maintenance.js --dry-run`; credentials remain in the container environment.

## Deletion requests

1. Verify the requester's ATCMH account ID and scope via the existing privacy contact process. Review any specific legal hold/appeal; record a reason and review deadline for a justified exception, rather than adding blanket indefinite retention. Pause routine maintenance if a valid hold covers selected records; this maintenance tool has no automatic legal-hold adjudication. Resolve the hold or implement a scoped exclusion before enabling unattended cleanup.
2. Back up only if needed for recovery, with access controls and a fixed expiry. Record the erasure request in a restricted operational ledger, not in learner scenarios or message text.
3. Preview the targeted learner deletion. The apply form deletes that learner's assignments, attempts, participant/assigned replays (with their frame rows via a cascading foreign key), related live sessions and saved preference. It does not delete their account, authentication/audit records or other learning systems. No owner-wide scenario deletion occurs.

```powershell
node --import tsx scripts/simulator-retention.ts --erase-learner VERIFIED_ACCOUNT_ID --dry-run
node --import tsx scripts/simulator-retention.ts --erase-learner VERIFIED_ACCOUNT_ID --apply
```

4. Review authored scenarios, drafts, instructor notes and unassigned staff sessions separately for identifying content; remove/redact only the requested content and dependent copies after resolving other learners' dependencies. Do not claim hashed IDs alone anonymise records. Handle other ATCMH systems through their existing deletion process.
5. Verify no scoped learner assignments/attempts, replays/frames or live links remain. Confirm remaining justified summary/hold data, any other-system records and backup expiry to the requester. A new assignment after erasure requires mentor review because deleting history also resets that assignment's attempt count. Replay the restricted erasure ledger on any restore.

Development tests use disposable in-memory transactions and SQL fixtures, including archive-before-delete, write failure rollback, durable recording across service restarts and explicit learner erasure. The production maintenance bundle is tested without tsx. The 2026-10-11 release verified both new tables, their cascading foreign key and application permissions against the live database. A deployed-bundle transaction recorded movement and a pilot request, archived the replay, verified seat-token exclusion and frame deletion, then rolled back all probe data. The deployed maintenance dry run found zero eligible records. Encrypted backups and receipts are recorded in the project AGENTS.md; external backup rotation remains an operator responsibility.
