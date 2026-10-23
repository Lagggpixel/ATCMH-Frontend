# ATCMH Sweatbox library layout

Date: 23 October 2026 (Europe/London)

final result: passed

## Comparison target and evidence

The current standalone Sweatbox Sessions, Scenarios and Replays indexes are the visual reference. ATCMH retains its existing logo, blue theme tokens, appearance/account controls, shared scenario ownership and authentication. This is an implementation in the existing frontend, not a separate product or new backend.

Reference preview: `http://127.0.0.1:3106/simulator/{staff,scenarios,replays}`.

ATCMH preview: `http://127.0.0.1:3110/sweatbox/{staff,scenarios,replays}`. Both previews use the same synthetic trainer, three sessions/scenarios and two replays. Application APIs are replaced by a local sample-data proxy; production writes are zero.

Evidence directory: `C:/Users/Reid/.codex/visualizations/2026/10/23/01a169a1-53e5-7583-b115-b8aaeb88b7ba/`.

Source visual truth and matching implementation screenshots:

| Surface | Source | Implementation |
| --- | --- | --- |
| Sessions, desktop | `reference-sessions-desktop.jpg` | `atcmh-sessions-desktop.jpg` |
| Scenarios, desktop | `reference-scenarios-desktop.jpg` | `atcmh-scenarios-desktop.jpg` |
| Replays, desktop | `reference-replays-desktop.jpg` | `atcmh-replays-desktop.jpg` |
| Sessions, phone | `reference-sessions-phone.jpg` | `atcmh-sessions-phone.jpg` |
| Scenarios, phone | `reference-scenarios-phone.jpg` | `atcmh-scenarios-phone.jpg` |
| Replays, phone | `reference-replays-phone.jpg` | `atcmh-replays-phone.jpg` |

Each filename above is relative to the absolute evidence directory. Dark-theme checks are also recorded in `atcmh-{sessions,scenarios,replays}-dark-phone.jpg`; the phone scenario action was subsequently refined and recaptured in the light-theme comparison pair. `atcmh-archive-notice.jpg` records successful sample archiving and its balanced notification. `atcmh-library-browser.json` contains 36 passing browser assertions.

## Capture normalization and state

- Browser: Codex in-app browser, using its native screenshot API. Captures are JPEG files.
- Desktop CSS viewport: 1440 × 1000. Scenario/replay pairs are 1440 × 1000 pixels. Session pairs are 1425 × 990 pixels from the native browser capture; source and implementation have identical dimensions and are compared at the same scale.
- Phone CSS viewport: 390 × 844. Both members of each pair are 375 × 812 pixels from the native capture, so no additional density normalization is needed. The browser reports a device pixel ratio approximately 1; native capture sizing is recorded independently of the CSS viewport.
- State: loaded lists, light appearance, same sample content and dates, no open menus or tutorials. The standalone account is a normal trainer; ATCMH retains its existing staff access and shared library. Consequently ATCMH keeps its My sessions replay filter and creator attribution.
- Responsive overflow checks additionally cover 320, 768, 1024 and 1600 CSS pixels.
- Full-view reference and implementation pairs were opened together in the same comparison input. Focused inspection used the readable scenario action/metadata rows, replay toolbar/columns, session card actions and sidebar footer within those captures; a separate crop was unnecessary at the native comparison size.

## Findings and comparison history

1. **[P2, fixed] Scenario content started 16px too far right on desktop.** The initial implementation inherited the generic session gutter. It now uses the standalone scenario workspace's 48px left / 40px right desktop gutters, with its tablet and phone variants. The final desktop scenario comparison verifies the corrected alignment.
2. **[P2, fixed] Replay heading and filters started 28px too low.** The common workspace overrode the replay page's 40px top padding. The replay-specific padding now wins, and the desktop column widths again follow the source at this viewport. The final replay comparison verifies heading, filter, date-group and row alignment.
3. **[P2, fixed] Phone scenario action occupied an unnecessary extra row.** The initial container threshold applied the smallest-screen layout at 390px. The threshold is now 300px of available content, preserving the source's inline metadata/action layout at 390px while keeping the action full width when needed at 320px. The recaptured `atcmh-scenarios-phone.jpg` and the final two responsive browser assertions verify the correction.
4. **Accepted product differences:** ATCMH's brand lockup and white/blue sidebar replace Sweatbox's wordmark and rust palette. The phone header is 76px to retain ATCMH's appearance and account controls. All/Published/Drafts filters preserve ATCMH's shared scenario library rather than adding the standalone product's private/template permissions. Creator attribution adds one metadata line. Standalone-only Changelog, Join and Owner Spectate features are not introduced. Existing ATCMH editor and replay-player routes retain their existing frames.

No actionable P0/P1/P2 findings remain after the final comparison.

## Required fidelity surfaces

- **Fonts and typography:** existing ATCMH `--font-site` is retained. Heading hierarchy, 18–20px list titles, secondary labels, line height, wrapping and control weights follow the reference. Titles and names wrap without clipping.
- **Spacing and layout rhythm:** sidebar, active navigation, desktop gutters, compact scenario rows, replay toolbar/date groups and session card layouts match the source structure. The three spacing findings above were corrected and recaptured.
- **Colours and tokens:** surfaces, borders, text, primary actions, selected states and focus treatments use ATCMH dashboard variables. Light and dark modes persist across all three routes. Desktop appearance choices open above the sidebar footer and remain within the viewport.
- **Image and asset fidelity:** the existing ATCMH logo asset is retained, with its natural proportions. Existing Phosphor icons provide navigation/actions. No new raster assets, approximated logos or decorative artwork were needed.
- **Copy and content:** existing creator, participant, airport, recording type, revision and UTC date information remains available. Session row actions use Trainee link, Enter and Archive, with matching tutorial guidance. Shared-library filters and authenticated mentee links retain ATCMH semantics.

## Interaction and technical verification

- Scenario text search, published/draft filtering, arrow-key tab navigation, no-results recovery, action menu open/Escape/focus restoration.
- Replay search, airport filtering, clear filters, retained participant scope and replay links.
- Phone navigation open, content inert while open, route change closes navigation, Escape closes it and restores focus.
- New-session dialog opens with published scenarios and cancels correctly. Archive confirmation focuses Keep session; cancellation preserves the row. Disposable sample archive removes the intended row, displays balanced feedback, and dismisses correctly.
- Light/dark switching and theme persistence across all three pages; desktop appearance menu fits on screen.
- No horizontal overflow in tested widths; no framework error overlay or application errors during the final checks. Early preview-only failures from a stale source junction, injected setup script and unsupported sample airports were corrected before the final verification window.
- 19 focused tutorial/session-library/replay tests pass. Scoped ESLint and TypeScript pass. The final isolated production build passes, with existing package-version named-export warnings in unrelated version/dashboard routes.
- All 11 changed application source files match the verified preview byte-for-byte. No dependency, version, database, published image or deployment change was made.

## Remaining scope and implementation checklist

- [x] Match the three library index layouts while retaining the ATCMH theme.
- [x] Verify desktop/phone visuals, themes, keyboard controls and sample interactions.
- [x] Resolve and recapture P2 visual differences.
- [x] Complete focused tests, lint, TypeScript and production build.
- Not exercised: real production writes, full editor/radar/player workflows or other browser engines. Those workflows were outside this library-layout change.


---

# Previous design QA records

# Administration Roles — option 1 (2026-10-11)

**Final result: passed**

Selected visual: `C:/Users/Reid/.codex/generated_images/01a12650-0532-7223-830f-8ac9c5979a75/exec-d9a0ef15-94be-4772-bf94-907348ba139f.png` (first displayed image in the Roles ideation set).

## Findings and repairs

