# Scenario aircraft inspector QA


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
