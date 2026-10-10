# Staff simulator design QA

Date: 2026-10-10

final result: passed

## Comparison target and evidence

- Source visual truth: `C:/Users/Reid/.codex/generated_images/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/exec-ec907d16-4ea6-4e33-bd01-ddb349852ada.png` (selected option 2, refined with three response buttons).
- Implementation: `http://localhost:3105/simulator/staff` using the isolated local QA identity proxy.
- Screenshot: `C:/Users/Reid/.codex/visualizations/2026/10/09/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/staff-redesign-final.png`.
- Full-view combined comparison: `C:/Users/Reid/.codex/visualizations/2026/10/09/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/staff-design-comparison.png`.
- Focused dock combined comparison: `C:/Users/Reid/.codex/visualizations/2026/10/09/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/staff-dock-comparison.png`.
- Tablet: `C:/Users/Reid/.codex/visualizations/2026/10/09/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/staff-tablet-final.png` (1024 × 768).
- Taxi route: `C:/Users/Reid/.codex/visualizations/2026/10/09/01a1225c-d1f2-7e82-bf81-b055b48cb1d7/staff-astar-route.png`.

The source is 1672 × 941 pixels, normalized to 1280 × 720 for comparison. The implementation is 1280 × 720 pixels at a 1280 × 720 CSS viewport; measured devicePixelRatio approximately 1. Both artifacts were placed in each combined comparison input and inspected together. No browser frame is included.

Matching state: dark staff view, paused, Speedbird 124 selected, two aircraft, Pilot messages active, Request runway change with requested runway 06, pending enter-left-downwind instruction for runway 24, three enabled responses. Dynamic differences: session clock is 00:00 instead of the mock's 14:31; real OSM geometry and exercise aircraft positions replace the illustrative map. The staff scope deliberately shows both local frequencies in aqua. These are expected product behavior, not fidelity findings.

## Findings

No actionable P0/P1/P2 findings remain.

- Typography: Fira Sans controls and B612 Mono instruments preserve the reference hierarchy. Callsigns, field labels and response buttons are readable without wrapping at desktop and landscape tablet sizes. Some compact control text is slightly smaller than the generated target; this is acceptable for the additional explanatory line and real command text.
- Spacing/layout: the traffic rail, large unified scope and bottom contextual dock follow the selected composition. Controls remain above the fold. Secondary pilot responses scroll within the dock; persistent navigation stays visible. The command preview is wider to accommodate complete source-defined messages. No horizontal overflow at 1280 × 720 or 1024 × 768.
- Colors/tokens: black scope, charcoal surfaces, restrained borders, blue selected navigation and primary action, green Play, aqua traffic and runway status colors match the intended hierarchy. Disabled ownership controls are visibly unavailable.
- Image quality/assets: the map is the existing interactive OSM geometry renderer, not a raster imitation of the mock. Aircraft and airport symbols remain sharp. Standard Phosphor icons supply toolbar and navigation controls. There are no generated bitmap assets requiring extraction.
- Copy/content: the four aircraft sections and runway-specific request preview match the target. Readback, Readback & assign and Unable are explicit. The helper sentence explains the difference without exposing internal implementation details. Staff has no frequency tabs or ATIS editor.

## Comparison history

Before final combined comparison, implementation inspection identified unselected traffic cards inheriting generic button styling, insufficient map framing, and a tablet callsign wrapping unnecessarily. Scoped card styles, geometry-aware camera fitting and the tablet font rule corrected these. Earlier evidence: `staff-redesign-iteration1.png` and `staff-tablet-routes.png` in the evidence directory above.

The final combined full-view and dock comparisons found no actionable P0/P1/P2 differences. The final tablet screenshot confirms the callsign correction. No visual fixes were made after this final comparison.

## Interaction and engineering verification