- [P2, fixed] The initial role rail was 26px too narrow, moving the member region left. Increased the desktop grid track to 302px, preserving the reference's approximately 374px member-region start.
- [P2, fixed] The role heading was undersized and the table began too low. Set the role heading to 32px and reduced the empty status region to 20px.
- [P2, fixed] The inherited workspace height produced needless desktop vertical scrolling. Added a Roles-specific workspace height and adjusted the footer rhythm. Final desktop viewport and document are both 1487×1058 with no horizontal or vertical overflow.
- [P3, accepted] Existing dashboard header dimensions, brand asset, font, theme tokens and account initial fallback are preserved. The generated target's header is slightly taller. No unrelated header redesign was introduced.
- [P3, accepted] Discord identity cells show exact string IDs rather than the mock's illustrative usernames, allowing unambiguous member identification. The linked identity's display name remains the member label.
- [P3, follow-up] The existing dashboard input focus style and the new search container both outline the focused picker. This does not obscure text or controls; it can be reduced to one outline in a later polish pass.

## Evidence and fidelity

Evidence root: `C:/Users/Reid/.codex/visualizations/2026/10/10/01a12650-0532-7223-830f-8ac9c5979a75`.

- Opened the selected source and actual captures, then inspected combined `roles-comparison-initial.png`, revised `roles-comparison-final.png`, and focused `roles-detail-comparison-final.png`.
- Final source and desktop capture: 1487×1058 pixels, matching CSS viewport, device scale factor approximately 1. No resizing or stretching before comparison.
- Fonts/typography: existing product sans-serif; 36px page heading, 32px role heading, 16px member text; supporting labels use the existing smaller dashboard scale. Copy remains readable and hierarchically consistent.
- Spacing/layout rhythm: left fixed role rail, divider, flexible member region, aligned member search/add controls, separated member rows and bottom access note match the selected composition. Phone uses a horizontal role selector and retains all actions.
- Colors/tokens: shared dark and light dashboard tokens supply canvas, text, selection, borders and blue primary actions. No new visual system or generated gradient was added.
- Image quality/assets: reuses the real ATCMH logo and existing account avatar behavior. Member initials are semantic text labels, as in the target; Phosphor supplies normal UI icons. No raster art is needed for this administrative workflow.
- Copy/content: both fixed roles, member counts, scope descriptions, member search, Add member, Remove and separate superadmin note are present. The add picker explains that an active linked Discord account is needed.

## Interaction and responsive checks

- Verified Administration → Roles navigation for the superadmin fixture.
- Added a sample account to Admin; count and list updated to three. Cancelled its removal, then confirmed removal; both existing admins remained and the count returned to two.
- Filtered the current role by name, cleared the search, and switched to the empty Simulator Tester role.
- Verified account lookup by name, existing-member disabled actions, native modal focus and Escape dismissal.
- Ordinary-admin direct navigation displays Superadmin access required and no member controls.
- Simulated membership-load failure presents a visible retry; restoring the fixture and clicking Try again recovers the roles.
- Captured desktop dark, tablet light at 1024×768, phone dark/light at 390×844, and phone picker. No horizontal overflow at any checked width; phone actions and long identity strings remain visible.
- Browser console had no unexpected warnings/errors in the normal interaction pass. The intentionally simulated 503 is expected during failure verification.
- The local preview is `http://127.0.0.1:3109/dashboard/roles`, backed by isolated fixtures. It does not contact or change production membership. Final fixtures contain two Admin members and no Simulator Testers.

## Verification

- Full backend suite: 1,039 tests, zero failures, one existing skip. Includes migration replay, durable independent roles, immediate revocation, no-op mutation history, audit rollback, tester session scope, superadmin-only policy, impersonation denial and exact ID validation.
- Full frontend suite: 784 tests, 781 passed, three existing skips. Native run uses the ignored `build/roles-test-tsconfig.json` to include test JSX; no production config changes were needed.
- Targeted lint passed; the pre-existing SiteHeader image warning is unchanged. Final production build and TypeScript passed.
- Prepared `Backend/sql/2026-10-11-dashboard-roles.sql` and `Backend/docs/dashboard-roles.md`. No production migration, member edit, publication or deployment was performed.

**Implementation checklist**
- [x] Implement selected option in the existing dashboard.
- [x] Enforce superadmin-only, central-session, non-impersonated role management.
- [x] Persist both roles and prepare one-time migration of existing admins.
- [x] Keep Simulator Tester permissions separate from dashboard staff permissions.
- [x] Verify source comparison, responsive behavior, core edits, errors and regression checks.
- [x] Leave local review running without deployment.

**final result: passed**

---

# Flight Controls redesign — Product Design QA, 2026-10-11

final result: passed

Source visual truth: user-selected option 1, `C:/Users/Reid/.codex/generated_images/01a12650-0532-7223-830f-8ac9c5979a75/exec-4427b9ca-3e06-4411-8309-34c49ac0b45e.png` (1487 × 1058). Implemented in the existing simulator, without publication or deployment. Local review: `http://127.0.0.1:3108/simulator/staff/21cde6b5-5efc-4ff9-b702-53d52a7ffdb1`.

## Evidence and comparison history

All implementation captures below are under `C:/Users/Reid/.codex/visualizations/2026/10/10/01a12650-0532-7223-830f-8ac9c5979a75/`.

- Full desktop: `flight-layout-desktop-final.png`, 1487 × 1058 pixels and CSS viewport, density 1. Both source and implementation show Speedbird 101, Base selected, current IAS 220, target 180, Semi-auto, runway 24, left traffic and touch-and-go.
- Full-view comparison: `flight-layout-comparison-final.png`, source and implementation together at their original equal dimensions. Radar zoom/position differs; radar rendering and navigation were outside this redesign's scope, so fidelity findings focus on the bottom control area.
- Focused comparison: `flight-layout-detail-comparison-final.png`. Source control content crop (1198 × 478) and actual control content crop (1149 × 460), the latter proportionally resized to the source width. This preserves aspect ratio and enables readable comparison of controls rather than claiming pixel equality.
- Normal user viewport: `flight-layout-natural-final.png`, 1247 × 1244 output pixels at approximately 1247 × 1244 CSS pixels, device density 1.5. The browser screenshot API normalizes output to CSS-size pixels. `flight-layout-panel-final.png` is a crop of this full capture, 1247 × 460.
- Narrow viewport: `flight-layout-tablet.png` and `flight-layout-tablet-speeds.png`, 1024 × 768, density 1. Pattern controls appear first; speed/heading controls stack below and remain reachable by scrolling within the panel. No document or fieldset horizontal overflow. Temporary viewport override was reset afterward.

First comparison: `flight-layout-comparison-v1.png` and `flight-layout-detail-comparison-v1.png`.

- **[P2, fixed] Phase inputs became vertically misaligned at the natural 1247 px width.** The combined pattern label wrapped to three lines while other labels used two-line minimum space. Increased every phase label's minimum height to 44 px; final DOM measurement gives the same vertical input position for all five fields. Compact scenario labels retain their own zero minimum-height override.
- **[P2, fixed] The extra label space left the heading row partially below the desktop panel edge.** Increased the Flight Controls panel height from 440 to 460 px, still capped at 55vh for shorter screens. Final panel content measures clientHeight = scrollHeight = 451 at both desktop and natural viewports, with equal client/scroll widths. All controls fit without scrolling at those widths.
- An initial screenshot with `fullPage:false` clipped the overridden viewport to the host browser surface; it was discarded as comparison evidence. Full-page screenshots correctly capture the complete 1487 × 1058 viewport. A direct clipped screenshot also returned blank pixels, so the final panel evidence is cropped from the verified full capture.

Final combined comparison: both P2 findings resolved. No actionable P0/P1/P2 findings remain.

## Required fidelity surfaces

- **Fonts/typography:** existing bundled Fira Sans and fallbacks retained. 21 px section headings, 25 px IAS values, 14 px action labels and 12–14 px field labels establish hierarchy. Compact native control density is slightly smaller than the illustrative mock, an acceptable P3 difference; all labels and fields remain readable.
- **Spacing/layout:** two balanced columns separated by one divider. Pattern settings, segmented leg selector and 2 × 2 maneuver buttons on the left; current/target IAS, modes, manual override, five phase targets and heading on the right. No nested cards or shadows. Container queries stack the columns below 760 px of available panel width.
- **Colors/tokens:** existing charcoal surfaces and blue/cyan selection; cyan landing action, amber go-around and green cancellation state distinguish action intent. Existing visible keyboard-focus outlines remain available. Flat surfaces preserve the real application's theme rather than recreating the generated image's subtle surface texture.
- **Image quality/assets:** no new raster or illustrative assets are needed. Existing Phosphor icons, real radar and native form controls are retained; no screenshot background or substitute drawings were added.
- **Copy/content:** original settings and phase fields retained. The combined phase still means upwind, downwind and crosswind. Removed mock switch affordances from maneuver actions as explicitly requested. Extend downwind becomes Turn base while a controller extension is active. Allow landing becomes Cancel landing while permission is active; Go around clears permission. A concise status line shows landing permission, altitude and existing sequence status.

