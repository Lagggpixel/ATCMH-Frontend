# ATCMH Simulator legal risk audit

Date: 10 October 2026. Status: proposed changes, not implemented.

ATCMH can retain the useful simulation and mentoring functions while materially reducing avoidable intellectual property risk. The largest changes should be to the Infinite Flight-derived menu catalogue, interface presentation and development-source controls. Open airport data, standard aviation concepts, independent exercise scheduling and browser speech do not justify a wholesale rewrite.

This is an engineering risk assessment supported by public legal sources, not a legal opinion or a finding of infringement. The recommendations are implementation priorities, not claims that each change is legally mandatory. No disclaimer, colour change or percentage of rewritten code guarantees clearance. Historical acquisition and use of Infinite Flight internals remain separate questions after remediation.

## Scope and evidence

Reviewed the frontend simulator's IP-bearing UI and catalogue, engine/model, map importer and data, bundled assets, radio speech, scenario formats and execution, session/attempt persistence, entry routes and existing terms/privacy documents. Reviewed Infinite Flight's published terms and primary copyright, licensing and privacy sources.

The working package version is 1.8.47, with uncommitted and pending changes. Ten of eleven compared core files match the preserved 1.8.47 source snapshot at build/simulator-autoreadback-release/source. The working engine differs and includes pending sequencing work. This audit does not attest the live container or every archived release; the accompanying evidence JSON records the actual audited file hashes and comparisons. No production records were queried or changed. No original Infinite Flight executable was decompiled or inspected for this audit, and no side-by-side visual originality judgment was performed.

Confirmed facts:

- The simulator README records inspection of Infinite Flight 26.4 internal classes/message definitions for English menu labels, ordering, strip and context behaviour. Catalogue and engine comments corroborate that provenance. See [README](C:/Users/Reid/Desktop/Github/InfiniteFlight/ATCMH/Frontend/src/simulator/README.md:89), [catalogue](C:/Users/Reid/Desktop/Github/InfiniteFlight/ATCMH/Frontend/src/simulator/catalog.ts:33) and [engine](C:/Users/Reid/Desktop/Github/InfiniteFlight/ATCMH/Frontend/src/simulator/engine.ts:427).
- A runtime traversal of the actual menu generator found 47 unavailable leaves out of 64 for parked Ground traffic, 65 out of 90 for parked Tower traffic, and 58 out of 813 for airborne Tower traffic. Leaves include repeated parameter combinations, not distinct features. The menu exposes twelve executable instruction types. Exact roots, counts and unavailable labels are recorded in the evidence JSON.
- Re-running the data transformation in memory reproduced all fields of the 161-feature EGPH snapshot from the saved OSM XML and OurAirports CSVs, except the import date. No output files were written by that check.
- The simulator asset directory contains two font binaries and their OFL notices. The reviewed scope draws geometry on canvas and imports Phosphor icons; speech uses SpeechSynthesis. No Infinite Flight scenery, recording, logo or executable asset was identified in these simulator paths. This is not a forensic guarantee that no earlier copied material influenced the implementation.

## Legal distinctions that determine the changes

