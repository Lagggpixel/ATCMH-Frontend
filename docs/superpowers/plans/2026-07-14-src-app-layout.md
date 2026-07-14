# `src/app` Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the Next.js App Router tree beneath `src/` without changing application behavior or routes.

**Architecture:** Next.js natively discovers `src/app`. The route tree moves as one unit, while path-sensitive source imports and contract tests are updated to the new filesystem location.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, ESLint.

## Global Constraints

- Preserve every public URL and handler path.
- Do not move `public/` or root configuration files.
- Do not modify or restore unrelated working-tree deletions.

---

### Task 1: Enforce the source layout

**Files:**
- Modify: `tests/deployment-contract.test.mjs`

**Interfaces:**
- Consumes: repository filesystem layout
- Produces: a contract requiring `src/app` and rejecting root `app`

- [x] **Step 1: Add a failing structural assertion**

Assert that `src/app/layout.tsx` exists and `app/layout.tsx` does not.

- [x] **Step 2: Verify the structural test fails**

Run: `node --test tests/deployment-contract.test.mjs`

Expected: failure because the route tree still exists at root `app/`.

- [x] **Step 3: Move the route tree and update references**

Move every tracked file from `app/` to `src/app/` and `proxy.ts` to `src/proxy.ts`. Replace `@/app/` with `@/src/app/`, update the Proxy's relative security-header import, and update filesystem-relative test references to resolve from their new locations.

- [x] **Step 4: Verify the structural test passes**

Run: `node --test tests/deployment-contract.test.mjs`

Expected: all deployment contract tests pass.

- [x] **Step 5: Run the complete verification suite**

Run: `npm test && npm run lint && npm run build`

Expected: zero test failures, zero lint errors, and a successful production build with unchanged route output.

- [x] **Step 6: Commit only the relocation**

Stage the moved route tree, updated tests/imports, and these design documents. Preserve unrelated deletions in `scripts/` and `sql/` as unstaged working-tree changes.
