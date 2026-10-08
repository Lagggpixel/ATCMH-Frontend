# Mentor applications and Careers release — October 8, 2026

## Application workflow and learning theme

Backend **3.8.22** (`820287c`) and frontend **1.8.21** (`7341850`) were committed, pushed, built locally for `linux/amd64`, published with versioned and latest tags, and deployed through Portainer stack 30 / endpoint 3 with a fresh pull.

- Moderator/administrator decisions, atomic workflow audits, application history, global and individual reapplication periods, account cooldown controls, attendance summaries and new-application Discord notifications are included.
- Approval advances selection. Confirmed membership of the Discord Mentor role is the successful outcome; approval does not assign a role.
- Careers uses the Courses/Pilot Guide frame and appearance controls, with the ATCMH Careers label and the existing full-width airport image directly beneath the header.
- Only the two Compose image references changed. All 26 environment entries and the remaining configuration were preserved.

| Artifact | Verified digest / hash |
| --- | --- |
| Backend image | `sha256:a9a9016f1eb1ab711623f5da60c698de5872e88553307499ab3768a8d3e8cdf0` |
| Backend platform image ID | `sha256:ffa1789b48b8e888dcc6410a57454807689e8a549d39bb6363c49c08566a360a` |
| Backend JAR | `642f02d30fa6340b7626d7b647953d2f6564843283c51fa52252b7aa5e5772f8` |
| Frontend 1.8.21 image | `sha256:d478fb16abf7ab828514cfbcaf7490aa651c9cfa290ba4102aa06368406ed926` |
| Frontend 1.8.21 platform image ID | `sha256:fec4e98332ecf00481a69952e8eb9e8ca3ea5db05a940da94f32016886acc01d` |

## Database migration

Applied `Backend/sql/2026-10-08-mentor-application-decisions.sql` once, after stopping the backend and backing up the complete mentor-application and audit tables privately. The encrypted backup was decrypted and compared in memory before migration. The migration adds five columns, a policy row with a three-month default, and the per-account override table. The resulting application table has **20 columns**. The initial release helper expected 21; its verification guard was corrected after inspecting the fully applied schema, and deployment resumed without rerunning the migration.

All **11,549** pre-migration audit rows remain. The application table was empty before and after migration. The default policy is `(1,3,0)`, with zero overrides and no legacy NEW statuses.

Encrypted backups, guarded release helpers and receipts are under `C:/Users/Reid/Documents/Codex/2026-10-08/atcmh-mentor-decisions/private`. Do not rerun one-release helpers blindly.

## Verification

Both application containers are running with zero restarts; frontend health is healthy. Published image digests, remote image IDs and the backend JAR hash match. Discord startup is ready with zero ERROR markers. Careers, application form/history, staff applications, accounts, Courses, Pilot Guide and health routes return 200. Anonymous mentor context/history, staff list/policy and account cooldown reads return 401. Public backend questions return 200.

Production builds, TypeScript and targeted lint passed. No tests were added or run. No production application, decision, cooldown change or notification was submitted for verification. Interactive workflow examples and screenshots use the clearly labelled fictional local fixtures described in `decisions/README.md` and `follow-up/README.md`.

Live dark/light desktop Careers captures are in `careers-theme/`. The initial local phone check confirmed no horizontal overflow and exact header/image alignment. Subsequent in-app browser viewport changes stalled, so final browser verification uses Chrome.

## Careers login correction — frontend 1.8.22

Committed and pushed as `a3abe77`, built locally with `npm run docker:push`, and deployed with a fresh pull to the same verified stack. Backend remains 3.8.22 with the image and JAR above. Only the frontend image reference changed, preserving all 26 environment entries and remaining configuration. No further database migration was needed.

- The server's `safeLocalReturnTo` now accepts `/careers` and its subpaths. Both login initiation and callback use this check, so Careers no longer falls back to `/exams`.
- The role page's action reads the shared authentication state. It shows **Apply now** and **Complete the mentor application form** when signed in, **Sign in to apply** when signed out, and a disabled loading action while checking the account.
- Frontend image digest: `sha256:f039ffc3d1935c5173488f4f64c14d9fd38150c3a5abb3c729fb865589c683ef`.
- Frontend platform image ID: `sha256:d1963cade391576652dc4842c766f8597cbb450d748bfa07845f80925c44edf4`.
- Both containers run with zero restarts; frontend health is healthy and its public version is 1.8.22. Backend Discord startup is ready with zero ERROR markers, and the backend image/JAR remain unchanged.
- The production callback preserves `/careers`, `/careers/apply` and `/careers/application` when returning a missing-handoff error to the login page. This verification creates no login session and does not complete an OAuth or policy-consent flow.
- Chrome verified the real signed-in **Apply now** action, navigation to `/careers/apply`, the existing moderator exclusion, the authenticated empty staff list, and the read-only global settings dialog showing 3 months. No application or settings save occurred.
- The live phone page has no horizontal overflow (375 CSS pixels); hero top and header bottom both measure 76.667px. The full-width image starts directly beneath the header. Chrome's temporary viewport was reset.
- Production build/TypeScript and targeted ESLint passed. No tests were added or run. Screenshots are `careers-theme/live-signed-in-careers.png`, `live-dark-phone.png` and `live-staff-list.png`.

Private encrypted stack/Compose snapshots, build log, guarded deployment helpers and verification receipts are under `C:/Users/Reid/Documents/Codex/2026-10-08/atcmh-careers-auth/private`. Do not reuse published versions 3.8.22, 1.8.21 or 1.8.22, or rerun one-release helpers blindly. The pre-existing generated `tsconfig.tsbuildinfo` modification is preserved and excluded from commits.

## Careers heading — frontend 1.8.23

Committed and pushed as `6fe26f5`, built locally with `npm run docker:push` for `linux/amd64`, and deployed through verified Portainer stack 30 / endpoint 3 with a fresh pull. The role heading now reads **Mentor Applications**. Application status pages already use the shared Courses/Careers appearance provider; the requested pending, next-stage and denied Dark mode previews required no theme code change.

- Frontend digest: `sha256:cfbafd281368449f1891e23497283ed0e9a7b3db0188134fe462b3f257715a8c`.
- Frontend platform image ID: `sha256:c5765078c68dc8bc08d498ca57f2bc242b64fe2ea8f9f5f968ae4cb6daac11ac`.
- Only the frontend Compose image reference changed. All 26 environment entries and the remaining configuration were preserved. Backend remains 3.8.22 with its previously verified image and JAR hash.
- Production build and TypeScript passed. Live version reports 1.8.23; both containers run with zero restarts, frontend health is healthy, backend Discord startup is ready and startup ERROR markers are zero. Published image/digest checks and relevant route/health checks passed.
- An isolated anonymous browser confirmed the live heading, ATCMH Careers branding, Dark mode canvas `#111111` and no page errors. No production application or settings writes were performed. No tests were added or run.

Encrypted stack/Compose snapshots, publication log, guarded helpers and verification receipts are under `C:/Users/Reid/Documents/Codex/2026-10-08/atcmh-careers-heading/private`. Do not reuse published frontend version 1.8.23. The existing `tsconfig.tsbuildinfo` change remains excluded from commits.
