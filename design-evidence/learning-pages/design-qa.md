# ATCMH Courses and Pilot Guide — visual QA

final result: passed

## Source and implementation

Approved visual reference: `C:/Users/Reid/.codex/generated_images/01a0fbda-2aa9-73c3-bf2a-ebe1def723b3/exec-f7935d9c-d4cb-464a-8ef9-8864c6f85a6f.png` (1680 × 936).

The selected Courses and Pilot Guide panels were cropped to 810 × 854. The final browser comparisons use the actual Next.js routes `/exams/courses` and `/pilot-guide` with the loopback-only invented-data fixture `mock-backend.mjs`. No live learner data or authentication bypass was added to the application.

Matched viewport: 810 × 854. The browser returned proportionally scaled captures of 524 × 552 for the final Courses image and 795 × 838 for the Guide image. The source panel is normalized to each capture's dimensions for comparison. Additional checks used 1440 × 1000 desktop and 390 × 844 phone viewports. Temporary viewport overrides were reset after QA.

## Evidence reviewed together

- `courses-comparison-final.jpg`: approved source and final rendered Courses screenshot in the same image.
- `guide-comparison-final.jpg`: approved source and final rendered Guide screenshot in the same image.
- `courses-focused-final.jpg`: paired branding, header, return button and theme control detail.
- `guide-focused-final.jpg`: paired chapter context, reading typography, tip and navigation detail.
- `courses-desktop-light-final.jpg`, `courses-desktop-dark-final.jpg`, `guide-desktop-light-final.jpg`, `guide-desktop-dark-final.jpg`: wider layouts in both themes.
- `courses-mobile-light-final.jpg`, `guide-mobile-light-final.jpg`, `guide-mobile-dark-final.jpg`: phone layouts.
- `courses-signed-out-light.jpg`, `courses-signed-out-dark.jpg`, `guide-staff-denied.jpg`: protected-page states in the standalone shell.
- `course-reader.jpg`, `exam-center-preserved.jpg`: course opening and retained exam-center shell.
- `learning-pages-preview.jpg`: combined implementation preview for the user.

## Findings and repairs

1. **P2 — Course spacing and density:** The first comparison had narrower cards and excess spacing that moved the third card action below the reference's visible region. Adjusted intermediate-width content margins, intro spacing, grid gap, image ratio, body type and card spacing. The final third action ends at 836px in the 854px viewport. Two equal columns remain at desktop/tablet widths; phones use one column.
2. **P2 — Guide reading column:** Initially the article filled the intermediate-width page. Constrained and centered the reading canvas, keeping chapter controls and previous/next navigation across the page.
3. **P2 — Guide intro height:** The preview label added an extra row at larger widths. Moved it beside the title with natural wrapping on phones.
4. **P2 — Dark tip surface:** Replaced the blue selected-state fill with the existing dashboard course-preview check surface.
5. **P2 — Signed-out theme mismatch:** Existing catalogue access styles fixed the canvas and text to navy colors. Replaced those literals with inherited dashboard tokens so catalogue and course-reader sign-in states follow the toggle.
6. **P2 — Light keyboard focus contrast:** Added a scoped blue focus token to the learning frame (4.92:1 against white, 4.45:1 against the canvas); retained the existing lighter dark-mode focus color.
7. **P3 — Image loading warning:** The third course cover can appear above the fold on large screens. Load the first four covers eagerly; later covers remain lazy. A fresh catalogue tab reported no console warnings or errors.

Final full and focused comparisons were inspected after repairs. No unresolved P0, P1 or P2 findings.

## Fidelity checks

**Typography:** Uses the bundled Source Sans Pro and dashboard heading/body hierarchy. Card text wraps naturally with actual course metadata; no text is baked into images.

**Layout and spacing:** Standalone ATCMH product branding, return control and sun/moon toggle match the chosen direction. Courses have two equal cards per row, with no featured treatment. The guide has horizontal chapter tabs, a centered article, chapter-position meter, tip and previous/next controls. Mobile headers wrap into two rows and chapter tabs scroll horizontally without page overflow.

**Colors:** Reuses the dashboard/course-preview light and dark palettes. Local theme choices persist after reload, and the pressed state reflects the resolved theme, including system mode.

**Assets:** Uses the existing ATCMH logo and three separately generated warm airport photos in `public/assets/courses`. These are production image assets, not cropped UI screenshots. Their subjects and composition follow the approved direction.

**Copy:** Preview course samples match the selected board. Production catalogue content comes from published backend courses. Guide text is intentionally short sample material pending the user's existing guide; the visible design-preview label identifies it.

## Behavior and integration

- Back to ATCMH successfully returned to `/` and displayed the main site's navigation and homepage.
- Open course navigated to the real course-reader route in the standalone Courses shell.
- Light/dark controls updated colors and pressed state, and persisted after reload.
- Guide chapter tabs, next/previous, Home/End keyboard selection, chapter position, and first/last disabled boundaries worked.
- At 390px, selected chapter tabs stayed visible; document scroll width matched its client width (375px), with no page overflow.
- Signed-out courses still require a verified learner session; the guide's existing admin/superadmin preview restriction still denies a staff-only fixture account.
- `/exams` retains its existing main-site shell. Its quiz data is unavailable in this design-only fixture, so real quiz behavior was not exercised.
- The clean final catalogue tab had no console errors or warnings. Earlier guide/tab checks had no JavaScript errors; the prior cover loading warning was repaired.

## Validation and limits

Full frontend tests: 618 total, 615 passed, 3 existing skips, 0 failed. Production build and TypeScript passed. Full lint passed with 0 errors and 34 existing warnings in unchanged files; focused lint for the new and changed learning components passed. `git diff --check` passed.

This task implements and verifies the design locally. The preview uses invented identities/course data on loopback. The user's real Pilot Guide content has not been supplied, and no publication or deployment was requested.
