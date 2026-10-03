# Pilot Guide reader — desktop and phone direction 1

Date: 2026-10-02. Scope: the existing public reader and its shared administration preview. The user selected the first displayed desktop concept and the first displayed phone adaptation. No new routes, backend changes, content edits, publication or deployment.

## Visual comparison

Source: `selected-desktop.png` (1487 × 1058 pixels) and `selected-phone.png` (853 × 1844 pixels), copied from the exact selected Image Gen results. Desktop target viewport: 1440 × 1024 CSS pixels. Phone: 390 × 844. Additional tablet: 768 × 1024. Browser screenshots from the in-app browser were 1425 × 1013 desktop and 375 × 812 phone; `compare.py` normalizes both source and capture to the matching CSS frame before composition. This avoids comparing capture-density differences. Screenshots show the same light theme, first chapter, closed phone selector and actual guide content. Dark and interaction states were verified separately.

Both source and implementation were opened together in `comparison-desktop-first.jpg` / `comparison-phone-first.jpg`, followed by `comparison-desktop-final.jpg` / `comparison-phone-final.jpg`. The phone comparison is sufficiently readable at its native size; desktop full-view comparison was supplemented by the full-resolution implementation and source for the rail, callout, type and footer.

## Findings and repairs

- P2, phone type/density: the first implementation used 17.2px prose and introduction text. Set both to 16px, reduced update-date type and intro spacing, then recaptured. The selected mock's raster text is approximately 14px when normalized; the final implementation intentionally keeps a readable 16px minimum. The retained real header is 76px high rather than the generated compact header, so the article begins lower and the Important note continues below the fold. This is an accepted responsive/product constraint, not missing copy.
- P2, desktop footer: first pass stacked “Continue to” and the next chapter name. Updated the desktop action to an inline label/title arrangement matching the selected source; phone still wraps naturally.
- P2, same-chapter phone selection: closing the open outline previously scrolled before its height changed. Navigation now focuses/scrolls after the collapsed layout commits. Verified with both five and fifty chapter lists; heading settles about 100px below the viewport top, with the panel focused.
- P2, administration preview: the sticky desktop outline could sit behind the dashboard header. Scoped its offset to 96px and removed duplicate nested page gutters. The standalone guide retains its 24px rail offset.
- P2, edited content resilience: constrain horizontal table/pre overflow to the prose container. A twelve-column local draft table produced a 435px scroll width inside a 276px phone prose region, with no document overflow. Long titles and unbroken words wrap.

All repairs were verified in the rendered application. No remaining actionable P0/P1/P2 findings. P3/accepted differences: the current shared header already uses an appearance menu and account avatar rather than the older screenshot's sun/moon pair; this redesign retains that shared product behavior. Phone metadata says “Chapter 1 of 5” below the selector rather than the generated shorter “1 of 5”. The actual layout uses existing tokens and comfortable type instead of attempting to reproduce raster font artifacts.

## Required fidelity surfaces

- Fonts/typography: existing Source Sans Pro is loaded; navy headings, clear chapter hierarchy, 18px desktop prose and 16px phone prose. Long names wrap instead of truncating. Footer labels remain readable.
- Spacing/layout: introductory divider, numbered rail, selected blue edge, modest bordered white reading surface, 32px desktop and 20px phone reading padding. Container queries also adapt nested editor previews. The page scrolls naturally; no fixed controls cover the text.
- Colors/tokens: the original warm canvas, navy ink, blue actions, selected tint, muted text and border variables are retained. Original dark tokens apply to every new surface and control.
- Images/icons: the existing ATCMH logo is reused without modification; direct Phosphor arrow/caret imports match the product. No new illustrative assets or rasterized UI. All three original video embeds remain in the Tower chapter.
- Copy/content: title, full introduction, date, chapter IDs/order/titles, all HTML, Discord links and videos remain supplied by the existing guide. The selected chapter is still sanitized before rendering. No completion tracking or invented guide data was added.

## Interaction and regression verification

- Desktop and phone light/dark screenshots reviewed; 768px tablet also has no horizontal page overflow.
- Up/Down, Left/Right, Home/End keep one active/focusable chapter and matching article. Outline rows reveal within their scrolling container.
- Phone ArrowDown opens/focuses the selected row. Escape closes and restores focus to the selector. Click/Enter selection closes the outline and focuses the current chapter after layout.
- Previous/next from the long Tower chapter returns to the new heading and focused panel. First chapter has only Next; final chapter has only Previous.
- Administration Preview starts on the selected Tower chapter, renders all three videos and uses the new layout. No saved guide content was changed.
- Created fifty chapters and a wide table/pre/long-word stress case only in a browser-local unsaved editor draft. Last row was visible in the bounded desktop and phone outlines, keyboard Home/End worked and long selector text wrapped. Closed the temporary editor tab to discard the draft; no save request was made.
- Public preview console: no captured errors. HTML/API/contract/routing/appearance focused tests: 17 passed, zero failed. TypeScript and focused ESLint passed. Production build passed.

Limits: browser checks used the existing loopback-only API fixture and invented local identity, with the supplied real guide content. One-chapter/empty state logic and invalid initial selection were source-reviewed; those branches were not separately rendered in the browser. Production identity, remote publication and deployment were outside this request.

Evidence: `desktop-final.jpg`, `phone-final.jpg`, `phone-selector-open.jpg`, `desktop-dark.jpg`, `phone-dark.jpg`, `tablet-final.jpg`, `admin-preview-desktop.jpg`, `stress-50-desktop.jpg`, `stress-50-phone.jpg`, `stress-outline-phone.jpg`, both final comparison files and `desktop-and-phone.jpg`.

Implementation checklist: source target resolved; existing project/theme reused; desktop/phone controls work; content preserved; visual repairs recaptured; responsive/dark/keyboard/editor checks passed; preview retained.

final result: passed
