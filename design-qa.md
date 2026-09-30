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
