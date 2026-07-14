# Unified Auth, Consent, and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in Dashboard user enter the Exam Center without a second login, make consent reliable and visibly accessible, and make global versus Dashboard navigation unambiguous.

**Architecture:** Keep application-scoped session cookies: the backend creates a short-lived, one-use Exams handoff only after authenticating the Dashboard browser session and validating Dashboard CSRF. The unified Frontend exchanges that handoff through its existing callback to set the path-scoped Exams cookie, then retries the original Exam Center request. Consent remains a native POST workflow; its authenticated context and visual controls gain focused regression coverage.

**Tech Stack:** Next.js/React/TypeScript, Node test runner, Java 21/Spark/JUnit 5.

## Global Constraints

- The live target is `Frontend/`; do not modify the legacy `Dashboard/`, `Exams/`, or `RootSite/` apps for these routes.
- Never transfer a Dashboard bearer/session token to frontend JavaScript or reuse it as an Exams token.
- The new handoff must be Dashboard-session authenticated, CSRF protected, one-use, short-lived, and restricted to `/dashboard/exams` return paths.
- Preserve the existing Dashboard and Exams cookie names and path scoping.
- Consent policy links must be visibly distinguishable without relying on color alone.

---

## File structure

- `Dashboard-Backend/src/main/java/me/reid/restful/auth/CentralAuthRoutes.java` owns the browser-authenticated Dashboard-to-Exams handoff endpoint.
- `Dashboard-Backend/src/test/java/me/reid/restful/routes/CentralAuthRoutesTest.java` verifies endpoint authentication, CSRF, app scope, and one-time handoff behavior.
- `Frontend/src/dashboard/utils/ExamsApiUtils.ts` owns the client’s one-time handoff/retry behavior.
- `Frontend/src/dashboard/utils/ExamsApiUtils.test.ts` verifies session-null recovery and preserves the signed-out behavior.
- `Frontend/src/app/exams/api/auth/callback/route.ts` and `Frontend/src/lib/central-auth.ts` own the scoped return-path validation after the handoff.
- `Frontend/src/app/exams/api/auth/discord/user/callback/route.case.test.ts` and `Frontend/src/lib/central-auth.test.ts` verify cookie and safe-return contracts.
- `Frontend/src/dashboard/components/consent/ConsentPage.tsx` and `ConsentPage.module.css` own the consent form semantics and appearance.
- `Frontend/src/dashboard/components/consent/ConsentPage.test.ts` verifies accessible link and button contracts.
- `Frontend/src/marketing/SiteHeader.tsx`, `Frontend/src/platform/SiteFrame.tsx`, and `Frontend/src/dashboard/components/admin/AdminNav.tsx` own the global and contextual navigation hierarchy.
- `Frontend/src/platform/ui-unification-contract.test.ts` verifies the single global-header and named-secondary-navigation contract.

### Task 1: Restore the canonical consent origin in production

**Files:**
- Verify: `Dashboard-Backend/docker-compose.yml:42-52,72-75`
- Verify: `Frontend/deploy.md:95-129`
- Test: `Dashboard-Backend/src/test/java/me/reid/restful/routes/CentralAuthConsentHttpTest.java`

- [ ] **Step 1: Preserve the exact-origin contract in a failing deployment test.**

Add a deployment contract assertion that `https://atcmh.org` redirects permanently to `https://www.atcmh.org`, and that Dashboard API consent CORS accepts `https://www.atcmh.org` only.

- [ ] **Step 2: Run the focused backend contract test.**

Run: `./gradlew test --tests me.reid.restful.routes.CentralAuthConsentHttpTest`

Expected: PASS for the checked-in intended configuration. The live check below demonstrates the deployment has drifted.

- [ ] **Step 3: Align live deployment with the checked-in canonical host.**

Deploy the existing Traefik apex-to-`www` redirect and set `ALLOWED_ORIGINS=https://www.atcmh.org`, `FRONTEND_PUBLIC_ORIGIN=https://www.atcmh.org`, `DASHBOARD_PUBLIC_URL=https://www.atcmh.org/dashboard`, and `EXAMS_PUBLIC_URL=https://www.atcmh.org/exams`.

