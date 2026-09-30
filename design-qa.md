# Course hierarchy design QA

## Direction implemented

The course reader combines the layered study notebook surface from the selected desktop direction with a grouped vertical outline. The shell, warm workspace, outline, white reading paper, and checkpoint callouts have distinct surfaces. On phones the reading paper fills the available width and the long outline opens in a modal drawer.

## Browser review

- Reviewed the real reader component at desktop and 390 px phone widths with a 12-section, 120-subsection fixture. The desktop outline scrolls independently; the phone page has no horizontal overflow.
- Verified that a subsection deep link renders exactly one content article. Previous and Next links navigate to the expected subsection URL.
- Opened the phone outline drawer, checked its scrollable list, dismissed it with Escape, and confirmed focus returns to its trigger.
- Reviewed the staff preview with the same large fixture at desktop and phone widths. Its content, outline, and pagination rendered without horizontal overflow. Preview does not mount learner progress tracking.
- Reviewed the shared dashboard header at desktop and phone widths. The ATCMH icon, name, and Home link replace the old back pill.

## Follow-up in a deployed environment

The local visual fixture exercised the same reader and preview components without a live course API or login session. After the database conversion and backend deployment, verify a signed-in learner's actual checkpoint attempts, completion writes, and resume route against migrated data.

## Dashboard navigation and Assignments redesign

Visual targets were the approved desktop Assignments, phone list, phone editor, and navigation drawer images. Reviewed the rendered frontend with a temporary local data fixture at desktop, 390px, and 320px widths. The fixture was removed after review.

- Fixed the phone heading and New button collision.
- Kept Save visible while editing on phones.
- Raised the drawer above the fixed Save bar and confirmed group expansion.
- Confirmed assignment selection, search, and Back to templates in the local preview.

The local Dashboard API was unavailable, so authenticated data-backed flows could not be visually exercised in the preview. Frontend tests, lint, TypeScript, and production build cover the checked-in implementation.

final result: passed

## Dashboard appearance — 30 September 2026

### Reference and rendered evidence

Selected source: `C:/Users/Reid/.codex/generated_images/01a0e992-fe9e-7880-b363-4ea7b4a28ebf/exec-0f314c48-6795-4bc7-bcac-72ab5295b218.png` (1641 × 958 px). This is the approved **Deep gray** direction. It adds a theme to the existing dashboard; existing compact layouts and responsive action menus remain in use.

Evidence folder: `C:/Users/Reid/.codex/visualizations/2026/09/28/01a0e992-fe9e-7880-b363-4ea7b4a28ebf/dark-dashboard/`.

- Final catalog captures: `implemented-courses-1440.jpg` (1425 × 950 px), `implemented-courses-390.jpg` (375 × 812 px), and `implemented-appearance-390.jpg` (375 × 812 px). Browser viewport requests were 1440 × 960 and 390 × 844 CSS px. The in-app browser capture excludes some browser/scrollbar area; DOM measurements verify the available content width and both side gutters.
- `design-comparison.jpg` places the source desktop and phone artboards alongside the actual rendered catalog and phone menu. Source artboards are cropped with CSS; images retain their aspect ratio. Desktop views are normalized to 600 px wide, phone views to 350 px. Same state: one Ground Control draft, All courses selected, empty search. The phone comparison is also the focused region review for labels, form controls, badge, and menu.
- Additional actual-component captures: `implemented-dialog-desktop.png`, `implemented-preview-1440.png`, `implemented-exam-editor-1440.png`, and `implemented-light-390.jpg`.
- `responsive-checks.json` records route, background and document overflow checks. The local preview uses production components and styles with read-only example data and mocked auth/API boundaries. It does not write to production.

### Fidelity review and findings

No outstanding P0/P1/P2 theme issues remain in the final comparison.

- **Typography:** retained the site's existing display serif and UI font stack. Titles, descriptions, labels, and small controls remain readable; long records wrap. Phone form text uses 16 px to avoid focus zoom.
- **Spacing and layout:** retained the compact two-column catalog and single phone column. Header, page canvas, card, input, outline, paper, dropdown and modal backdrop remain separate DOM/CSS layers. Both phone side gutters are present. Preview and Statistics move into the existing phone overflow menu; the generated reference shows them inline. This intentional preservation keeps controls reachable at 320 px.
- **Colors and tokens:** canvas `#111111`, header `#191919`, working surfaces `#252525`, inputs `#161616`, and neutral borders. Links and focus use blue. Filled actions use `#2563eb` with white labels, and input boundaries use `#666666`, for clearer contrast than the generated reference. Error/success states keep semantic color. Light mode retains existing values through token fallbacks.
- **Assets:** existing ATCMH brand asset and Phosphor icons; no generated artwork or invented course metadata. Search uses a real icon. Existing course media is preserved.
- **Copy and density:** real title, description, status and actions only. Appearance offers Light, Dark and System. The draft badge is quieter than the reference's light gray pill; this is a P3 refinement only.

