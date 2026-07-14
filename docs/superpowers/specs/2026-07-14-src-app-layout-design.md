# `src/app` Layout Design

## Goal

Keep all application source beneath `src/` by relocating the Next.js App Router tree from `app/` to `src/app/` without changing URLs or runtime behavior.

## Design

- Move the complete root `app/` directory to `src/app/` and the Next runtime `proxy.ts` to `src/proxy.ts` so Next continues discovering the security headers.
- Keep `src/dashboard`, `src/lib`, and `src/marketing` in place.
- Update source aliases and tests that refer to the old filesystem location.
- Keep `public/`, package manifests, Next configuration, Docker files, test infrastructure, and operational documentation at the repository root because Next.js and the build tools expect those project-level locations.
- Add a structural contract asserting that `src/app` and `src/proxy.ts` exist while their root equivalents do not.

## Verification

Run the structural test red before the move and green afterward, followed by the complete test, lint, and production-build commands. Preserve unrelated existing working-tree changes.
