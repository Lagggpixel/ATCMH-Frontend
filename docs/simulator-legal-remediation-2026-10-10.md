# Simulator legal-risk remediation — 2026-10-10

Implemented locally. Nothing was published or deployed; no production records were changed, no cleanup job was installed, and no permission request was sent. Existing unrelated working changes remain outside this remediation. Historical source-permission questions remain unresolved; these changes reduce engineering risk and do not constitute legal clearance.

## Changes

- Replaced the replicated nested message catalogue with ATCMH task/parameter controls and a radio preview. Ground movement, departures, arrivals/circuit, sequencing and frequency transfer retain all 12 supported mentee instruction types. Heading, speed, runway, outcome, taxi paths, instructor waypoints, readbacks, pause/reconnect and exclusive seats remain available.
- Added stable pilot request IDs and an exact legacy-label adapter. Radio text uses typed instruction fields. New taxi destinations distinguish runway, parking and continuing a configured route. Old schema-1 requests, messages, revisions and taxi defaults remain readable without a database rewrite. Staff request defaults use IDs too; parameters remain editable if the aircraft changes phase while a panel is open.
- Added a frequency rail, labelled traffic cards and an independently arranged ATIS editor. Removed game-only disabled menus and decorative status/battery/3D/procedure controls.
- Removed fabricated real-named SID/STAR/fix/navaid and airspace overlays. Airport geometry, trails, selected flight-plan waypoints, taxi paths, circuit guidance and explicitly schematic final guides remain. Legacy ATIS procedure references remain readable. Shared fixed simulated weather now supplies the banner, ATIS and radio wind.
- Added ATCMH ATC Trainer branding, visible independence/simulation notices, author guidance and a readable About page. It links to the [official ATC manual](https://infiniteflight.com/guide/atc-manual), whose URL was checked during verification.
- Added the exact engine map-database download, source/bounds/transformation/ODbL notice, readable OSM attribution and a public Phosphor MIT notice. Existing OFL font notices remain. The airport JSON is byte-for-byte unchanged from the pre-remediation snapshot.
- Speech automatically selects local English voices only. A remote voice requires explicit per-tab permission and selection; missing permitted voices leave text training available. Revoking permission cancels playback. No microphone or recording was added.
- Added private, transaction-based retention and learner-erasure tooling, defaulting to dry run. Operating defaults are 90 days for inactive live sessions, 180 days for completed attempt details/feedback and 365 days for unused staff preferences. Assessment summaries retain attempt-limit/progression behavior and need annual staff review. No automatic cleanup or backup configuration was installed.
- Updated Terms and Privacy documents, backend required-policy versions/hashes and their tests together. Policy files use canonical UTF-8 LF, enforced by targeted .gitattributes rules. Hashes are in `simulator-policy-receipt.json`.

## Verification

- Complete frontend suite: 731 tests, 728 passed, 3 existing skips, zero failures. Used the repository's documented temporary automatic-JSX test configuration and native execution outside the Windows sandbox. Initial sandbox/default-configuration module-resolution failures were resolved without changing application dependencies or permanent test configuration.
- Focused simulator/legal/retention/policy tests: 121 passed. Covers every legacy request and stable ID, preserved schema-1 snapshots, command reachability, local/remote speech selection, data download and policy hash agreement. Retention/deletion checks use disposable connection fixtures; no live MariaDB cleanup was tested or performed.
- Backend authentication suite: 150 tests passed, zero failures/skips.
- Final native production build, TypeScript and targeted ESLint passed. No image build, registry push or deployment occurred.
- Installed Playwright/Chromium checked the production standalone build at 127.0.0.1:3107 using synthetic accounts and session streams. Checked desktop 1440×900, tablet 1024×768, phone About 390×844; typed taxi, option landing, pattern sequencing, phase-change parameter editing, ATIS publication, staff request defaults, scenario authoring/rehearsal, speech opt-in, exact map download, notices and readable About colours. No browser console errors; inspected screenshots. The temporary server was stopped afterward.

Evidence is in `C:/Users/Reid/.codex/visualizations/2026/10/10/01a12650-0532-7223-830f-8ac9c5979a75`: `simulator-browser-report.json`, final screenshots, `frontend-suite-final.log`, `simulator-focused-tests.log`, `frontend-build.log` and the pre-change simulator snapshot. Browser plugin not available; installed Playwright was used. For future UI checks, the Browser plugin is recommended.

## Before any later deployment

1. Review unresolved provenance/permissions in `simulator-sources.md`. The historical audit and receipt have been preserved, not rewritten as a clean-room claim.
2. Release frontend legal documents and backend registry together. New required policy versions will require acknowledgment again through the existing authentication process. Choose fresh release image versions under the project's release convention.
3. Verify the existing pending simulator migrations, including staff preferences. The remediation adds no schema migration itself.
4. Review operating retention defaults with programme staff; arrange private daily maintenance and annual summary review, verify backup rotation, and validate a dry run/disposable MariaDB transaction against the target schema. Handle a valid hold before enabling unattended cleanup. Follow `simulator-retention.md` for scoped learner erasure and review authored personal content separately.
5. Run ordinary release/deployment verification only when authorized. No production change has been authorized or performed here.