Intentional source differences: retain the real aircraft frequency selector and existing navigation dimensions; action buttons replace the mock's switches; the automatic speed button reads Auto or Semi-auto according to configured phase targets, preserving existing behavior without an ambiguous third mode button. Blank fields restore defaults independently. The mock's landing switch illustration does not define the saved exercise permission state. Scenario configuration and engine behavior otherwise remain unchanged.

## Functional checks and implementation checklist

- Passed browser checks: Extend downwind → Turn base → Base; Allow landing → Cancel landing; cancellation without a go-around; Go around removes permission; fixed Base IAS, clearing to Auto, manual Set speed, Semi-auto resume, and heading action selecting the 250 kt Inbound profile.
- All 36 focused engine/speed-profile tests passed. Targeted ESLint and the final production build, including TypeScript, passed.
- Browser console error check: none. Desktop/native panel overflow checks passed; narrow panel remains scrollable and has no horizontal overflow.
- Final checklist complete: selected source implemented, source/actual full and focused comparisons reviewed, both P2 fixes recaptured, viewport reset, local preview left running. No deployment, registry publication or production scenario/session mutation.

---

# Configurable IAS controls — Product Design QA, 2026-10-11

final result: passed

Implemented the user's selected direction 1 and subsequent revisions in the existing trainer and scenario editor. Local review: `http://127.0.0.1:3108/simulator/staff/21cde6b5-5efc-4ff9-b702-53d52a7ffdb1`. Nothing published or deployed.

## Visual evidence

- Revised source: `C:/Users/Reid/.codex/generated_images/01a12650-0532-7223-830f-8ac9c5979a75/exec-a4066459-1b3b-4853-94ea-59d282e7de5e.png` (2048 × 768).
- Actual trainer: `C:/Users/Reid/.codex/visualizations/2026/10/10/01a12650-0532-7223-830f-8ac9c5979a75/semi-auto-trainer.png` (1247 × 1244).
- Actual component crop: same directory, `semi-auto-panel.png` (848 × 296).
- Normalized comparison: same directory, `semi-auto-comparison.png`; source component crop resized to the actual component's 848 px width, then stacked with the implementation. This compares layout and hierarchy rather than claiming pixel equality between different aspect ratios.
- Scenario editor: same directory, `semi-auto-scenario.png` (1280 × 720), with saved Inbound 245 and Base 185 targets.

Both comparison panels show Base active, Semi-auto selected, and a 180 kt target. Actual current IAS is 220; the mock uses 191. Both correctly indicate deceleration. The trainer capture uses the browser's natural viewport; an attempted alternate viewport did not change the trainer's dimensions, so no additional responsive viewport result is claimed.

## Required fidelity surfaces

- **Fonts/typography:** existing Fira Sans, clear phase labels, large numeric inputs and subdued IAS readouts. The merged phase has extra width to keep its label readable.
- **Spacing/layout:** five-phase horizontal ribbon, compact Airspeed header, current-to-target readout, and separated manual override footer. The flight panel has sufficient height for the controls and scrolls for additional maneuvers. Scenario setup reuses the same fields in compact rows.
- **Colors/tokens:** charcoal surfaces, cyan active phase and selected mode, muted inactive labels, visible input/focus borders.
- **Assets/image quality:** native editable inputs and the existing Phosphor arrow. No raster assets or screenshot backgrounds are required.
- **Copy/content:** Inbound, merged Upwind / Downwind / Crosswind, Base, Final and Vref. Requested speed ranges, distance qualifiers and explanatory paragraphs are absent. Blank fields show Auto; filled fields show their configured IAS beneath the input.

Intentional differences from the generated target: omit its extra explanatory paragraph in accordance with the user's explicit request; omit duplicate aircraft identification already present in staff navigation; use a numeric manual override with an explicit Set speed action. The short `Blank = automatic` hint remains. No actionable P0/P1/P2 visual findings remain.

## Functional verification

- Trainer: fixed phase target, clearing back to Auto, Manual override, resuming configured Semi-auto, reload persistence, active Base and Inbound selection.
- Scenario setup: save/reload retains Inbound 245 and Base 185 independently; local QA draft only.
- Engine: default and fixed phase targets, gradual acceleration/deceleration, Inbound outside/leaving the pattern, takeoff/go-around using the combined pattern phase, manual precedence and resume, legacy schema compatibility, configured base turn geometry, and initial/scheduled scenario spawns.
- Validation: strict positive integer IAS targets up to 600; student edits cannot change speed configuration.
- All 171 simulator and legal-page tests passed. Targeted ESLint and the final production build, including TypeScript, passed. Trainer/scenario browser checks produced no console errors.

---

# Shared simulator sessions — Product Design QA

final result: passed

Source visual truth: `C:/Users/Reid/.codex/generated_images/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/exec-3492e493-e3b3-4a25-8cbe-91fe0f6a1070.png` (user-selected direction 1).

Implementation: `http://localhost:3105/simulator/staff`; deployed at `https://www.atcmh.org/simulator/staff` in frontend 1.8.45.

Final screenshot: `C:/Users/Reid/.codex/visualizations/2026/10/09/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/sessions-desktop-v2.png`.

## Comparison evidence and history

Source and final capture are both **1487 × 1058 pixels**, with a **1487 × 1058 CSS viewport** and device density 1. No scaling or density normalization was needed. Both depict a dark session library with three saved exercises, the first selected and its mentee connected. Exercise titles, timestamps and identifiers are real QA values rather than the illustrative mock values. All full-view comparisons supplied the source and implementation images together in the same tool input.

The in-app browser was used for functional checks. Its viewport override continued reporting 1280 × 720, so Chrome supplied the exact-size comparison captures. The initial mismatched-size capture was discarded as fidelity evidence.

First normalized comparison (`sessions-desktop-v1.png`):

- **[P2, fixed] Table text and column rhythm were too small/compressed.** Source dates and seat labels read at approximately 18–20 px, while implementation used 15 px; its seat column started too far left. Increased table date/seat text to 18 px, names to 22 px, and IDs to 16 px. Explicit desktop column proportions now align the airport/date/seat regions with the source.
- **[P2, fixed] The page exceeded the comparison viewport by 17 px.** Reduced the footer section’s minimum gap, retaining automatic distribution of spare vertical space. The revised document measures 1487 × 1058 with no overflow at the comparison viewport.
- Increased heading size from 42 to 46 px and adjusted its top gap to match the mock’s hierarchy.

Second comparison (`sessions-desktop-v2.png`): previous issues resolved. Header, heading, primary action, table, selected cyan row and footer retain direction 1’s structure and hierarchy. No actionable P0/P1/P2 findings remain.

Focused regions: the table and selected-session footer were reviewed at the full capture’s native density; names, dates, IDs, seat states and button labels are legible at this size, so a separate magnified crop was not necessary.

## Required fidelity surfaces

- **Fonts/typography:** bundled Fira Sans with B612 Mono IDs. Heading, session names, muted metadata and actions maintain the intended hierarchy. CSS fallbacks are present. Wrapping is deliberate on narrower screens.
- **Spacing/layout:** 36 px desktop content inset, generous heading/table separation, aligned table tracks, cyan selection edge and separated footer actions. Rows are slightly taller than the illustrative mock; this is a minor P3 density difference, with all primary controls still visible.
- **Colors/tokens:** charcoal surface, muted blue-gray metadata, blue primary actions, cyan selected-row border, neutral/green/red seat indicators and restrained red End session action. Contrast and visible keyboard focus were checked.
- **Assets/image quality:** the target is a text/table interface without photographic or illustrative assets. Phosphor supplies the standard back/copy icons. No screenshot was used as a UI background and no source artwork was approximated with custom drawings.
- **Copy/content:** primary source labels retained. Full UUID-backed links replace illustrative short codes. The footer adds an explicit mentee-link input and Open mentee page action so copying also works without clipboard permission.

