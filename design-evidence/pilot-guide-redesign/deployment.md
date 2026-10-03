# Pilot Guide redesign deployment — October 2, 2026

Frontend **1.8.12** is live at https://www.atcmh.org/pilot-guide. Backend remains **3.8.12**.

The isolated release uses the verified 1.8.11 avatar/header snapshot. Its only differences are `PilotGuideReader.tsx`, `PilotGuideReader.module.css`, and package/lock versions. Original reader files match the base snapshot byte-for-byte. Pending audit and waitlist statistics work was excluded.

`npm run docker:push` built locally for `linux/amd64`, completed its production build and TypeScript check, and published versioned and `latest` tags. Published digest: `sha256:cb4be9eed07358a742431435142c3f1f35e20e07a9e658d69a2980b129cf162d`. Remote platform image ID: `sha256:7d81afec083a0cc958c34722ac9399f4f63c276d35c533447d8b0b0de6ceb35e`.

Portainer stack 30 (`atcmh`) on endpoint 3 (`local`, remote Linux) received a fresh pull. Only the frontend Compose image reference changed; all 26 environment entries and other Compose configuration were preserved exactly. Portainer recreated both application containers. Both run with zero restarts, and frontend health is healthy. Backend image/digest and JAR match the previously verified 3.8.12 release; Discord finished loading with zero ERROR markers.

Verification passed:

- 17 focused tests, TypeScript and reader lint against the isolated release.
- Public version 1.8.12, health 200, backend questions 200, and home/Courses/guide/editor/application route status checks.
- Published guide response hash unchanged before/after deployment.
- Signed-in live browser: desktop chapter rail, vertical arrow-key navigation, phone selector and Escape dismissal, panel focus after selection, three YouTube embeds, Light/Dark appearance and real account avatar.
- No horizontal overflow at 1440 × 1024 and 390 × 844; no browser console errors. Original dark preference restored and viewport override reset.

No production content saves or application submissions occurred. Encrypted stack/Compose snapshots and release receipts are in `C:\Users\Reid\Documents\Codex\2026-10-02\atcmh-guide-redesign\private`. Isolated source and guarded one-release helpers are under ignored `Frontend/build/pilot-guide-release` and `Frontend/build/`. Do not blindly rerun them or reuse 1.8.12.

Live screenshots: `live-desktop.png`, `live-phone.png`, `live-phone-dark.png` in this directory.
