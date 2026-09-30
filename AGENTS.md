# ATCMH frontend guidance

This repository is the Next.js, React, and TypeScript frontend. Routes live under `src/app/`; other feature modules live under `src/`. Inspect current source and configuration rather than relying on the retired Dashboard/Vite layout.

## Commands

Run from this directory:

- `npm run dev`: Next.js development server.
- `npm run build`: production build.
- `npm run start`: production server after building.
- `npm run lint`: ESLint.
- `npm test`: Node test runner with the tsx loader. For a focused TypeScript test, use `node --import tsx --test <test-file>`.

`npm run docker:push` publishes images; it is not a local verification step. Run it only when publication is authorized.

## Changes and verification

- Follow nearby TypeScript, React, and CSS conventions. Preserve server/client boundaries and keep server-only credentials out of browser code.
- Verify affected API contracts against Dashboard-Backend and shared contract material when available. Do not assume changes in one repository update another.
- Add or update tests for meaningful behavior changes. Run affected tests, lint, and build as appropriate; use the broader suite for cross-cutting changes. Documentation-only edits need consistency checks.
- Preserve unrelated work and use focused commits when requested. PRs should state behavior changes, validation, and configuration or migration implications.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
