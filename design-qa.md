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
