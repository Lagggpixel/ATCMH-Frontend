# Accounts redesign QA — 1 October 2026

Selected target: original image 2 from the first generation, `selected-image-2.png`. The implementation uses the existing dashboard header, Source Sans Pro, theme tokens, account contracts and permission controls. The desktop composition is a directory beside a right account inspector.

## Evidence and comparison

- Full comparison: `comparison-pass-2.png`; focused inspector: `comparison-detail.png`; implementation: `desktop-final.jpg`.
- Browser viewport override: 1440 × 1024 CSS pixels, density 1. Browser screenshot content is 1425 × 1013 pixels, excluding browser scrollbars. The 1487 × 1058 source is normalized to those exact content dimensions; both images have the same display size in the comparison. Viewer downscaling of the wide comparison is compensated by the focused inspector comparison.
- State: Light appearance, eight fictional accounts, CaptainAlex selected, Overview active, top scroll position. The isolated local harness renders the production Accounts component, dashboard shell and styles. It never calls the live account API.
- First comparison found a 56px inspector offset and excess space before results. Both were corrected and recaptured. Tablet review found the table cramped beside the inspector; at widths up to 900px, selection now opens a full-width detail view with a Back button.
- Typography and layout: existing product font and readable type hierarchy; compact two-row lookup controls; aligned table rows; full account IDs; blue selection; narrow white inspector; linked identity rows; tabs and blue management entry.
- Color, elevation and borders: existing light/dark dashboard tokens; restrained borders and rounded controls; green active and red suspended badges; real Phosphor Discord/airplane icons and existing product logo. No new raster assets are shipped in the page.
- Content differences are intentional: real provider subjects replace invented Discord discriminators; valid account statuses replace the mock's unsupported Archived account status; backend timestamps use the browser locale; Updated and Version replace unsupported Notes/Merged from fields. Merge target appears only when present. Identity rows have no nonfunctional chevrons. IP information and impersonation remain capability-gated.

## Validation

| Check | Result |
| --- | --- |
| Desktop source comparison, full view and focused inspector | Passed; no unresolved P0/P1/P2 drift within the existing product style and actual data contracts |
| Light and Dark appearance | Passed; `desktop-dark.jpg`, restored Light |
| Phone 390 × 844 | Passed: directory, More filters, empty search, account selection, Back, Overview and History; no horizontal page overflow |
| Tablet 834 × 1194 | Passed after responsive correction; `tablet.jpg` |
| Row keyboard activation and arrow-key tab navigation | Passed |
| Account ID copy feedback | Passed |
| Search failure and recovery | Passed: error visible, successful retry clears it |
| Management preview, reason and commit | Passed with disposable local fixture: confirmation disabled without reason; draft changes invalidate preview; suspension refreshes row and inspector |
| Restricted capabilities | Passed: no IP heading/value and no impersonation action |
| Browser errors and warnings | None in final review tab |
| Account rendering, mutation and related regression tests | 27 passed |
| TypeScript and production build | Passed |
| ESLint | No errors; existing impersonation hard-navigation warning retained |

Additional evidence: `mobile-detail.jpg`, `mobile-directory.jpg`. Temporary viewport override was reset. Live authenticated data and backend mutations were not exercised; their existing API and authorization contracts remain in place. Nothing deployed.

final result: passed
