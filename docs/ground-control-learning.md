# Ground Control learning update

The shared learner/staff renderer now supports ungraded inline checks, command/decision/scenario/rule/resolution callouts, safe Markdown comparison tables, lesson navigation, and Ground traffic diagrams.

The reusable Ground Control template is in `src/lib/ground-control-course.ts`. It contains eight learning blocks, five conflict scenarios, five ungraded checks, a revision table, and the selected final quiz at 80%. Existing quiz settings and attempts are not changed by applying the template.

## Apply to the existing course

Deploy the updated Dashboard backend and frontend together before saving documents with the new `check` block or callout tones. Older backend validators reject these additions; older frontend readers do not render them interactively.

In the course editor, open **Ground Control lesson template** for the intended section, choose its existing Ground Control quiz, then select **Replace draft section with template**. This replaces the section's blocks in the unsaved draft; review the content before **Save course**. Publication remains a separate control. Do not apply the template to unrelated sections or sections with media you intend to retain without first preserving those blocks.

The inspected live targets were course `a1000000-0000-4000-8000-000000000001` and quiz `be5effff-5b8e-4719-b5e0-87c62b99d549`. No automatic SQL overwrite is included, to preserve authored content.

## Apply the aligned quiz

Open the associated Ground Control quiz in the quiz editor and choose **Apply Ground course alignment**. Review questions 1 and 4, then **Save quiz** alongside the course update:

- Ground manages assigned surface movements; Tower retains active-runway operations and coordination.
- ATIS/operational coordination identifies the runway configuration; METAR and TAF describe observed and forecast weather, not runway assignments.

The versioned correction in `src/dashboard/utils/GroundControlQuizAlignment.ts` is limited to the named quiz and verifies the original wording, options and answer keys before modifying the draft. Already aligned drafts are unchanged. Unexpected edits require manual review. Other questions and quiz settings remain intact. The ordinary quiz save path regenerates question/option IDs; historical attempt reviews retain their stored question snapshots.

Both changes are repository code until deployed and saved through the editors. No production database write or publication happens automatically.

## Document contract

`check` fields: `id`, `type`, `prompt` (1–2000 characters), `options` (2–6 nonblank strings, each at most 500 characters), `correctOption` (zero-based integer within the option array), `explanation` (1–4000 characters), and optional `incorrectExplanation` (1–4000 nonblank characters when present). Text fields reject HTML and typed directives. Checks have no required flag, passing score, reference, or assessment persistence. Correct and incorrect selections show their own explanatory feedback; legacy checks without `incorrectExplanation` reuse their existing explanation. Feedback is local to the mounted reader and resets with a reload.

New callout tones: `command`, `decision`, `scenario`, `rule`, `success`.

Ground diagram IDs: `ground-movement-flow`, `ground-pushback`, `ground-intersection`, `ground-head-on`, `ground-arrival-priority`, `ground-three-way`, `ground-progressive-taxi`, `ground-runway-crossing`. Crossing `props.scenario` accepts `overview`, `departure-before`, `departure-conflict`, `departure-past`, `departure-turning`, `arrival-before`, `arrival-exiting`, `arrival-past`.

Runway scenarios follow the Infinite Flight manual: https://infiniteflight.com/guide/atc-manual/2.-ground/2.3-runway-crossing. Diagrams are schematic; scenario eligibility still requires checking the remaining traffic picture.

## Targeted refinement

The one-page, eight-block structure and design language remain. Pushback and the intersection example teach Give way alongside Hold position. Runway Crossings now uses one schematic plus departure/arrival state tables and one warning. Five checks cover Pushback, Taxi, Conflicts, Progressive Taxi and Crossings.

Navigation includes Quick Revision Sheet, highlights Current using scroll position, and labels prior headings Earlier. These labels do not claim the learner completed or read a block; no progress is persisted.