- [ ] **Step 4: Verify the deployed origin boundary.**

Run: `curl -I https://atcmh.org/consent`

Expected: `308` with `Location: https://www.atcmh.org/consent`.

- [ ] **Step 5: Re-establish the browser session and verify consent.**

Sign in again at `https://www.atcmh.org`; host-only consent/session cookies from the apex cannot migrate. Confirm the consent-context GET and consent POST use `Origin: https://www.atcmh.org`, then accept or decline and verify the safe redirect.

- [ ] **Step 6: Commit the deployment contract documentation or test change, if one was needed.**

Run: `git add Dashboard-Backend/src/test/java/me/reid/restful/routes/CentralAuthConsentHttpTest.java Dashboard-Backend/docker-compose.yml Frontend/deploy.md && git commit -m "fix: enforce canonical consent origin"`

### Task 2: Make consent controls and policy links visibly accessible

**Files:**
- Modify: `Frontend/src/dashboard/components/consent/ConsentPage.module.css`
- Modify: `Frontend/src/dashboard/components/consent/ConsentPage.test.ts`

- [ ] **Step 1: Write failing UI contract assertions.**

Assert the agreement links retain semantic anchors and the stylesheet contains an explicit underline plus focus-visible treatment; assert Accept is the only filled primary button and Decline is an outlined secondary action with readable contrast.

- [ ] **Step 2: Run the focused test.**

Run: `npm test -- src/dashboard/components/consent/ConsentPage.test.ts`

Expected: FAIL because agreement links currently have color and weight only, with no text decoration or focus treatment.

- [ ] **Step 3: Implement the minimal CSS changes.**

Use `text-decoration: underline`, an underline offset, and `:focus-visible` outline for `.agreement a`; explicitly define hover/focus colors. Give the primary accept button a high-contrast accent fill and give the decline/recovery-secondary actions a visible border and non-dim text color.

- [ ] **Step 4: Verify visual and automated behavior.**

Run: `npm test -- src/dashboard/components/consent/ConsentPage.test.ts`

Run: `npm run build`

Expected: test and production build pass; visually check keyboard focus, unchecked and checked agreement, hover, disabled/default browser states, and narrow viewport layout.

### Task 3: Mint a safe Exams session from an existing Dashboard session

**Files:**
- Modify: `Dashboard-Backend/src/main/java/me/reid/restful/auth/CentralAuthRoutes.java`
- Modify: `Dashboard-Backend/src/test/java/me/reid/restful/routes/CentralAuthRoutesTest.java`

- [ ] **Step 1: Write failing JUnit tests for `POST /auth/handoffs/exams`.**

Assert: no Dashboard cookie returns `401`; invalid/missing CSRF returns `403`; a valid Dashboard session plus CSRF returns only a short-lived one-use handoff; an Exams token cannot call the endpoint; consuming the handoff twice fails.

- [ ] **Step 2: Run the focused test.**

Run: `./gradlew test --tests me.reid.restful.routes.CentralAuthRoutesTest`

Expected: FAIL because the endpoint is absent.

- [ ] **Step 3: Implement the endpoint with existing session primitives.**

Authenticate the browser cookie as `Application.DASHBOARD`, validate the same-origin/CSRF rules used by Dashboard logout, and create an `Application.EXAMS` handoff through the existing central-auth service. Return JSON containing only the handoff; do not reveal the Dashboard session token.

- [ ] **Step 4: Verify the backend contract.**

Run: `./gradlew test --tests me.reid.restful.routes.CentralAuthRoutesTest`

Expected: PASS including one-time consumption and rejected cross-application use.

### Task 4: Exchange the handoff and resume the original Exam Center page