During implementation, corrected token mappings that gave neutral surfaces a warning tint, separated link and filled-button colors, and added input boundaries and phone font sizing. The final combined comparison above uses these corrections. Full-page browser screenshots temporarily clipped the right gutter while stitching; final catalog/menu evidence uses viewport screenshots, backed by DOM bounds, to avoid that capture artifact.

### Behavior and verification

- Verified keyboard menu navigation (arrows, Home, End, Escape and Tab), selection focus return, outside dismissal, and phone menu placement.
- Verified remembered appearance after reload and a new tab, cross-tab synchronization, System-mode changes with a controlled OS fixture, and explicit-mode overrides. Switching themes preserved an unsaved assignment draft. Blocked storage and pre-paint initialization are covered by the new tests.
- Checked the course catalog/editor/preview/statistics, assignments/list/editor, quiz catalog/editor, unlocks, attempts/review, import, website content, mentees, sessions, notes, accounts, audit logs, alt accounts, mock/application question editors, assignment guide and manual at 320, 390, 768, 1024 and desktop widths. No document horizontal overflow or clipped persistent controls was found. Embedded PDF document colors are unchanged.
- The Statistics page was subsequently rewritten by the separate **Improve dashboard stats** task. Its new CSS consumes the same dashboard tokens, and the shared production build and lint passed after that source returned. Its new reporting logic is outside this appearance change's verification scope.
- Final preview tab had no console errors. A preliminary malformed notes fixture caused an invalid-date error; correcting the fixture resolved it without a production change.
- Frontend suite: 569 passed, 3 skipped, 0 failed. Lint: 0 errors, 35 existing warnings. Production build and TypeScript passed. `git diff --check` passed.

Authenticated production data, server permission enforcement, and deployment were not repeated by the local fixture. This appearance feature requires no backend or schema migration; its preference is remembered in the current browser, not synchronized between devices.

Implementation checklist complete: palette, theme control, persistence, pre-paint initialization, dashboard surfaces, scoped confirmations, responsive verification, tests/lint/build, and rendered reference comparison.

final result: passed

## Exam attempt, flags, and separate review — 30 September 2026

### Reference and captures

Implemented the selected combined reference `exec-0a3a9556-b998-43aa-809d-2550e2575adc.png`: option 3's question workspace and option 1's review grid. The reference contains desktop and phone artboards. The written 1104px workspace limit and 80/48/24px outer padding take precedence over the generated image's approximate geometry.

Browser screenshots and the side-by-side reference comparison are in `C:/Users/Reid/.codex/visualizations/2026/09/28/01a0e992-fe9e-7880-b363-4ea7b4a28ebf/attempt-qa/`. Final captures: `question-1440.png`, `review-1440.png`, `question-390.png`, and `review-390.png`. `design-comparison.png` places the reference and implementation together without stretching the images. Matched state: question 3, 17 of 19 answered, questions 3/7/12 flagged, and questions 5/16 unanswered. The countdown naturally differs.

### Visual comparison

- Layout and spacing: separate utility column, inset question surface, answer rows, and navigation; review replaces the question rather than appending to it. Desktop workspace stays centered and capped. Phones use full-width content inside side gutters, with ordinary vertical scrolling for long content.
- Typography: existing site font, compact identity, readable prompt, clear status labels, and tabular timer. Quiz titles and long prompts wrap without clipping.
- Surfaces and color: existing dark assessment shell, darker utility layer, navy reading surface, blue selected answers, and red flags. Unanswered status remains visible separately from flags.
- Assets: Phosphor flag/list/circle icons; no generated imagery or placeholder artwork is required for this screen.
- Copy and density: real quiz fields only; no correctness feedback before submission. Five/four/three review columns and touch targets of at least 44px.

Initial comparison found legacy attempt selectors overriding the review tile sizing and a narrow utility column wrapping the title excessively. Removed the redundant legacy selectors and widened the column to 232px, then captured again. Submission errors now receive focus and scroll into view, including below a 100-question phone grid. No outstanding P0/P1/P2 visual issues were found.

### Interaction and responsive verification

Used the production AttemptForm, AttemptReview, styles, and custom leave-confirmation provider in a local browser harness. Only network submission/session responses and the Next router were stubbed; no live learner attempt was submitted.

- Checked flag/unflag by mouse and keyboard, answered-and-flagged and unanswered-and-flagged states, answer retention, question tile selection, Return to question, focus transfer, and single-question rendering.
- Checked pending controls, single submission, manual success/failure, timeout in both views, custom leave confirmation, Escape cancellation, and browser Back. Failure preserves answers and flags and focuses the error in review.
- Checked 320px, 390px, 768px, 1024px, and 2560px widths, including long prompts and 100-question grids. No horizontal overflow; 24/48/80px top padding and 3/4/5 columns verified. Temporary viewport overrides were reset.
- Randomized question order is retained by the existing attempt-order contract and covered by review rendering tests. Flags never enter the submission payload.

Frontend verification: 565 tests passed, 3 skipped, 0 failed; lint passed with 35 pre-existing warnings; production build and TypeScript checks passed. Real authenticated submission is not repeated by the harness; its existing API contract is unchanged. No backend or migration changes.

final result: passed