Intentional product differences: the library omits exercise-specific Play, Audio and Reset controls because no exercise is open there; these remain on each control page. A visible full mentee link supports copying/accessibility. Dates use unambiguous UTC date/time. These changes support the requested saved-session flow.

## Interaction and responsive verification

- Create a named session, continue it, reload its control page and return to the library.
- Independent exercises retain separate elapsed times and message histories.
- Staff/mentee use separate synthetic identities locally; real signed-in moderator and mentee pages also verified after deployment.
- Clear duplicate-control and duplicate-mentee errors; the rejected page does not release the active seat.
- Pilot request reaches mentee pending count/log. Explicit Pause conceals the mentee display. Reconnection and staff-disconnect behavior covered by client/service tests and SQL probe.
- New/end dialogs have accessible names, native focus trapping, validation, cancel and busy states. Ending is verified by API/service tests and the disposable SQL probe. A final browser regression removed the dialog’s original session through the local QA API: the selected row changed, but the End dialog retained its original title/ID. Frontend 1.8.45 pins this target independently of list polling; its main library styling is unchanged from the final comparison.
- Tablet 1024 × 768: document width 1009 px (scrollbar included in viewport); table/footer remain usable with vertical scrolling. Capture: `sessions-tablet.png`.
- Phone 390 × 844: document width 375 px, stacked rows and actions; no horizontal overflow. Chrome’s phone screenshot operation timed out or returned an incorrectly sized raster, so phone acceptance uses DOM/layout inspection rather than claiming a normalized screenshot comparison. The desktop screenshot is the visual handoff evidence.
- No captured browser console errors on the local library. Initial live staff and mentee console checks captured no errors. A later Chrome tab reported two asynchronous listener/message-channel closure errors during browser-tool interactions, without an application stack; these are retained as browser-integration diagnostics rather than hidden. Verification used a disposable production exercise, then removed only that named exercise; the existing browser-local save was preserved.

## Checklist and follow-up

- [x] Fix typography and desktop column spacing; recapture and compare.
- [x] Remove desktop overflow; verify responsive widths.
- [x] Verify create, continue, exclusive seats, sync and persistence.
- [x] Pass 89 focused tests, native TypeScript, targeted ESLint and production image build.
- [x] Verify SQL transactions and deploy with existing stack configuration preserved.
- [ ] Optional P3: reduce desktop row height slightly for closer illustrative density.

---

# Staff session redesign — 2026-10-11

final result: passed

## Comparison target and evidence

- Source visual truth: `C:/Users/Reid/.codex/generated_images/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/exec-3f88ce9f-6ef8-4b22-8e87-6cdcfc069316.png` (user-selected option 1, refined for Mentor/Mentee).
- Implementation URL: `http://127.0.0.1:3111/simulator/staff?session=22222222-1111-4111-8111-111111111111`.
- Evidence directory: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/staff-redesign`.
- Implementation screenshot: `implementation-desktop-final.jpg` in that directory.
- Viewport: 1440 × 1024 CSS pixels, devicePixelRatio approximately 1. Source raster 1487 × 1058; browser capture 1425 × 1013. Both were normalized to 1440 × 1024 for comparison; density normalization avoids false pixel findings from capture scaling. Neither includes browser chrome.
- Matched state: light theme, signed-in staff fixture, three sessions, Tower circuits selected. Mentor vacant and mentee Jamie in the selected row. Dynamic codes and timestamps differ intentionally.
- Full-view combined evidence: `comparison-final.jpg`. Focused combined evidence: `comparison-table-detail.jpg`. Both opened and visually reviewed after the final CSS changes.
- Responsive evidence: `implementation-tablet-final.jpg` (1024 × 768) and `implementation-mobile-final.jpg` (390 × 844, full page). Additional dark, long-name, empty, error, signed-out and new-session dialog captures are in the same directory.

## Findings and comparison history

1. Initial combined comparison (`comparison-initial.jpg`) found P2 spacing/density drift: heading/table appeared too high, actions aligned too far right, and oversized selected details crowded the footer. Small table copy weakened the hierarchy.
   Fix: increase content top padding, adjust heading scale and table tracks, align actions to the left, compact the selected drawer, and place retention details in an expandable footer. Revised capture: `implementation-desktop-revised.jpg`.
2. The next combined comparison found P2 typography drift: session/table text was still too small. Fix: table body 16px, session titles 18px, supporting text 14px, primary controls 16px and navigation 18px. Phone layout pairs Mentor/Mentee after a full-width activity date.
3. Final combined full-view and focused comparisons use `implementation-desktop-final.jpg`. No actionable P0/P1/P2 remains. The hierarchy, ledger structure, selected-row treatment and control grouping reflect the selected direction. Phone rows and selected details remain readable with long names.

## Required fidelity surfaces

- **Fonts and typography:** uses the actual shared Source Sans Pro site family and dashboard typography tokens. The heading, session names, metadata and actions have clear hierarchy, deliberate line heights and responsive wrapping. The real shared header is retained rather than reproducing the generated font approximation.
- **Spacing and layout rhythm:** desktop ledger columns align; selected drawer remains grouped beneath the table; generous heading separation matches the chosen direction. At 1024px and 390px document width does not exceed viewport width. Phone rows use stacked metadata, paired Mentor/Mentee and full-width radar actions.
- **Colors and tokens:** shared learning/dashboard neutral surfaces, muted text, blue actions, pale blue selection and semantic danger text; Light/Dark/System appearance works. The production blue token is intentionally used instead of the generated image's cyan approximation. Visible keyboard focus is preserved.
- **Image quality and assets:** actual supplied ATCMH logo, existing account avatar component and Phosphor icons are reused. No artwork or logo has been replaced with CSS drawings or fabricated SVGs. The local fixture has no photo, so the existing account component displays its standard initial.
- **Copy and content:** title is ATCMH Simulator. Separate Mentor and Mentee columns show current occupants or exact `None` for vacant seats, including stale stored-name cases. Creator remains separate. The drawer repeats both people. Real UUID-backed codes/links replace illustrative mock codes. No speculative active badge or nonfunctional ellipsis controls were added. Copy mentee link and retention guidance are retained as existing product functions.

## Interaction, accessibility and runtime verification

- Nine focused session-service, API and shared-workspace tests passed; TypeScript and targeted ESLint passed.
- Browser verified copy session code and mentee link, session selection, occupied-session details, local mock scenario launch with optional mentee ID, New session Escape/focus restoration, and opening/cancelling End session.
- Browser verified Light/Dark themes, phone/tablet layouts, long names, empty library, absent published scenarios (disabled creation), signed-out access and expected 503 error feedback.
- Final visible occupancy matrix: `[[None,None],[None,Jamie],[Alex,None]]`. Separate vacated fixture verified every seat becomes `None` despite retained names.
- Final default-page console errors/warnings: none. The intentional error fixture's 503 is an expected test condition.
- Native dialogs, semantic table headings, labelled inputs, selected state, focus outlines and minimum primary touch targets remain available.
- Verification used local fixtures; no production session creation, deletion or scenario mutation was performed. The local preview is a real frontend served with a local API fixture proxy. No backend or schema change is required.

## Intentional deviations and limits

- Uses the existing learning header, font and color tokens to satisfy the user's theme instruction; generated header proportions are approximate.
- Drawer includes both Mentor and Mentee, plus the existing Copy mentee link action. Real session codes are longer than illustrative mock codes. Misleading activity badges and unused ellipsis controls are omitted.
- Browser verified the library interactions; radar behavior is outside this visual change and was not re-tested end to end. Production image build and deployment are not part of this handoff.
- Optional P3: a future shared-header adjustment could make header and library content widths identical; currently the header follows the existing learning-page layout.

## Implementation checklist

- [x] Implement selected direction with shared learning theme and ATCMH Simulator branding.
- [x] Show current Mentor/Mentee or `None`; keep creator distinct.
- [x] Preserve session creation, selection, sharing, access gates and end confirmation.
- [x] Fix P2 visual findings, recapture and inspect combined full/focused comparisons.
- [x] Verify desktop/tablet/phone, themes, key interactions and vacant-name cases.
- [x] Leave the local preview running for review.

final result: passed

### Post-deployment verification — frontend 1.8.54

User authorized deployment after the local handoff. Local production image build and publication passed, followed by Portainer deployment and digest/health/configuration verification. Real signed-in live desktop/phone library and New session open/cancel were verified without production mutations. There are currently zero live sessions; deployed table/name/copy behavior was verified with local API fixtures serving the real deployed HTML and assets. Screenshots and browser receipt: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/staff-redesign/deployed`. No console errors or phone document overflow. Deployment receipts are in sibling `staff-redesign-release/private`.