Copyright distinguishes functional ideas from their expression. Standard ATC concepts and independently implemented simulation functions can be retained; code, artwork, original text and sufficiently original interface expression require separate assessment. The GUI judgment in C-393/09 does not make every layout protectable, and SAS Institute C-406/10 does not authorise copying protected code or manuals. [US Copyright Office](https://www.copyright.gov/help/faq/faq-protect.html), [C-393/09](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62009CJ0393), [C-406/10](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62010CJ0406)

Infinite Flight's terms I and IV.A restrict distribution of copied/derived material and works based on its properties without permission; IV.A also addresses its marks. Their application and enforceability are legal questions, and the terms cannot by themselves expand statutory copyright. Section XV.G says non-enforcement is not a waiver: community acceptance should not be treated as a licence. The separately referenced game EULA was not obtained. [Infinite Flight terms](https://infiniteflight.com/legal/terms)

UK law distinguishes lawful observation/testing from decompilation, whose exception is conditioned on necessary interoperability and restricted uses. It does not establish a general permission to decompile a product to reproduce its interface. Applicable statutory exceptions can override conflicting contractual restrictions; jurisdiction and the actual acquisition method matter. No bypass of technical protection has been established here. [Observation provision](https://www.legislation.gov.uk/uksi/2003/2498/regulation/15), [decompilation provision](https://www.legislation.gov.uk/ukpga/1988/48/section/50B/2022-07-01/data.xht?view=snippet&wrap=true)

## Findings and exact changes

### 1. Establish the rights and provenance of the internal reference material

Priority: highest. Evidence confidence: high for inspection, unresolved for permission and acquisition method.

Evidence: README Sources and licensing; catalogue comment above messageMenu; engine comment above headingProjection. They identify MapControl, ATCFlightProgressStripControl, ATCMessageManager and Ground/Tower/Pattern/Misc definitions from Infinite Flight 26.4.

Changes:

1. Stop using internal source/classes or decompiled definitions as inputs for further simulator work unless permission or a documented applicable exception covers that use.
2. Record privately how the supplied material was obtained, whether it was official source or decompiled output, which licence/permission applied, what was inspected and which files it influenced. Preserve existing history honestly; deleting these comments would not cure provenance.
3. Ask Infinite Flight for written permission specifically covering the development reference material, reproduced message catalogue and UI behaviour, hosted training use, any screenshots and descriptive brand references. Permission to operate a mentorship group is not automatically permission for a replica interface.
4. If permission is unavailable, replace the affected catalogue and UI from a fresh task-based specification, using independently authored text and standard aviation concepts. Obtain legal review of remaining source-influenced portions. If relying on a clean-room process, use genuinely unexposed implementers and a reviewed functional specification; the existing implementation cannot simply be relabelled clean-room.
5. Add a simulator source manifest documenting map/font/icon origins, original code authorship where known, permissible functional references and permission records. After changes, document what was replaced without rewriting the historical record.

Files: README.md; catalog.ts; engine.ts; a new docs/simulator-sources.md. Private permission/provenance records should remain outside distributable assets.

Training retained: all functional exercises. This step does not require changing ordinary maths, NM/knots conversion, A* routing or a useful 30-second heading projection merely because they were also observed in Infinite Flight. Review expression and provenance rather than changing constants cosmetically.

### 2. Replace the replicated menu catalogue with independent task controls

Priority: highest practical code change. Evidence confidence: high for the replicated catalogue; protectability of any particular item is not determined.

Evidence: catalog.ts messageMenu/sharedMisc/contextMenu and MessagePanel.tsx. The source explicitly cross-checks labels/order against internal definitions. Most parked-aircraft menu leaves are unavailable, including game moderation and abbreviated miscellaneous messages.

Changes:

- Remove Report User and Send On Guard Warning from the simulation menu. Remove unavailable game-specific catalogue material such as Follow instructions (Simple), Follow instructions (Report), Check User Guide, Duplicate Frequency change, Taxi through grass, Wait clrnc bfr crssng RWY, Wait clearance Bfr Tkf/Ldg and Already Clr to Lnd.
- Remove the remaining unavailable-only branches from this executable command picker. Standard but unimplemented topics such as line-up-and-wait or cancellation may remain in an independently written training checklist; they need not be erased from the curriculum. Preserve executable descendants currently nested under unavailable Progressive Taxi.
- Replace the nested ordered message tree with groups Ground movement, Departures, Arrivals and circuit, Sequence, and Frequency. Choose the action, then runway/traffic side/sequence as fields, and generate a standard phrase preview. A valid final action may still transmit immediately; preserving low interaction cost does not require preserving the old hierarchy.
- Keep the supported command meanings and standard phrases. For example, landing/option, left/right traffic, go-around, hold-short and crossing remain available. Cleared for the option is established aviation phraseology, not an Infinite Flight invention. [FAA glossary](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-c.html)
- Use a compact Commands / Aircraft details / Highlight / Reminder action set for aircraft instead of matching the game's context list. Keep reminders, label positioning and colour highlights as useful generic controls.

Files: catalog.ts, MessagePanel.tsx, Simulator.tsx, Simulator.module.css. Adapt engine.test.ts, navigation.test.ts, sequencing.test.ts and frequency-state.test.ts where they assert old menu paths.

Training retained: the twelve currently executable menu instruction types: pushback, taxi, stop, hold-short, cross, takeoff, land, go-around, pattern, extend, sequence and frequency. Instructor-only heading/speed/runway/outcome controls remain instructor-only.

### 3. Decouple wording from command execution before renaming anything

Priority: prerequisite to finding 2. Evidence confidence: high. This is a regression risk in the remediation, not a separate infringement finding.

Evidence: instructionText checks labels Parking, Continue Taxi and Cleared for the Option, and derives pattern text from path labels. Simulator context actions compare English strings. Scenario request actions persist a label; scenario-engine resolves requests by exact label and uses label prefixes to validate inbound/ground requests. AtisPanel and Scope also persist/display string values.

Changes:

- Give UI/context/request actions stable ATCMH identifiers and derive display labels separately. Generate transmission text from semantic parameters, not menu breadcrumbs. Explicitly distinguish taxi-to-parking, continue-taxi and taxi-to-runway.
- Replace contextAction string dispatch with typed action identifiers.
- Add request IDs to new scenario definitions, with a versioned reader or compatibility adapter for existing label-based definitions. Map every existing request label to a stable ID. Do not mutate immutable published revisions or archived attempts merely to change wording; read old data through the adapter.
- Preserve recorded messages as historical records rather than silently rewriting them. Any removal required by a rights complaint needs a separate scoped process.
- Keep current sequence traffic descriptions readable during changes; if converting them to structured hand/leg values, include a legacy reader and retain the existing selected following-aircraft relationship.

Files: catalog.ts, model.ts, protocol.ts, Simulator.tsx, scenarios.ts, scenario-engine.ts, ScenarioEventEditor.tsx and StaffPanel.tsx. Update associated scenario/service/engine tests.

Acceptance: relabel a command without changing its emitted instruction; old published request events still execute; menu relocation does not change runway/hand/sequence semantics; direct send, manual readback and automatic readback each execute an assignment at most once.

### 4. Give the mentee scope and ATIS a recognisable ATCMH presentation

Priority: high. Evidence confidence: high for current presentation, moderate for legal significance without an original-interface comparison.

Evidence: Simulator.tsx's fixed Status/Tower sidebar and Bat 100% / clock / elapsed / [1] line; flight-strip rows with ATC button/status dot; Scope.tsx's 3D airport badge, PROC popup and procedure panel; AtisPanel.tsx's tile grids. These combine with the documented strip/context inspection to warrant an independent design.

Changes:

- Add an ATCMH Training scope header containing actual connection, selected frequency, exercise time and session name. Remove fake battery percentage, unexplained [1], decorative Status/Tower entries and the unsupported 3D badge.
- Replace the narrow frequency sidebar with a compact Ground / Tower / ATIS selector. Keep frequency-specific visibility, pending counts and off-frequency traffic awareness.
- Use labelled traffic cards or rows with Callsign, Type, Runway, Phase and Pending, plus a Commands action. Preserve useful strip information and configurable panel sizing; change the composition rather than merely recolouring the existing replica.
- Design scope settings around functioning layers. Keep zoom, recenter, trails, selected plans and highlights. Replace the cloned options ordering and procedure popup presentation; do not imply unavailable aeronautical services are implemented.
- Rework ATIS into independently arranged Runways / Conditions / Restrictions / Broadcast sections with a preview and explicit Publish. Keep the phonetic information letter and existing draft-versus-published behaviour.
- Dark backgrounds, legible monospaced numbers and cyan/green traffic may remain. Neither those colours nor common radar conventions alone establish copying.

Files: Simulator.tsx, Scope.tsx, AtisPanel.tsx and Simulator.module.css. The staff authoring/library screens are already task-oriented; keep them unless their shared scope inherits one of the changes above. Licensed Fira Sans/B612 Mono can remain.

Tradeoff: command judgement, traffic awareness and radio coordination remain useful for IFATC. Exact Infinite Flight menu-location muscle memory will change. If exact UI fidelity is a training requirement, permission is the preferable route; a hidden replica mode would retain the same underlying concern.

### 5. Replace misleading synthetic procedures and label exercise conditions

Priority: high for training accuracy; secondary IP benefit. Evidence confidence: high.

Evidence: catalog.ts contains real-looking SID/STAR/approach names. Scope.tsx procedurePoints creates geometry by evenly distributing angles by array index; named fixes are placed on that synthetic geometry, and airspace is a generic five-NM circle. The displayed METAR and ATIS wind values are fixed and do not agree in every field (250 degrees in METAR, 240 in ATIS).

Changes:

- Replace fake named SID/STAR tracks and fix placements with instructor-authored Training route A/B and Training fix A/B, visibly marked schematic. Remove the faux airspace circle or label it Exercise boundary. Procedure names themselves are not established here to be proprietary.
- Keep actual EGPH runway/taxiway geometry and A* ground routing. These are separate from the invented procedure overlays.
- If real procedures are later needed, use a dataset with verified redistribution rights and current effective dates; show accurate geometry and provenance. Public availability of a chart is not permission to redistribute it, and copying from Infinite Flight would reintroduce provenance concerns.
- Make weather a shared exercise-conditions object used by banner, ATIS and command text, labelled Simulated conditions with an exercise timestamp. Use a new ATCMH example rather than presenting the existing fixed METAR as current weather.

Files: catalog.ts PROCEDURES/PROCEDURE_COLORS/REMARKS; Scope.tsx procedurePoints and options; AtisPanel.tsx; model.ts METAR/weather; engine.ts atisText/weatherSummary; catalog.ts instructionText. Update procedure/ATIS tests and support legacy procedure strings in saved snapshots without drawing fictitious real routes.

Training retained: route awareness, approach/circuit visualisation, runway selection and ATIS composition. Actual IFR procedure training requires accurate licensed data.

### 6. Complete the open-data distribution and notices

Priority: medium, straightforward compliance work. Evidence confidence: high for current attribution and verified data origin; no claim of a proven ODbL breach.

Evidence: Scope.tsx already links © OpenStreetMap contributors to the correct copyright page. CSS renders it at 9px. README contains the ODbL link, while bundled egph.json has a licence label but no complete distribution notice or offered download UI.

Changes:

- Keep the existing map attribution, make it comfortably legible (12px is a proposed design target, not a licence-prescribed minimum), and ensure overlays do not obscure it. The current linked wording already communicates the licence through the destination; a second permanent on-map licence sentence is unnecessary. [OSMF attribution guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- Add a Data and licences panel offering the exact machine-readable derived geometry used by that release, its ODbL notice/link, import date, source extract URL/bounds and transformation method. Preserve OSM way IDs. Put notice metadata beside any distributed data file. Do not assume an undocumented minified JavaScript bundle is a sufficient usable offer. ODbL sections 4.4–4.6 govern derivative database licensing/access where applicable; they do not automatically require publishing unrelated application source. [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)
- Keep OurAirports factual metadata, identify its source, and distinguish it from OSM geometry. Its published data is public domain with no accuracy warranty. [OurAirports](https://ourairports.com/data/)
- Preserve the existing Fira and B612 OFL files. Verify the Phosphor MIT copyright/permission notice survives production distribution; if it does not, include it with notices. The installed package includes that licence, but production notice retention was not audited.

Files: Scope.tsx; Simulator.module.css; import-simulator-data.py; data/egph.json metadata or a sidecar manifest; new public/simulator/data/egph.json and a notices page/file. Keep exported data in sync with the imported release data. Provide data access only, without exposing sessions, assignments or learner information.

### 7. Make independence and training limits visible at the point of use

Priority: medium. Evidence confidence: high for lack of an in-simulator notice; existing general disclaimer acknowledged.

Evidence: TERMS_OF_SERVICE.md section 10 already disclaims affiliation, but the full-screen mentee view lacks an ATCMH identity/independence notice. Simulator route metadata is only ATC simulator. No Infinite Flight logo asset was identified in the scoped simulator files.

Changes:

- Use ATCMH ATC Trainer as the product title in route metadata, entry/library screens and exercise header. This is a proposed name, not a claim that the current name is unlawful.
- Add visible entry copy: Independent ATCMH practice tool for Infinite Flight controllers. Not affiliated with, endorsed by or operated by Infinite Flight Corporation. Use factual descriptive references, not their logo or an Official IFATC Simulator claim. Consumer confusion about source or sponsorship is a central trademark issue. [USPTO](https://www.uspto.gov/page/about-trademark-infringement)
- Add: Community simulation practice only. Not for real-world navigation, operational ATC or certified training. Aircraft performance, procedures and separation are simplified. This accurately communicates limitations; it is not a substitute for compliance or safe design.
- Link official Infinite Flight documentation for transfer to the real game. Write original learning explanations and avoid copying manuals/screenshots or reconstructing the complete menu catalogue in a help appendix without a rights assessment. Brief factual references do not automatically need a blanket brand licence under trademark law, although contractual questions remain.

Files: app/simulator/layout.tsx; SessionAccess.tsx/SessionNotice; SessionPicker.tsx; SessionJoin.tsx; TrainingLibrary.tsx; Simulator.tsx; TERMS_OF_SERVICE.md. A compact About link can provide detail after the entry notice.

### 8. Clarify retained learner records and optional remote speech

Priority: medium, separate from Infinite Flight IP. Evidence confidence: high for the storage and speech behaviour; applicability of particular privacy laws depends on ATCMH's circumstances.

Evidence: session-store.end deletes the live session but archives an active attempt result. training-service.finish/restart retains snapshots, event outcomes, feedback, account associations and timestamps. Draft/revision fields include briefings and instructor notes. PRIVACY.md covers training broadly and expressly allows indefinite retention; it has no simulator-specific explanation. Browser speech prefers local English but silently falls back to a potentially remote English voice; the settings UI labels online voices and mentions the browser provider.

Changes:

- Disclose simulator session snapshots, transmissions, staff/learner identifiers, scenarios, assignments, attempt history, feedback and account preferences. Explain who sees each, that instructor notes/future events stay private from learners, and that End session does not erase archived attempts.
- Adopt a documented, purpose-based retention schedule and deletion/anonymisation process covering live sessions, full attempt snapshots, feedback summaries, published content, preferences and backups. Routine practice detail should have a shorter justified lifetime than assessment summaries. Decide actual periods from mentoring/appeal needs; no particular 30/90/365-day period is prescribed here. Hashing an account ID alone is not necessarily anonymisation. The ICO says retention must be justified and there is no universal statutory duration. [ICO storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
- Provide simulator privacy information when records are collected, and identify optional third-party text processing where relevant. [ICO right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/)
- Prefer local-only speech automatically. If no suitable local voice exists, retain text functionality and offer a clearly explained optional online voice choice before sending messages to it. This is a risk-reduction recommendation, not a finding that consent is always the required legal basis. Browser localService indicates whether the voice uses a local or remote service. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)
- Add short authoring guidance to use fictional callsigns and avoid personal/sensitive information in exercise messages; do not make live real-user tracking part of this change.
- Update the frontend legal documents and backend RequiredPolicyRegistry document versions/hashes together through the existing policy process. Do not change document text while leaving its authenticated hash stale.

Files: PRIVACY.md; TERMS_OF_SERVICE.md; RadioAudio.tsx; radio-audio.ts; ScenarioEditor.tsx; TrainingLibrary.tsx; server/session-store.ts; server/training-service.ts; related migrations/retention administration where needed; Backend/src/main/java/me/reid/auth/RequiredPolicyRegistry.java. Preserve owner/learner access controls, private instructor fields and no-microphone/no-recording behaviour.

## Training functionality to preserve

| Learning objective | Keep | Change only where needed |
| --- | --- | --- |
| Traffic awareness | Callsign/type/runway, altitude/speed, trails, selected plans, off-frequency targets | Independently composed cards/tags/settings |
| Ground judgement | Pushback, taxi routes, hold-short, crossing, stop/continue | Remove nonfunctional game catalogue; keep connected OSM routing |
| Tower/circuit judgement | Takeoff, landing/option, go-around, pattern entry/extension, sequence and follow traffic | Task controls instead of copied menu traversal |
| Radio workload | Requests, unread indicators, frequency transfer, ordered history, readback/unable and optional speech | Original templates, stable IDs, local-first speech |
| ATIS practice | Letter, runway, conditions, restrictions, preview and publish | Original form layout and explicit simulated weather |
| Mentoring | Two exclusive seats, pause, instructor manoeuvres, scenarios, timed/conditional/manual events | Visible ATCMH identity and privacy clarification |
| Assessment | Published revisions, assignments, attempt limits, feedback, restart and history | Backward-compatible readers and justified retention |

## Proposed implementation order and acceptance

1. **Provenance gate:** document permissions/acquisition and stop introducing internal-source references. Preserve evidence. Select either a permitted fidelity implementation or the independent presentation below.
2. **Compatibility first:** add semantic IDs and legacy readers; cover every old request label and current instruction behaviour before replacing the catalogue.
3. **Independent presentation:** replace message/context menus and mentee/ATIS layouts; remove game-only decoration and synthetic real procedures. Keep rapid sending and radio/circuit workload.
4. **Notices and data:** provide map download/licences, product identity and accurate conditions/limitations; retain font/icon notices.
5. **Privacy:** update legal documents with matching authentication registry, add deliberate remote-voice selection, and implement the agreed retention process separately from appearance work.

Acceptance checks for that future implementation:

- Every presently executable command remains usable with the same aircraft effects, including option direction, actual following traffic, frequency-specific reads and pause-frozen automatic replies.
- Renaming/reordering UI text cannot change generated instructions or break existing published request events. Old assignments, immutable revisions, attempts and saved sessions remain readable without destructive bulk rewrites.
- No game moderation/report/guard-warning placeholders, fake battery/3D indicators, or real-labelled synthetic procedure/fix tracks remain in the public UI. Supported progressive-taxi crossing is preserved when its parent branch disappears.
- Both roles identify the ATCMH trainer and simulation limits; local and optional online speech paths behave as disclosed.
- The download equals the exact release geometry, carries the notices, and exposes no learner/session data. Attribution is readable at desktop and landscape tablet sizes and survives panels/settings overlays.
- Existing authentication, CSRF, ownership, private-note filtering and exclusive seats continue to pass focused tests; browser checks cover both roles, direct commands, keyboard use, responsive overflow, ATIS publication and reconnection using disposable fixtures.
- Policy text and registry hashes/versions agree, retained attempt history is explained accurately, and the deletion process is tested on disposable records.

No changes to simulator behaviour, assets, legal policy, databases or deployment were made by this audit. Only this audit and its evidence receipt were added. Exact game-interface fidelity, historical source access and any commercial expansion remain matters for specific written permission or IP counsel; these engineering changes reduce risk without purporting to resolve those questions.
