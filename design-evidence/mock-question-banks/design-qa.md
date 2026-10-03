# Mock questions: approved combined direction

**Findings**

- [P2, fixed] Bank rows and inline editor were too tall.
  Location: `AdminMockQuestions.module.css`, `QuestionEditor`.
  Evidence: [first native-width comparison](comparison-banks-native.png) showed
  a substantially taller editor than the approved accordion. This moved the last
  questions and Add question below the corresponding visible source region.
  Fix: bank headers/rows now have 44 px minimum heights, smaller section gaps,
  shorter editor padding and two-row textareas; setup rows were reduced from
  76 to 58 px. Selected bank surfaces use a restrained blue tint instead of the
  larger gray-blue block. The [revised comparison](comparison-banks-native-final.png)
  confirms the same compact accordion hierarchy and selected-question treatment.
  Textareas remain resizable and phone action targets retain 44 px heights.
- [P3, accepted] Native typography and controls are slightly roomier than the
  generated reference at its small frame width. The app retains its system/Inter
  font stack, 14 px body text and accessible controls rather than reproducing the
  bitmap's approximately 11–12 px question text. No clipped text or hidden
  controls were found. At normal desktop width, the ordered table remains full
  width and the editor keeps the selected design's indentation.
- [P3, accepted] Existing product behavior adds a collapsed model-answer help
  disclosure, file limits, saved bank usage and bank deletion controls. These
  provide useful editing information; the verbose readiness banner is removed.

No actionable P0/P1/P2 findings remain.

**Comparison target and normalization**

The source is [the approved combined design](approved-design.png), the user's
selection of direction 1's mock setup and direction 2's question bank layout.
Original generated image: `C:/Users/Reid/.codex/generated_images/01a1020e-7bda-7920-901b-b52155666096/exec-1f19875d-a067-4139-bd6e-294dc9fdc0d1.png`.

Source board: 1681 × 936 pixels. Setup frame crop: (14,42) to (831,915),
817 × 873 px. Bank content crop excluding the global header: (854,96) to
(1668,798), 814 × 702 px. The generated board has no authoritative CSS viewport
or device scale factor; its pixel dimensions are not browser typography sizes.

Implementation: the actual `AdminMockQuestions` component in the isolated local
preview at `http://127.0.0.1:4317/`. It uses the existing theme and confirmation
providers with fixture API responses. Preview navigation uses a MemoryRouter;
the production tabs use the distinct dashboard routes.

- Desktop viewport: 1440 × 1000 CSS px. Full-page setup image:
  [1424 × 1203 px](setup-desktop-final.png). Full-page bank image:
  [1424 × 1051 px](banks-desktop-final.png).
- Reference-width check: 834 × 1194 CSS px,
  [834 × 1194 px screenshot](banks-reference-width-final.png).
- Phone viewport: 390 × 844 CSS px. Full-page setup:
  [374 × 1612 px](setup-phone-final.png); banks:
  [374 × 1389 px](banks-phone-final.png). The full-page capture omits the browser
  gutter; DOM viewport and scroll width both measured 390 px. There is no
  horizontal overflow.
- Dark theme, saved five-position sequence, manual editor open; bank view has
  Transition collapsed, Runway change expanded and its fourth question selected.
  No device-density override was used. Source and implementation were placed
  together in each comparison input before judging.

The [full setup comparison](comparison-setup-final.png) normalizes each full
frame to 800 px wide for composition only. Font size differences in this
scaled overview were not treated as pixel measurements. The
[native bank comparison](comparison-banks-native-final.png) removes only the
global header and compares unscaled pixels at approximately equal frame widths.
This is the focused evidence for rows, editor spacing, labels and selection.
The source depicts a sample attachment; the matching bank fixture has no file,
so attachment presence and model-answer wording are fixture differences, not
claims of exact state equivalence. Existing product chrome is preserved.

**Required fidelity surfaces**