final result: passed

---

# Simulator library extension — 2026-10-11

final result: passed

## Visual target and evidence

The user requested the other three library pages in the already approved/deployed Sessions direction. Source visual truth: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/staff-redesign/implementation-desktop-final.jpg`, the accepted implementation of selected option 1. This is an extension of that selected design, not a new visual direction. Original generated reference remains `C:/Users/Reid/.codex/generated_images/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/exec-3f88ce9f-6ef8-4b22-8e87-6cdcfc069316.png`.

Evidence directory: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/library-redesign`.

- Source captures before changes: scenarios-before.jpg, assignments-before.jpg, replays-before.jpg, captured from real signed-in live pages and opened before implementation.
- Local implementations: `http://127.0.0.1:3113/simulator/scenarios`, `/simulator/assignments`, `/simulator/replays`.
- Final captures: scenarios-final.jpg, assignments-final.jpg, replays-final.jpg.
- Combined full-view comparisons: scenarios-comparison.jpg, assignments-comparison.jpg, replays-comparison.jpg. Source and implementation were placed together and visually inspected.
- Combined focused header/navigation/heading comparison: scenarios-comparison-detail.jpg (opened); equivalent assignment/replay focused files also saved. Main row controls, typography and form content were inspected directly in desktop/phone captures.
- Viewport 1440 × 1024 CSS pixels, DPR approximately 1. Source 1425 × 1013 raster; scenarios/assignments 1440 × 1024; replays 1425 × 1013. All normalized to 1440 × 1024 for comparisons. No browser chrome included.
- State: signed-in local fixture, Light, published/draft scenarios, completed/active assignments, complete/partial/summary replays. Source has the Sessions tab selected; implementations select their own tab. This is an intentional route difference, not a state mismatch defect.
- Phone evidence: scenarios-mobile.jpg, assignments-mobile.jpg, assignment-form-mobile.jpg, replays-mobile.jpg; dark evidence: scenarios-dark-mobile.jpg. CSS viewport 390 × 844; no document overflow. Real native select truncation preserves a complete accessible option name.

## Findings and five required surfaces

No actionable P0/P1/P2 visual differences remain in the combined comparison. The first visual pass required no layout correction. A content refinement corrected the existing singular `1 events` label to `1 event` before final capture.

- Fonts/typography: reuses actual shared Source Sans Pro, identical heading scale/line height and nav weights through CSS composition. Row headings use 22px for content hierarchy; metadata is 16px with 14px supporting copy and 13px status labels. Phone uses 20px row titles and readable metadata with wrapping.
- Spacing/layout: exactly reuses approved frame, tab navigation, heading rhythm, content inset, primary controls and footer styles. White bordered rows group each record and its actions. Assignment form stays inside the same content frame with two desktop columns and one phone column. Phone actions stack with clear primary actions. Replay entries are taller than session table rows because they include historical people, format and completion metadata; vertical scrolling is intentional.
- Colors/tokens: shared dashboard light/dark neutral surfaces, blue links/actions, muted metadata and pale selected status labels. Both Light and Dark are functional; visible focus styles and disabled controls are inherited. No new arbitrary palette was introduced.
- Image/asset quality: supplied logo, real account avatar component and existing appearance icons are reused by LearningFrame. No generated assets or custom artwork approximations were needed. Native controls and existing icon libraries remain.
- Copy/content: retains existing scenario/assignment/replay descriptions and actions. Staff replay metadata uses separate Mentor/Mentee labels, while historical missing participants remain `No participant recorded` to distinguish unavailable history from a currently vacant seat. Active tab and route titles are explicit. Permanent replay/attempt retention guidance remains.

## Interactions and accessibility

- Thirteen focused training API/service, replay and scenario-session tests passed. TypeScript and targeted ESLint passed.
- Native browser verified published/draft action differences, active tabs and correct scenario/new/edit routes; assignment creation with optional due date, published revision selection, 5-attempt limit payload, and fixture-only submission; expandable briefing, feedback and review-attempt links; active Resume and completed Start actions remain.
- Replay Next changes to Page 2 with Next disabled; Previous returns to Page 1. Recording/partial/summary labels, mentor/mentee names and Watch/Review destinations were verified.
- All three empty states and API failure alerts were exercised. New assignment disables when no published scenario exists. Failure fixture intentionally returns 503; these expected network errors are distinguished from application runtime errors.
- Phone layout and form captures were opened and inspected. Body width does not exceed viewport. Semantic headings, labelled form fields, current tab, keyboard focus and touch targets remain.
- Local fixtures intercept mutations; no production scenario, assignment, attempt or session was created or edited. Scenario editor, mentee assignment layout and replay playback workspace retain their existing layouts. The shared replay participant wording now says Mentor.

## Checklist and follow-up

- [x] Extend the approved visual system to the three staff library pages.
- [x] Retain access checks, actions, history and pagination.
- [x] Inspect full and focused combined source/implementation comparisons.
- [x] Verify phone, themes, empty/error states and key local fixture interactions.
- [x] Pass focused tests, types and lint before release build.
- [x] User-authorized deployment: build and publish locally, preserve Portainer configuration, and verify the live release.

Optional P3: deeper editor/playback theme work can be a separate follow-up; those operational workspaces are outside this three-library redesign.

final result: passed

### Post-deployment verification — frontend 1.8.55

Local publication and Portainer deployment completed successfully. Published/live image digests match; frontend health is healthy and all three containers have zero restarts. Backend remains 3.8.26. Only frontend/retention image references changed; all 26 environment entries and other stack configuration were preserved.

Real signed-in live checks verified the published scenario, empty assignment library, assignment form open/cancel and four existing replays. Desktop and 390 × 844 phone captures were inspected with no horizontal overflow or browser warnings/errors. Local fixtures separately verified populated assignments and mutations without production writes. No production form was submitted. Evidence and browser receipt: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a128c9-5cc0-7742-bda9-4e3c09faf8cc/library-redesign/deployed`. Deployment receipts are in sibling `library-redesign-release/private`.

final result: passed

## Airport and grouped frequency setup — 2026-10-11

Product Design implementation and QA extends the existing Simulator library and dark operational editor. The latest user instruction groups Ground and Tower into one scenario choice. No production content, sessions, images or deployments were changed.

### Visual truth and evidence

Evidence root: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a12c4c-1e9f-7002-a932-b3ab2dac80ba`.

