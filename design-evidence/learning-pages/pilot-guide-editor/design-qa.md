# Pilot Guide administration — option 1

final result: passed

## Selected reference and comparison

The user selected option 1, the Chapter workspace. The approved source is saved
as [selected-option-1.png](selected-option-1.png), originally 1487 × 1058 pixels.
The existing dashboard header, Source Sans Pro, warm canvas, white panels,
navy text and blue actions are reused. No replacement shell or global sidebar
was introduced.

The reference and rendered editor were inspected together in the same tool input,
including [the final comparison](comparison-final.png). Both sides are normalized
to 1440 × 1024 pixels. The rendered capture was taken at 1440 × 1024 CSS pixels
in the Codex in-app browser, light mode, Getting started selected, Visual mode,
unsaved state. The native capture excludes the scrollbar. A trailing space in the
local chapter title supplied that state for the comparison and was then removed;
the comparison did not save any content change.

Initial comparison found undersized reading text, a short chapter rail and a weak
selected-chapter cue. Repairs enlarged the title and prose, extended the rail and
added the blue selected edge. The Visual selector and formatting dropdown were
aligned with the reference. Phone QA then found the global minimum field rule
overriding the title hierarchy; the editable chapter heading now retains 32px
on phones. Final comparison has no unresolved P0/P1/P2 findings.

Intentional adaptations: the complete supplied Important paragraph replaces the
mockup's shortened example; its editable callout uses the shared guide blockquote
style. Real chapter management controls, formatting commands, save states and
role checks replace decorative placeholders. The existing dashboard header
retains its established sizing. Development badges are absent in production.

## Browser validation

- A clean load is saved and has no false dirty state. Clearing a title temporarily
  does not crash the editor. Switching Visual/HTML without edits stays clean.
- Visual text editing and bold formatting work; image insertion requires an
  accessible description. Consecutive image/video insertions retain both blocks.
- The original three videos render in privacy-enhanced YouTube frames with their
  descriptive titles. A player thumbnail and controls were observed; playback
  was not exercised.
- HTML preview and saves remove scripts, handlers and arbitrary frames. Rich
  headings, callouts, tables, images and supported videos survive normalization.
- Save changes updates the same guide read through `/pilot-guide`; the public
  reader showed the saved test chapter, image, video and table. The test chapter
  was removed afterward, and the original five chapters and date were restored.
- Chapter creation, naming, order, removal confirmation, guide settings, content
  date, local preview and saved states were exercised.
- Two editor sessions proved stale saves return a conflict without overwriting
  the local draft. Keep editing preserves it; Discard and reload fetches the
  current guide. Editing is disabled during save/reload.
- Leaving via Home with edits opens the discard dialog. Browser QA discovered
  and fixed a pre-existing anchor/download-property bug in the shared guard;
  its regression test covers ordinary anchors and actual download attributes.
- The Administration menu exposes Pilot Guide to administrators. Navigation
  from Statistics into the editor loads a document for the scoped media CSP.
  Staff receive an access-denied editor screen. API tests also cover anonymous
  and staff requests, CSRF and revision requirements.
- Verified desktop 1440 × 1024, tablet 768 × 1024 and phone 390 × 844 CSS pixels;
  no whole-page horizontal overflow. Chapters scroll locally on phones.
- Light and dark modes were inspected, including persistence between pages.
  Formatting controls, dialogs and editable content have strong focus cues.
  Relevant editor console checks returned no errors or warnings.

Evidence: [saved editor](desktop-user.png), [dark desktop](desktop-dark.png),
[phone light](mobile-light.png), [phone dark](mobile-dark.png),
[tablet](tablet-light.png), [public saved media](public-saved-media.png),
[conflict](conflict.png), [unsaved confirmation](unsaved-confirmation.png),
[staff denial](staff-denied.png).

## Content and implementation validation

An independent audit compared the attachment, frontend seed, SQL seed and final
saved local guide. All five chapter IDs/titles/order, all 46 substantive source
lines, numeric limits and source typos, both Discord links, all three video IDs
and original watch URLs, introduction and February 2, 2026 date are preserved.
Only Discord embed wrappers and bot timestamps are omitted.

- Frontend: 639 tests, 636 passed, 3 existing skips, 0 failed. Native test execution
  used four workers after the default parallel run stalled on this Windows host.
- Production Next build and TypeScript passed. ESLint: 0 errors, 34 existing warnings.
- Backend: 32 focused HTML/service/JDBC/route/auth/CSRF/origin tests passed;
  production shadowJar passed. Persistence tests include concurrent saves,
  rollback and migration replay that preserves existing edits.

## Initial local preview

Initial browser QA used the loopback fixture API with invented identities and
in-memory edits. That implementation phase performed no remote migration,
registry push or deployment. Actual persistence uses the backend application
database and the additive `Backend/sql/2026-10-02-pilot-guide.sql` migration.
The current public preview access policy remains intact. Media uses URL embeds;
upload storage is not included. See `Backend/docs/pilot-guide-editing.md` and the
frontend README for setup and editing behavior.

The normal-size editor and reader are left open at
`http://localhost:3100/dashboard/pilot-guide` and
`http://localhost:3100/pilot-guide`. Responsive overrides were reset on the
active testing surface; temporary QA tabs are not deliverables.

## Production deployment — October 2, 2026

The user then requested deployment. Backend 3.8.10 and frontend 1.8.10 were built
locally for linux/amd64, published with versioned/latest tags and deployed through
Portainer to ATCMH stack 30 with a fresh pull. Both running image IDs and digests
match the published artifacts. Existing stack configuration and all 26 environment
entries were preserved. Private encrypted schema/stack/Compose snapshots were
saved before the migration and deployment.

The guide migration ran in one MariaDB session before deployment. The table was
previously absent; it now holds the exact original five-chapter document at
revision 1, with three video embeds and its February 2, 2026 content date.
All 51 live guide content comparisons passed. The full backend suite passed
(973 tests, 1 existing skip), supplementing the focused implementation checks.

The frontend is healthy and reports 1.8.10. The backend artifact reports 3.8.10;
Discord startup completed with no startup error markers. Both containers had zero
restarts. Live Home, Courses, Pilot Guide, editor and application routes returned
200, and anonymous backend editor reads returned 401. Scoped video CSP is present
on the reader/editor and absent on unrelated pages.

The existing signed-in administrator's browser loaded the production visual
editor with five chapters and "All changes saved"; its console contained no
errors. The live reader rendered the supplied content and YouTube players. The
Courses page rendered its isolated branded shell and the correct empty state
because no courses are currently published. No production guide save or
application submission was performed during these checks.

Evidence: [live editor](live-editor.png). The production reader and editor are
left open at `https://www.atcmh.org/pilot-guide` and
`https://www.atcmh.org/dashboard/pilot-guide`.