- Browser: aircraft/section selection, runway-specific pilot requests, command delivery between staff and mentee tabs, all three response choices, flight controls, right-traffic takeoff assignment, A* route preview, reset confirmation, and landscape tablet controls.
- Unable was verified to acknowledge a crosswind instruction while preserving the current final leg. Readback & assign was verified to apply the stored instruction once.
- Competing staff tab displays an ownership explanation and disables Play, Reset, Add aircraft and mutation controls.
- At 768 × 1024 the rotate/use-larger-screen prompt is shown.
- Staff console: zero captured warnings/errors in the final fresh tab.
- Focused native tests: 47 passed, zero failures/skips. Includes command validation, response deduplication, A* shortest connected paths, both EGPH runway destinations, off-network refusal, hold-short stopping, takeoff with right traffic, patterns, transport and login routing.
- TypeScript, simulator ESLint and frontend production build passed.

## Implementation checklist

- [x] Unified staff radar and contextual controls.
- [x] Three distinct pilot response actions.
- [x] Runway parameter in applicable pilot requests.
- [x] Takeoff with left/right traffic simulation.
- [x] A* over mapped taxiway centerlines, terminating at hold-short points.
- [x] Desktop/tablet evidence and required fidelity surfaces reviewed.
- [x] Local prototype only; no publication or deployment.

## Follow-up polish

- P3: the existing Next.js development indicator appears at the lower left in development screenshots; production builds omit it.

Remaining boundary: routing depends on the bundled map's connected centerlines and returns an explicit error when no valid network attachment or route exists. It does not invent a straight path over unmapped airport surfaces.

## Frequency, command and pause refinement — 2026-10-10

final result: passed

This scoped Product Design refinement follows the user's existing simulator references and explicit request for an opaque gray staff-pause screen. There is no separate supplied pause mock. The previous normal mentee screenshot and new pause screenshot were inspected together at the same 1278 × 1208 viewport; hiding the entire simulator is the intended state change. The existing Fira Sans/B612 Mono typography and Phosphor icon family remain.

Evidence is saved privately under `C:/Users/Reid/Documents/Codex/2026-10-10/atcmh-simulator-frequency/private`: `pause-desktop.png`, `pause-tablet.png`, `frequency-logs-tablet.png`, `atis-tablet.png`, and deployed `live-pause.png`. Landscape tablet evidence is 1024 × 768. The live capture is 1278 × 1208.

- Typography/copy: centered Fira Sans pause heading, small B612 Mono simulator label, a clear resume explanation and Exit action. Final command choices now send immediately without the redundant confirmation shown in the user's attachment.
- Layout: the opaque `#303236` screen covers the full viewport, including radar, strips, logs, ATIS and audio controls. Underlying content is inert and aria-hidden; focus moves to the pause heading and returns after resume. Staff controls remain available. No horizontal overflow on desktop or landscape tablet.
- Colors: other-frequency logs use gray `#858585`. Selected ATIS tiles use white borders and neutral text; unselected borders are `#555`. Runway green/amber/red is derived from headwind/crosswind/tailwind, independently of selection. Live computed styles confirmed these rules.
- Assets: sharp existing vector symbols and a standard pause icon; no new raster assets or imagery required.
- Interaction: both transfer directions retain read state, new requests alone increment the correct frequency count, both logs include gray messages from the other frequency, and off-frequency tags appear only when selected. Direct sends, ATIS selections, pause/resume, staff closure, mentee engine continuation, returning staff control and tablet layouts passed browser checks.
- Engineering: 78 focused tests, TypeScript, targeted ESLint and the production Docker build passed. Fresh local staff/tablet tabs and live staff/mentee tabs captured zero console warnings/errors. An initial local dev-origin configuration error was corrected before final verification. The in-app browser was unavailable, so Chrome was used.
- Deployment: frontend 1.8.39 verified live, healthy with zero restarts. Existing signed-in staff/mentee tabs were refreshed. Live pause overlay covers the viewport, hides/inerts the contents and focuses the heading. The pre-existing exercise was retained and left paused; no production forms, published ATIS, database changes or pilot/controller messages were submitted for live QA.

No actionable P0/P1/P2 findings remain. Browser-local simulation still needs at least one simulator tab open; browser suspension can delay updates. Staff disconnection itself never pauses an exercise.