- Source truth: `airport-library-source.png` (live Scenarios library, Light) and `airport-editor-source.png` (existing empty EGPH editor). Both are 1247 × 1244 pixels with a 1247 × 1244 CSS viewport. Source display originally reported DPR 1.5; screenshots are already CSS pixel sized. No further resampling was used for the final comparisons.
- Final implementation: `airport-setup-grouped-desktop.png`, `airport-setup-grouped-dark.png`, and `airport-editor-grouped.png`. Each is 1247 × 1244 pixels at 1247 × 1244 CSS, DPR approximately 1.0. Local fixtures provide a placeholder account avatar, an accepted test-state difference.
- Full combined comparisons viewed together as source plus implementation: `airport-setup-grouped-comparison.png` and `airport-editor-grouped-comparison.png`, each 2494 × 1274 including the 30-pixel evidence label. Source and implementation were inspected in the same image input. The editor's selected EGLL geometry intentionally differs from the EGPH source. `airport-editor-final-comparison.png` additionally compares unchanged EGPH geometry at matching dimensions.
- Focused inspector comparison: `airport-inspector-grouped-comparison.png`, 620 × 665, uses equal 310-pixel source/implementation crops without resampling. The empty-state help area now contains airport and grouped frequency controls; the inspector width and operational styling are retained.
- Phone: `airport-setup-grouped-phone.png`, full-page 374 × 876 captured at CSS 390 × 844 and DPR approximately 1.0. Browser screenshots clip to the rendered body excluding the scrollbar. DOM width checks found body scrollWidth 375 ≤ viewport 390; controls, text, and actions fit and remain visible. Temporary viewport overrides were reset.
- Other interaction evidence: `airport-editor-saved.png` (SBBR ground traffic and calculated taxi route); `airport-setup-delivery.png` is a context-preserving crop of the final desktop form for handoff.

### Fidelity assessment

- Fonts and typography: existing application font and fallback chain retained. Heading hierarchy, optical weight, tracking and muted supporting text match the library; compact labels match the inspector. Native selectors use inherited font and appropriate 16-pixel phone text. Long airport names truncate inside the selector while preserving ICAO; expanded options expose the complete names. Source and implementation wrapping were checked at the same desktop CSS width.
- Spacing and layout: shared LearningFrame/navigation preserve header height, page alignment and content rhythm. The new form is capped at 760 pixels, has two desktop columns and one phone column, and reuses the library actions. The compact inspector retains its width, padding, dark border rhythm and scope/timeline proportions. The new form content and different airport map are intentional additions.
- Colors and tokens: existing library ink, muted, border, surface and link tokens drive Light/Dark themes. The inspector uses its existing operational palette. Focus outlines and disabled future choices remain legible. Corrected dark text contrast is verified below.
- Assets: the existing ATCMH logo and shared appearance/account controls are retained. No source asset was replaced by a code-drawn approximation. Airport geometry is the actual imported vector data; EGPH geometry is unchanged. Local placeholder avatar and development indicator are expected test-only differences.
- Copy: Airport & frequency, Training frequencies, Ground & Tower and the service summary accurately describe the final grouped selection. Approach and Center are explicitly disabled Coming soon choices. Help explains that handoffs and ATIS are included. Airport locking is explained when traffic/events exist.

### Findings and comparison history

1. [P1, corrected] Dark setup foreground used the wrong token and fell back to dark blue against a dark background. Evidence: `airport-setup-before-fix.png`. Fix: use the shared `--dashboard-ink` token. The side-by-side `airport-contrast-comparison.png` shows before/after at the same capture scale. Post-fix `airport-setup-grouped-dark.png` retains readable headings, selected values and summary. No actionable contrast issue remains.
2. Earlier exploratory desktop captures used different viewport heights. They were not used to claim region-size fidelity. Final combined evidence was recaptured at matching 1247 × 1244 CSS and image dimensions; no density normalization was necessary.
3. The user then requested Ground and Tower together. The selector, summary, editor footer, persisted group and list labels now use Ground & Tower. Updated evidence is `airport-setup-grouped-comparison.png`, `airport-editor-grouped-comparison.png`, and the focused grouped inspector comparison. Legacy individual Ground/Tower pins remain readable with their original initial frequency.

No actionable P0/P1/P2 design findings remain. No open design questions. Optional P3: real Approach/Center service/sector behavior is intentionally future work.

### Interactions and validation

- Verified all seven airport choices, grouped Ground & Tower, and disabled Approach/Center choices through rendered controls. EGLL opens its four runway-end labels; SBBR includes correct 3,497 ft field elevation.
- Local save/reload retains EGLL and its grouped selection. SBBR rehearsal, back-to-editor, gate spawn, A* taxi route and airport locking with traffic were checked. Fixture mutations are intercepted in memory; no production form was submitted.
- Light/Dark and 390 × 844 phone behavior were checked. Browser console error collection returned an empty list.
- Production build (including TypeScript) and scoped ESLint passed. All 267 simulator tests passed, including grouped selection, legacy pins, every runway's mapped route, explicit runway crossings, actual taxi movement, concurrent airport sessions, published revisions, assignments/restarts and replay metadata. The full frontend regression suite passed: 863 tests passed, zero failed, three existing skips (866 total).

### Implementation checklist

- [x] Add six pinned airport snapshots and retain EGPH.
- [x] Group Ground & Tower for scenario creation, retaining separate runtime handoff channels.
- [x] Reserve disabled Approach/Center choices and stable station/sector identifiers.
- [x] Preserve old scenarios, assignments, sessions and replays.
- [x] Inspect full/focused combined comparisons and correct dark contrast.
- [x] Verify themes, phone layout, local persistence and airport-aware movement.

final result: passed
### Airport release deployment verification — frontend 1.8.57

User-authorized local image publication and Portainer deployment completed successfully on 2026-10-11. Versioned/latest published digests match the live frontend and retention containers; frontend health is healthy and all three containers have zero restarts. Backend remains 3.8.26 with its unchanged JAR. The two frontend image references were the only Compose edits; all 26 environment entries and other configuration were preserved. No migration or production content mutation was performed. Simulator record counts remain 1 session, 1 scenario, 4 revisions, 0 assignments and 10 attempts.

The isolated release source passed 863 tests with three existing skips (866 total), scoped lint and production Docker build/TypeScript. All seven public airport JSON datasets match their frozen source exactly. Public version is 1.8.57, affected routes and health return 200, anonymous simulator APIs return 401, and About/data attribution is available.

Browser-rendered live evidence: `C:/Users/Reid/.codex/visualizations/2026/10/11/01a12c4c-1e9f-7002-a932-b3ab2dac80ba/airport-release/deployed`:

- `creation-desktop.png`: signed-in Dark creation form with EGLL and Ground & Tower, 2560 × 1271 CSS at DPR 1.5. Source visual comparisons remain in the preceding implementation QA; the deployed form retains the verified design.
- `creation-phone.png`: full-page Dark form at CSS 390 × 844, DPR approximately 1.0; body scrollWidth 375 ≤ viewport 390. Both selectors, supporting copy, summary and actions remain visible.
- `editor-egll.png`: real deployed EGLL scope with four runway ends and grouped frequency inspector. Every other airport scope was verified through its rendered airport label after selection.
- `legacy-egph-editor.png` and `legacy-egph-locked.png`: the existing scenario still loads five aircraft/two events, with EGPH locked while content exists.
- `browser-verification.json`: all airport choice/scope checks, phone dimensions, legacy scenario result and empty warning/error collection.

No production scenario Save/Publish, session creation, or controller action was used for browser verification. Temporary viewport override was reset; the existing user tab was returned to the scenario library. No new actionable P0/P1/P2 findings. Release receipts and encrypted backups are in sibling `private`; frozen source/helpers are under ignored `Frontend/build/airport-release`.

final result: passed
## Recent training feedback redesign (2026-10-14)

Source visual truth: `design-evidence/recent-training-feedback/selected-design.png`, the user's selected second direction revised to replace next-session recommendations with the saved descriptive Session summary. Built-in ImageGen produced the revised target from the selected image; no generated raster assets are used in the component itself.

Implementation: actual `src/dashboard/components/admin/RecentTrainingFeedback.tsx` and its scoped CSS, rendered through the ignored Vite harness `build/feedback-redesign`. Preview: http://127.0.0.1:4173/. All records and summaries in the harness are illustrative fixtures. The existing saved-feedback read is stubbed locally; no live session/attendance changes or feedback generation occurred.

### Evidence and normalization

