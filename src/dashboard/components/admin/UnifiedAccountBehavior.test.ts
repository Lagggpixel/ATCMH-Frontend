import test from "node:test";
import assert from "node:assert/strict";
import {adminNavigationItems} from "./AdminNavigation.ts";
import {accountPageState, accountStatusLabel} from "../account/AccountPageState.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {impersonationBannerText} from "../account/ImpersonationState.ts";

const user = (capabilities: Partial<AdminUser> = {}): AdminUser => ({id: "1", username: "Staff", canManageAllAssignments: false, canViewAuditLogs: false, canViewManual: false, canManageAccounts: false, canReviewAltAccounts: false, canViewSensitiveAuditDetails: false, canImpersonate: false, ...capabilities});

test("account and alt navigation outcomes follow server capabilities", () => {
    assert.equal(adminNavigationItems(user(), false).some(item => item.path === "/dashboard/accounts"), false);
    const privileged = adminNavigationItems(user({canManageAccounts: true, canReviewAltAccounts: true}), false).map(item => item.path);
    assert.ok(privileged.includes("/dashboard/accounts")); assert.ok(privileged.includes("/dashboard/alt-accounts"));
});

test("impersonation outcome names the target account", () => assert.equal(impersonationBannerText("42"), "Impersonating account 42"));

test("personal account outcomes distinguish restoration, conflicts, and linked identities", () => {
    assert.deepEqual(accountPageState(null, true, null, null), {kind: "loading"});
    assert.deepEqual(accountPageState(null, false, null, "link_conflict"), {kind: "signed-out", authMessage: "These identities are already linked to different accounts. Nothing was changed. Please contact support for review.", error: null});
    const state = accountPageState({accountId: "7", status: "ACTIVE", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "csrf", impersonating: false, identities: [{provider: "discord", subject: "d", displayName: "Pilot"}, {provider: "ifc", subject: "i"}]}, false, null, null);
    assert.deepEqual(state, {kind: "account", accountId: "7", status: "ACTIVE", discord: "Pilot", ifc: "i", expiresAt: "2026-07-14T00:00:00Z"});
});
test("real lowercase backend status renders as a user-facing label", () => assert.equal(accountStatusLabel("active"), "Active"));
