# Mock question banks release — October 3, 2026

Deployed backend **3.8.13** and frontend **1.8.13** to ATCMH stack 30 / endpoint 3.
Images were built locally for `linux/amd64` using Gradle `pushImage` and
`npm run docker:push`, then pulled freshly through the existing Portainer stack
release process. All 26 environment entries and all configuration except the
two image references were preserved.

Backend digest: `sha256:689fe70c8d1301ba3c0b69b75abdc0ab9366c6d10353c26fd6e9dace7bcbec89`.
Frontend digest: `sha256:58e764c87fda1677fd256f2d212fbc831e62d70cb7259957c9cd348319dbb924`.
Live backend JAR hash:
`630f6c514e5eac40d4b1ce27d326b29fa322427a7654bb8062fd1cd2fa6d2dd9`.
Published/local/remote image identities and the live JAR match.

The backend was stopped briefly while the five existing mock tables were backed
up and the additive bank migration ran. The encrypted backup was verified by
decrypting and comparing it in memory. Migration preserved the original three
questions and their order as manual positions, their text/model fingerprints,
16 runs, 49 run items, 30 run attachments and two template attachments. Workflow
revision remains 0, and no question banks were created during verification.

The isolated backend adds or replaces only eight mock-related class families
and the manifest on the deployed 3.8.12 base; all other JAR entries are unchanged.
Existing non-target methods were compared after normalizing compiler constant
pool references. The frontend uses the verified Pilot Guide 1.8.12 release
snapshot, with only the approved mock changes and new versions. Pending audit,
statistics and other checkout changes remain excluded.

Verification passed: 29 isolated backend tests; 608 frontend source tests
(605 passed, three existing skips); TypeScript; targeted lint; production image
builds; container/digest checks; frontend version 1.8.13 and Docker health;
backend Discord/API readiness with no ERROR markers; both containers with zero
restarts. Both mock routes, the Pilot Guide and Courses return 200. Anonymous
workflow reads return 401.

The signed-in live browser loaded the preserved Ready setup, navigated to the
separate bank tab, opened an unsaved new bank, confirmed required question
validation and disabled last-question removal, and discarded that draft through
the unsaved-navigation confirmation. Desktop and phone layouts have no
horizontal overflow or console warnings/errors. No production bank/setup saves
or real Discord mock sends were performed.

- [Live desktop setup](live-setup-desktop.png)
- [Live empty bank tab](live-banks-desktop.png)
- [Live phone bank validation](live-new-bank-phone.png)
- [Live phone setup](live-setup-phone.png)

Private DPAPI-encrypted backups, release JAR, source/method verification and
deployment receipts are under
`C:/Users/Reid/Documents/Codex/2026-10-03/atcmh-mock-banks/private`.
The 188 ordered backup chunks are in `mock-before-chunks.clixml`; never display
decrypted contents. Isolated sources are retained in each repository's ignored
`build/mock-banks-release`. One-release helpers have version/source/stack guards;
do not rerun them blindly or reuse 3.8.13 / 1.8.13 for a later release.

The optional direct Docker API pre-pull lacked registry authentication and was
abandoned before any backend stop or migration. The normal Portainer stack
update supplied its saved registry authentication and completed the fresh pull.

final result: passed