- Source is 1586 x 992 pixels; resized proportionally to 1280 pixels wide before comparison. Desktop CSS viewport 1280 x 800, DPR 1. Full-page implementation screenshot is `feedback-desktop.jpg`; `feedback-preview.jpg` is the 1280 x 900 viewport handoff. The section alone is compared, excluding the illustrative harness controls and surrounding navigation.
- `feedback-comparison-before.png` and `feedback-comparison-after.png` each place the normalized source and rendered section together in a single comparison input. Both were inspected directly; the final source/implementation comparison has no actionable P0/P1/P2 mismatch.
- `feedback-comparison-focus.png` compares readable category labels, rating rows, Session summary and links. Source and implementation use the same saved example text, selected first session, four sample rows and dark theme.
- `feedback-phone.jpg`: CSS 390 x 844, DPR 1, Dark. `feedback-phone-light.jpg`: same viewport, Light with eight historical categories. Native phone viewport inspection verified the summary above ratings, readable 16px body, 44px link targets and complete table. The full-page screenshot contains additional off-screen content; ordinary viewport captures were also inspected to avoid judging a scaled full-page image.
- Additional checks at CSS widths 320, 768 and 1024 all had document scrollWidth no greater than the viewport. Details retained readable wrapping and all categories. See `feedback-responsive-checks.json`.

### Comparison history

1. Initial implementation: P2 heading hierarchy was too quiet (20px) and rating rows were too tall relative to the selected design. Evidence: `feedback-desktop-before.jpg` in the chat visualization directory and `feedback-comparison-before.png`.
2. Fixed title to 24px desktop, reduced table row padding from 9px to 4px, and tightened disclosure row padding/minimum height. Shortened the description to the completed-session scope; per-session interrupted/not-held notices retain relevant context. Recaptured and compared in `feedback-comparison-after.png` and `feedback-comparison-focus.png`.
3. Final comparison: no actionable P0/P1/P2 findings. The slightly more spacious link area and semantic rating-dot colors are acceptable differences consistent with the existing product tokens.

### Required fidelity surfaces

- Fonts/typography: the existing bundled Source Sans Pro is retained. Body text 16px, category text approximately 15px, desktop title 24px. Text wraps without truncation. Phone heading uses the existing compact scale.
- Spacing/layout: selected expandable ledger, aligned airport/date/status columns, category table left and summary right, thin row separators, no nested cards. On phones the summary appears first and ratings follow. Header and neighboring profile sections remain outside this change.
- Colors/tokens: existing `--bg-color`, `--text-color`, `--muted-text`, `--border-color`, `--accent-color` and semantic success/warning/error colors work in Light and Dark. Written ratings accompany decorative dots.
- Assets: directly imported existing Phosphor icon library; no custom-drawn imagery or invented branding. The preview's supplied ATCMH logo is contextual only; production header is untouched.
- Copy: Session summary displays only `summary.overview.text`, exactly once. No next-session recommendation is synthesized or rendered. Seven/eight categories render dynamically. No provider, source-message count, confidence or cache metadata is exposed. Dates/times are explicit UTC, matching the backend's Instant serialization.

### Behavior and validation

- Keyboard Enter/Space and click expand/collapse correctly; only one session is open at a time. Opening another row retained one saved-feedback read and zero writes.
- First available saved feedback opens initially; otherwise the first session opens. Missing, pending, unavailable, empty, loading and read-error states were checked. Not-held feedback displays its descriptive summary with no performance grades.
- Existing session navigation route and validated Discord assignment-thread links are preserved. Malformed links are omitted; saved text is escaped.
- Both seven-category new feedback and eight-category historical feedback were exercised. Browser warnings/errors: none.
- 14 focused tests passed, covering the actual rendered list, UTC rollover, dynamic rubric rows, safe links, not-held grading and read-only API contract, plus existing mentee/session UI checks. TypeScript and scoped ESLint passed. Production build passed; final build after visual spacing edits is recorded in the chat.

### Open questions and follow-up polish

No blocking questions. Production feedback may be longer than the illustrative text; the component wraps it without truncation. No deployment or publication is part of this redesign request.

### Implementation checklist

- [x] Implement the selected expandable ledger and the user's summary correction.
- [x] Preserve saved feedback API semantics and existing data.
- [x] Verify full/focused visual comparisons, phone themes, responsive states and keyboard interaction.
- [x] Keep the local preview available for review.

final result: passed


## Session view popup - option 1 (2026-10-14)

final result: passed

The session popup implementation and its comparison history are recorded in [session-popup/design-qa.md](design-evidence/session-popup/design-qa.md). Desktop 1487 x 1058, phone 390 x 844, landscape 844 x 390; cancellation tested with intercepted synthetic requests only. Earlier QA records above are preserved.

# Sessions table and filters — option 3 (2026-10-14)

final result: passed

Selected visual: `design-evidence/sessions-redesign/reference.png`, the third displayed generated image (`exec-780b4903-1174-45f4-8ecc-8de4f76bc9b3.png`).
Implementation: `design-evidence/sessions-redesign/desktop.png` and `phone.png`.
Full-view comparison: `design-evidence/sessions-redesign/comparison.png`.
Focused table comparison: `design-evidence/sessions-redesign/table-comparison.png`.

## Scope and normalization

The actual AdminSessions component and shared theme/styles run in an ignored Vite harness with synthetic sessions. The harness supplies surrounding header context; production authentication, navigation, APIs and session details are preserved. No production writes or deployment were performed.

Reference pixels: 1487 × 1058. Desktop CSS viewport: 1440 × 1024, browser PNG: 1425 × 1013. Both are normalized to 1440 × 1024 for the combined full-view and focused comparison. Phone CSS viewport: 390 × 844. Tablet CSS viewport: 1024 × 768. The browser viewport override was reset after verification.

## Findings and repairs

- P2 fixed: automatic table sizing allowed a long display name to consume the mentee column and squeeze other columns. Explicit column proportions now wrap long names while keeping dates, status and actions readable. The final full-view and focused comparisons show the correction.
- P2 fixed: phone grid alignment stretched Upcoming/Past badges across the value column. Badges now align to the end at their natural width; the final phone capture shows the correction (77px badge within a 341px row).
- P2 fixed: relative font sizes inherited the dashboard's smaller root baseline. Explicit 14px table/filter text, 13px headings/badges and 12px secondary text restore readable sizing. Date/time has a stronger weight and the filter title is 18px.
- Accepted: ISO UTC date text and localized secondary text retain the existing shared formatter. Mock weekday errors and contradictory status/date combinations were not copied into application behavior.
- Accepted: existing page sizes, saved ordering and session records determine visible rows and footer location. The reference has eight illustrative rows; verification uses 32 records and the existing 10/25/50/100 options.
- Accepted: header/account/quick-search UI remains owned by the existing dashboard; it is outside this table/filter redesign.

## Fidelity surfaces

- Typography: existing site font, readable 14px core text, quieter secondary dates, stronger UTC date/time, sentence-case sortable headings.
- Spacing/layout: 240px filter track, 24px gap, vertical divider, eight-column table, compact text actions and flat pagination. Tablet keeps table scrolling inside its container; phone uses labeled cards and collapsible filters.
- Colors/tokens: shared Light/Dark tokens; identical neutral row backgrounds including cancelled sessions. Cancellation uses a neutral badge; upcoming uses blue and past uses green. No red row style or cancellation row class remains.
- Assets: existing brand asset and Phosphor search/sort/filter icons. No generated illustration or replacement brand assets were needed.
- Copy/content: all existing filter capabilities retained. Not held displays Attendance retained separately; results count is visible and announced. Existing detail/feedback/cancellation behavior is preserved.

## Interaction and technical verification

- Mentor, mentee and attendee searches; empty result; clear filters; cancelled-only status; past period; My sessions; inclusive UTC date range (four sessions on 13 October); sorting; next page; page size; restored mentor/status/page size after reload.
- Session details open/close and attendees tab, using synthetic records and mocked saved feedback. No session outcome changes were submitted.
- Phone filters open/close, active count, matching cards and natural-width badges. No horizontal page overflow at 1440, 1024 or 390px. The 1024px table scrolls within its container.
- Light theme verified; all rows share rgb(248,250,252). Dark rows share rgb(32,32,32). Browser error console is empty.
- Seven focused tests pass. TypeScript and scoped ESLint pass. Vite preview production build and full Next.js production build pass. The Next build required execution outside the Windows filesystem sandbox after a compiler access-denied error.

