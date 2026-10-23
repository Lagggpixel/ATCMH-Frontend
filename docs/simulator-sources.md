# ATCMH ATC Trainer sources and permissions

Implementation record: 2026-10-10. This is an engineering provenance record, not legal clearance.

## Historical provenance and unresolved permission

The initial simulator presentation and message catalogue were cross-checked against Infinite Flight 26.4 internal ATC message definitions and MapControl references. The acquisition path, applicable end-user licence, authority to inspect those materials and permission to reproduce protected expression have not been verified. The audit and its evidence receipt preserve that history: `simulator-legal-risk-audit-2026-10-10.md` and `.evidence.json`. Their hashes refer to the pre-remediation snapshot and must not be updated to disguise subsequent changes. The local pre-change implementation is also preserved outside the repository in the task's visualization workspace.

The remediation replaces the nested catalogue and game-like presentation with task/parameter controls and typed radio text, removes fabricated real-named chart overlays and adds independent branding and source notices. It is not a retroactive clean-room claim, nor proof that historical exposure has been cured. Obtain written Infinite Flight permission or qualified IP review if exact interface fidelity, internal-source use or commercial expansion is required. No permission request has been sent and no permission is represented as granted.

Do not use internal/decompiled Infinite Flight code, message catalogues, extracted assets or private training material as future development references. Record the source, licence, acquisition date and permission for new assets/content. Use independently authored training requirements and public documentation links; do not copy whole manuals or exam banks. Keep historic evidence access-controlled; do not redistribute internal source extracts with the trainer.

## Current inputs

| Input | Source and rights | Implementation |
| --- | --- | --- |
| Airport surface | OpenStreetMap contributors, ODbL 1.0 | Local XML extract, bounds -3.405,55.935,-3.335,55.968; way IDs retained; projected to local nautical miles by `scripts/import-simulator-data.py` |
| Airport origin, elevation, runway endpoints/headings | OurAirports public-domain airports.csv and runways.csv | Same importer, local input files; import date in `src/simulator/data/egph.json` |
| Fonts | Fira Sans (300/400/500/700) and B612 Mono (400/700), SIL OFL, from Google's font repository | Original licence files beside public fonts |
| Icons | Phosphor React, MIT; user-supplied original IF 26.4 `InfiniteFlight.ttf` aircraft glyphs | Phosphor licence at `public/simulator/Phosphor-MIT.txt`. Original aircraft codepoints from local `Theme.Glyphs.Aircraft`, rendered as SVG text with `MapControl`'s 26-unit font / .69 base scale and 1.15x black backing offset 1 unit at 1x. Font extraction provenance/hash at `public/simulator/fonts/InfiniteFlight-NOTICE.txt`; the icon font is not covered by the Fira/B612 OFL licences. Trainer aircraft lack wingspan metadata, so physical wingspan-based enlargement is unavailable. |
| Scenario content | ATCMH author contributions; rights must be checked by author | Fictional callsigns/events, no personal/sensitive information or copied exam questions |
| Generic motion and guidance | ATCMH implementation; historic reference exposure disclosed above | Existing taxi, circuit, sequencing and assignment engine retained; no assertion of independent historical provenance |

The About page supplies all current data/licence links. `/simulator/data/egph.json` serves the very JSON imported by the engine, so reimporting cannot leave a second distributed copy stale. `/simulator/data-notice.json` supplies bounds, extract URL and transformation details. ODbL applies to the derived map database; this record does not relicense application code.

## Interface refinement, 2026-10-10

The subsequent visual refinement uses neutral charcoal surfaces, compact flight strips, visible task buttons and ATCMH cyan accents. The horizontal frequency navigation, two-column task chooser, explicit parameter fields and separate radio preview/transmit action remain the trainer's own composition. ATIS retains labelled runway, approach and exercise-notice fields. The existing airport dataset, instruction IDs, simulation engine and scenario formats are unchanged.

Only public-facing material was reviewed for this refinement: Infinite Flight's [Ground, Tower & Radar overview](https://infiniteflight.com/guide/getting-started-guide/atc-user-interface/ground-tower-radar) and publicly available ATC screenshots. No new internal definitions, decompiled code, extracted assets, proprietary icons or copied menu artwork were used. The concept is an original ATCMH mockup; implementation uses the existing licensed fonts and Phosphor icons. Its illustrative radar geometry is not used as map data.

These choices aim to reduce resemblance while supporting familiar ATC tasks; they are not legal clearance. The [UK IPO's GUI design guidance](https://www.gov.uk/government/publications/designs-practice-notice-dpn-0126-practice-in-respect-of-graphic-symbolsicons-graphicalweb-user-interfaces-and-animated-designs/designs-practice-notice-dpn-0126-practice-in-respect-of-graphic-symbolsicons-graphicalweb-user-interfaces-and-animated-designs) confirms that interface appearance can qualify for design protection. The historical provenance and unresolved-permission notes above still apply. Earlier audit and remediation evidence hashes describe their respective snapshots, not this later styling change.

## Instructor-requested command restoration, 2026-10-10

At the instructor's explicit request, the earlier nested command navigation and left-side frequency list have been restored from the local pre-remediation snapshot. Command labels/order therefore retain the historical reference exposure documented above; this restoration is not represented as an independent catalogue or as permission clearance. Unsupported choices still explain that they are not simulated. The newer ATCMH branding, licensed assets, map attribution, privacy controls and existing scenario adapters remain. The requested taxi-to-runway wording, automatic Tower handover at the final hold-short point and removal of spoken channel prefixes are retained.

ATIS now groups its selectable options under Remarks. Legacy draft labels are adapted when editing or publishing; removed frequency-separation/event options are omitted from new publications. Archived messages and scenario revisions are not rewritten.

## Compatibility and release gates

Schema 1 and stored revisions remain readable. New pilot requests use stable requestId values; exact historical labels have a read adapter. Historical radio messages and revision bytes are not rewritten. Old taxi instructions without destination retain their previous defaults. Legacy ATIS references remain readable without invented real procedure drawings.

Before a later release: review this record and unresolved permissions; apply the existing simulator migrations; publish frontend policy text and backend policy versions/hashes together; arrange the retention maintenance described in `simulator-retention.md`; verify the offered map data and notices. No production deployment or data cleanup is part of this remediation.
