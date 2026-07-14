# Unified ATCMH Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one production-ready Next.js 16.2.10 application that preserves the current RootSite, Dashboard, and Exams behavior at the canonical unified routes.

**Architecture:** Exams remains server-authorized and moves under the `/exams` route tree. Dashboard becomes a client feature area backed by a shared provider and a small Next navigation adapter, while its safe backend URL is serialized from server-only runtime configuration. RootSite owns `/`, `/terms`, and `/policy`; shared Dashboard identity pages remain at `/auth`, `/account`, and `/consent`.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.7, TypeScript 5.9, Node test runner with `tsx`, ESLint 9, Zod, MySQL2, Recharts, Docker standalone output.

## Global Constraints

- The new repository is `/Users/wanbin/Documents/Github/InfiniteFlight/ATCMH/Frontend`, package `atcmh-frontend`, version `1.0.0`.
- Preserve the source repositories and copy their current working trees without `.env`, `.git`, `.next`, `node_modules`, `.superpowers`, build outputs, dumps, or transcripts.
- Do not add `/apply` and do not add a nested `BrowserRouter`.
- Dashboard-to-Exams traffic is same-origin under `/exams/api/...`.
- Exams session and attempt cookies use `Path=/exams`, `HttpOnly`, `SameSite=Lax`, and `Secure` except when `FRONTEND_PUBLIC_ORIGIN` is an exact HTTP loopback origin.
- No secrets may use `NEXT_PUBLIC_*` or Docker build arguments.
- Every new behavior follows a verified red-green test cycle.
- Final verification is `npm test`, `npm run lint`, and `npm run build`; initialize Git, verify ignored environment files, inspect the staged diff for secrets, commit, and do not push.

---

### Task 1: Establish migration contracts and the standalone app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`
- Create: `src/lib/unified-routes.test.ts`, `src/lib/exams-cookie.test.ts`, `src/lib/runtime-config.test.ts`
- Create: `.gitignore`, `.dockerignore`, `.env.example`

**Interfaces:**
- Produces `EXAMS_BASE_PATH`, `examsPath(path)`, `examsCookieOptions(origin)`, and `loadPublicRuntimeConfig(env)` for later route, cookie, and Dashboard work.

- [ ] Write contract tests for canonical routes, `/exams` cookie scope and exact-loopback security, safe Dashboard API URL validation, and prohibited public secrets.
- [ ] Run the targeted tests and confirm they fail because the contract modules do not exist.
- [ ] Add the minimal package/configuration and contract helpers.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 2: Relocate and harden Exams

**Files:**
- Create: `app/exams/**` from the current `Exams/app` learner and API trees
- Create: `src/exams/**` from the current `Exams/src/lib` tree
- Create: `public/exams/**` from current Exams assets
- Create: `app/api/health/route.ts`
- Modify: all relocated Exams links, redirects, callbacks, fetches, test expectations, and cookie writes

**Interfaces:**
- Consumes `examsPath()` and `examsCookieOptions()`.
- Produces learner pages at `/exams...`, handlers at `/exams/api...`, and global health at `/api/health`.

- [ ] Move existing Exams tests first and update their expected paths/cookie attributes.
- [ ] Run the Exams path/cookie/auth tests and confirm expected failures against the copied source behavior.
- [ ] Relocate source files, rewrite absolute learner/API paths to `/exams`, and centralize cookie options.
- [ ] Re-run all Exams tests and fix only demonstrated regressions, including the login-policy disclosure.

### Task 3: Adapt Dashboard to native Next routing

**Files:**
- Create: `src/dashboard/**` from current `Dashboard/src` feature code
- Create: `src/dashboard/DashboardProvider.tsx`, `src/dashboard/next-navigation.tsx`, `src/dashboard/DashboardRoute.tsx`
- Create: `app/dashboard/[[...segments]]/page.tsx`
- Create: `app/auth/page.tsx`, `app/account/page.tsx`, `app/consent/page.tsx`
- Test: `src/dashboard/dashboard-routing.test.ts`, migrated Dashboard utility/component tests

**Interfaces:**
- Consumes server-supplied `{ dashboardApiUrl: string }`.
- Produces canonical Dashboard routes without React Router and same-origin Exams management requests.

- [ ] Add failing route-adapter and same-origin Exams API tests.
- [ ] Copy Dashboard feature code and existing tests, replacing React Router hooks/components with Next adapters and `/admin` UI routes with `/dashboard`.
- [ ] Extract `App` shared auth/data state into `DashboardProvider`, map canonical route segments to existing screens, and expose dynamic IDs through the adapter.
- [ ] Pass validated `DASHBOARD_API_URL` from server pages into the client provider and remove `import.meta.env` use.
- [ ] Run Dashboard targeted tests until green.

### Task 4: Merge RootSite and production configuration

**Files:**
- Create: `app/page.tsx`, `app/terms/page.tsx`, `app/policy/page.tsx`, `src/marketing/**`, `public/assets/**`
- Create: `.dockerfile`
- Modify: `next.config.ts`, `app/layout.tsx`, scoped global styles

**Interfaces:**
- Produces the marketing/legal routes, global security headers/CSP, standalone non-root image, and healthcheck.

- [ ] Migrate RootSite tests and confirm they initially fail against the missing App Router pages.
- [ ] Copy the current marketing/legal source and assets into App Router components without visual redesign.
- [ ] Scope marketing, Dashboard, and Exams globals by top-level product containers.
- [ ] Add CSP/security headers and a multi-stage non-root Docker image whose healthcheck calls `/api/health`.
- [ ] Run targeted marketing/configuration tests until green.

### Task 5: Full verification, repository hygiene, and handoff

**Files:**
- Create: `/Users/wanbin/Documents/Github/InfiniteFlight/ATCMH/frontend-migration-report.md`

**Interfaces:**
- Produces one local commit and a concise evidence-backed report.

- [ ] Run `npm test`, `npm run lint`, and `npm run build` from a clean command invocation and record exact outcomes.
- [ ] Run the production app locally, inspect representative marketing, Dashboard, Exams, and health routes at desktop and mobile sizes, and compare them to their source UIs.
- [ ] Confirm no `/apply`, nested `BrowserRouter`, copied environment file, source-repository modification, or secret-bearing `NEXT_PUBLIC_*` remains.
- [ ] Stage the intended tree, use `git check-ignore` for `.env*`, inspect `git diff --cached` and scan it for credential patterns.
- [ ] Write the migration report, commit the new repository, and return the commit hash without pushing.