No outstanding actionable P0/P1/P2 findings. Follow-up polish: final shell verification after a user-authorized release.


## Mentee session popup repair — 2026-10-14

Final result: passed

Scope: the screenshot showed the older SessionDetailsModal on the mentee profile. This repair reuses the current Sessions dialog's visual language while preserving the mentee-specific edit, attendee and cancellation callbacks. No production data was changed and nothing was deployed.

Evidence: [before/after](design-evidence/mentee-session-popup/comparison.png), [desktop](design-evidence/mentee-session-popup/after-desktop.png), [phone](design-evidence/mentee-session-popup/after-phone.png), [short landscape](design-evidence/mentee-session-popup/after-landscape.png), [light](design-evidence/mentee-session-popup/after-light.png), [saved feedback on phone](design-evidence/mentee-session-popup/feedback-phone.png).

The original and final screenshots use the same synthetic record, dark theme, open popup and 1266 × 721 CSS viewport. The comparison shows both captures together; the scrollbar disappears after the body-scroll lock, accounting for the native capture width difference. Phone verification uses 390 × 844 and short landscape uses 844 × 390. No real names, feedback or production writes were used in the preview.

- P2 fixed: feedback previously touched the modal edge; all tab content now shares a consistent inset.
- P2 fixed: the long, single scrolling form buried attendees and cancellation. Details, Feedback and Attendees tabs separate those tasks; the header, tabs and action footer stay visible while only the body scrolls.
- P2 fixed: the edit form's three narrow columns squeezed the datetime input and its explanation. Airport and requested pilots share a row; session time has a full-width row.
- P2 fixed: phone close control initially sat between the title and status. It now sits at the upper right with the status below the title/time.
- Existing typography, neutral surfaces, borders, accent colors and Phosphor icons are retained. No new image assets were needed.

Verified: arrow-key tab selection, unsaved airport retention across tabs, one saved-feedback read across tab switches, successful synthetic save preserving pilots and the original UTC instant, attendee add/remove, cancellation dismissal and failed-cancellation recovery, nested Escape, focus trapping/restoration, body-scroll restoration, cancelled read-only state, loading/unavailable/ready feedback, Light/Dark themes and no horizontal overflow. Browser error console is empty. The footer remains in view at 844 × 390 while the body scrolls (148px visible body, 372px content).

All 14 focused tests pass; source TypeScript and scoped ESLint pass. The standard project-wide TypeScript command is independently blocked by a generated Next.js exam submit-route check rejecting the unrelated submitKeepaliveAttempt export. That route was not changed for this popup repair. No production build/deployment was requested or performed.

No outstanding actionable P0/P1/P2 popup findings. The localhost preview uses the real component with synthetic API responses and is available at http://127.0.0.1:4331/?state=ready.


### Release verification — 26.10.1

Published and deployed the popup repair on 2026-10-14. Production frontend build/TypeScript now passes after moving the existing exam submission helper to a sibling module; all 961 frozen frontend tests pass apart from three existing skips, and ESLint has zero errors. Image digest/platform identity and live health/version checks passed. Local visual QA above remains the popup interaction evidence; the new live browser check reached the signed-in homepage but the popup check was interrupted. No production edit, cancellation, attendee or feedback-generation action was submitted. Session/link/AI-result fingerprints remain unchanged. Final popup QA result: passed.


## Scenario aircraft inspector — selected option 2 (2026-10-14)

**Source visual truth:** Frontend/design-evidence/scenario-gates/selected-option-2.png, the second generated image displayed in this chat (exec-f5c8909a-f6f0-46ff-b52a-1525713e507a.png).

**Implementation:** src/simulator/ScenarioAircraftInspector.tsx and its CSS module, integrated into the existing ScenarioEditor. Local preview: http://127.0.0.1:4355/?fixture=ground&rev=2. The harness uses synthetic records and blocks writes; production was not contacted.

**Evidence and normalization:** source and final implementation both 1487 × 1058 pixels at a 1487 × 1058 CSS viewport, density 1, dark theme, EGPH local training, Easy 100/A320 selected at Gate 210, Setup active, advanced fields collapsed. Final screenshot: design-evidence/scenario-gates/sidebar-option-2-final.png. Full-view comparison: sidebar-final-comparison.png. Focused inspector comparison: sidebar-final-detail.png. Both combined images were opened for review. The saved state and creator label in the final synthetic fixture are incidental context; aircraft and inspector state match the reference. Additional 1024 × 768 layout evidence: sidebar-tablet.png, with no horizontal overflow and a visible fixed footer.

**Comparison history:** initial combined images sidebar-initial-comparison.png and sidebar-initial-detail.png exposed a P2 density mismatch: the inspector was 360px wide, body controls 14px/40px and header 23px. Increased width to 388px, primary controls to 16px/44px, header to 26px, then refined section gaps and removed the unused stable scrollbar gutter. Recaptured and reviewed the combined final images. No outstanding actionable P0/P1/P2 visual findings.

**Required fidelity surfaces:**
- Typography: retains the existing Simulator Fira font. The selected-aircraft heading, subdued type/frequency line, cyan active tab and grouped form hierarchy follow option 2. Desktop fields use 16px and compact tablet fields use 14px. The generated mock's optical weight varies slightly; this is P3 polish, not a substituted brand font.
- Spacing/layout: 388px desktop inspector with paired fields, clear section dividers, collapsed advanced fields, independently scrolling panels and persistent header/tabs/remove action. Existing editor timeline and full-height inspector grid remain intact. Smaller landscapes retain controls and body scrolling.
- Colors/tokens: existing navy #10181e surface, #0b141b controls, pale blue text, cyan active underline and restrained red removal action. Focus outlines and selected drawing controls remain visible.
- Assets: real Phosphor Info, Trash, ArrowClockwise and CaretRight icons, existing licensed fonts and existing mapped airport rendering. No raster UI or fabricated airport drawing was introduced; all supported gates are displayed from the real dataset.
- Copy/content: Setup/Intentions/Routes labels, identity/frequency/appears fields, gate hint and Advanced initial state match the selected hierarchy. The existing free-text aircraft type remains editable; Reverse is a functional 180-degree action rather than the mock's unsupported Off menu. Heading display rounds to whole degrees while preserving stored precision until an edit. No assignments or briefings return.

**Interaction checks:** keyboard ArrowRight/Home tab navigation; callsign changes retained across panels; departure and full-stop changes retained; final IAS 170 committed on blur and retained; taxi waypoint drawing and count; tab switches clear drawing mode and restore gate dots; scheduled spawn added/removed through Appears; advanced ground/airborne behavior changes enable speed fields and hide/restore gate dots; Test opens rehearsal without validation errors and Back to editor retains edits. The previous gate verification covers map drag, off-target cancellation, keyboard gate selection and closest-dot click behavior across the same Scope integration. All 349 simulator tests pass; targeted ESLint, TypeScript and production build pass.

**Browser limitation:** clicking the unchanged native Remove aircraft confirmation stalled in-app browser input. The tool returned no actionable dialog handle; dismissal, subsequent tablet tab interactions and a new interactive radar check were not completed. No aircraft was confirmed removed and no production save occurred. A text request to dismiss the prompt remains pending. Final visual captures use explicitly staged synthetic fixtures, not a claim that input recovered. Console error checks before the stall and on the final fixture were empty.

**Implementation checklist:** completed tabbed layout, preserved all aircraft controls, accessible tab roles/keyboard navigation, clear gate placement, drawing-state cleanup, isolated styling, build/tests and final side-by-side comparison. No deployment or version change requested.

**Follow-up polish:** optional optical typography tuning against the generated raster; repeat the unchanged removal confirmation and radar interaction checks once browser input is available.

final result: passed


## Replay library option 1 — 2026-10-14

final result: passed

See [replay library QA](design-evidence/replays-redesign/design-qa.md) for the selected visual target, responsive screenshots, filter verification and validation limits. Existing reports above are preserved.