- Fonts and typography: existing Inter/system sans-serif, bold title and medium
  row names preserve hierarchy. Question strings wrap cleanly; forms use readable
  line heights. System fallback and native antialiasing remain expected platform
  differences. No new fonts were downloaded.
- Spacing and layout: full-width sequence with order/source/selection/actions;
  inline manual editor; stacked bank accordions with inline question editor;
  blue selected-question rail; aligned forms and consistent borders/radii. The
  density issue above was repaired and recaptured. Phone rows stack selection
  beneath the source while keeping reorder/remove controls visible.
- Colors and tokens: existing light/dark dashboard variables provide text,
  surfaces, borders, blue actions, green Ready, amber Needs attention and red
  validation feedback. Selected rows now use a blue tint consistent with the
  reference. [final Light phone evidence](banks-phone-light-final.png) was also inspected.
- Image quality and assets: existing ATCMH logo remains sharp; Phosphor icons
  provide random/manual/edit/reorder/remove/status affordances. No rasterized UI
  or handcrafted artwork substitutes were used. The preview account icon is
  fixture chrome; production uses the existing account avatar.
- Copy and content: bank occurrence numbers, authored questions, compact status,
  count/remaining capacity, required text and minimum-bank guidance are present.
  Help and mutation errors are concise; API error bodies display their readable
  message rather than the serialized request/status wrapper.

**Interaction checks**

Browser checks used isolated sample data; all live API requests are blocked by
the preview harness. Checked adding multiple bank positions, capacity overflow
with disabled Add and inline error, manual authoring, interleaving by reorder,
saving and Ready, both tabs, accordion/question selection, new empty bank with
required fields, creating a one-question bank and disabled last-question removal.
See [invalid count](count-invalid.png), [required bank question](new-bank-required.png)
and [saved interleaved sequence](saved-interleaved-sequence.png).

Desktop and phone layouts were inspected, including Light and Dark appearance.
After the density repair, setup and bank views were recaptured on phone and
desktop. Browser console warning/error entries: none. Focus outlines, labels,
expanded state and disabled actions were checked in rendered DOM/source; a full
screen-reader or assistive-technology audit was not performed.

**Verification and limits**

- Current frontend source suite: 609 tests, 606 passed, 3 existing skips.
  The explicit source list excludes old ignored release snapshots. The temporary
  preview React preload supports an existing unrelated classic-JSX render test.
  Unfiltered `npm test` also discovers historical ignored release trees and
  encounters their existing version mismatch; those snapshots were not edited.
- Focused workflow/API/editor tests: 13 passed after the final UI revision.
  TypeScript and targeted ESLint passed. Production Next.js build passed.
- Full backend suite passed; focused mock tests and `shadowJar` passed after the
  manual question-list change. Database integration tests use H2 MySQL mode.
- The real component is rendered locally; backend persistence is covered by
  repository tests, not a running local MariaDB. No live Discord sends, production
  bank writes, remote migration, image publication or deployment occurred.
  Live MariaDB migration and real Discord transport remain release verification.

**Implementation checklist**

- [x] Approved ordered table and accordion bank pages, with separate routes.
- [x] Compact Ready/Needs attention and actionable field validation.
- [x] Bank minimum, aggregate capacity and distinct draws per run.
- [x] Manual questions, model answers, attachments and immutable run snapshots.
- [x] Revision conflict recovery and unsaved-navigation protection.
- [x] Density repair, post-fix comparison, responsive/console checks and builds.
- [ ] Apply migration and verify the live deployment only for an authorized release.

**Follow-up polish**

Optional: tune native desktop text sizing further if the user wants the smaller
bitmap density. The current sizing favors readable existing dashboard text.

final result: passed

## Deployment follow-through

Backend 3.8.13 / frontend 1.8.13 were published and deployed on October 3, 2026.
The additive migration preserved the three real configured questions as manual
slots. Signed-in live desktop/phone checks, container/version/digest checks and
backend startup passed. The new-bank draft was discarded without saving; no
production question setup was changed. Full scope, preserved data counts,
encrypted backups and evidence: [deployment record](deployment.md).

final result: passed