**Files:**
- Modify: `Frontend/src/dashboard/utils/ExamsApiUtils.ts`
- Modify: `Frontend/src/dashboard/utils/ExamsApiUtils.test.ts`
- Modify: `Frontend/src/app/exams/api/auth/callback/route.ts`
- Modify: `Frontend/src/lib/central-auth.ts`
- Modify: `Frontend/src/lib/central-auth.test.ts`
- Modify: `Frontend/src/app/exams/api/auth/discord/user/callback/route.case.test.ts`

- [ ] **Step 1: Write failing TypeScript tests.**

Test an initial `{ session: null }` response followed by a successful Dashboard handoff and a successful session retry. Test that an unavailable/unauthorized Dashboard handoff still yields the existing Exams-sign-in state. Test that return paths allow `/dashboard/exams` and its nested routes only, rejecting arbitrary Dashboard paths and external URLs.

- [ ] **Step 2: Run the focused tests.**

Run: `npm test -- src/dashboard/utils/ExamsApiUtils.test.ts src/lib/central-auth.test.ts src/app/exams/api/auth/discord/user/callback/route.case.test.ts`

Expected: FAIL because the client currently stops at the first missing Exams session and safe returns only allow `/exams`.

- [ ] **Step 3: Implement one bounded recovery attempt.**

On the first missing Exams session, request the backend handoff with Dashboard CSRF, pass it through the existing Exams callback, then retry `/exams/api/auth/session` exactly once. Restrict the final callback return to `/dashboard/exams` plus its descendants; retain `/exams` for normal learner sign-in.

- [ ] **Step 4: Verify the handoff flow.**

Run: `npm test -- src/dashboard/utils/ExamsApiUtils.test.ts src/lib/central-auth.test.ts src/app/exams/api/auth/discord/user/callback/route.case.test.ts`

Run: `npm run build`

Expected: focused tests and build pass; browser QA shows a Dashboard login opening `/dashboard/exams` without a second credential prompt.

### Task 5: Clarify, rather than duplicate, navigation

**Files:**
- Modify: `Frontend/src/dashboard/components/admin/AdminNav.tsx`
- Modify: `Frontend/src/dashboard/components/admin/AdminNav.module.css`
- Modify: `Frontend/src/platform/ui-unification-contract.test.ts`

- [ ] **Step 1: Write the failing navigation contract.**

Assert all application pages use the shared `SiteHeader`, and Dashboard alone renders one explicitly named secondary navigation landmark labelled `Dashboard sections`.

- [ ] **Step 2: Run the focused test.**

Run: `npm test -- src/platform/ui-unification-contract.test.ts`

Expected: FAIL because the current secondary navigation does not identify itself as contextual Dashboard navigation.

- [ ] **Step 3: Implement the hierarchy.**

Keep `SiteHeader` as the global navbar. Give `AdminNav` an accessible label and a compact contextual heading, then adjust its spacing, border, and active styling so it reads as a secondary section bar rather than a second global header.

- [ ] **Step 4: Verify.**

Run: `npm test -- src/platform/ui-unification-contract.test.ts`

Run: `npm run build`

Expected: all tests pass; desktop and mobile checks show exactly one global header and a clearly contextual Dashboard section bar.

### Task 6: Integrate and release safely

**Files:**
- Modify only the files completed in Tasks 1-5.

- [ ] **Step 1: Run the complete Frontend suite.**

Run: `npm test`

Expected: all Node tests pass.

- [ ] **Step 2: Run the complete backend suite.**

Run: `./gradlew test`

Expected: all JUnit tests pass.

- [ ] **Step 3: Run production builds.**

Run: `npm run build`

Run: `./gradlew shadowJar`

Expected: both artifacts build successfully.

- [ ] **Step 4: Deploy in dependency order.**

Deploy `Dashboard-Backend` first, then `Frontend`. Verify the new backend endpoint is available before serving the Frontend that calls it; old Frontend remains safe because it does not call the new endpoint.

- [ ] **Step 5: Perform live QA.**

Verify: Dashboard-only session automatically reaches `/dashboard/exams`; no token appears in page source or URLs; consent has readable primary/secondary buttons and visibly underlined policy links; consent accept and decline redirect safely; all application pages retain the same global header.
