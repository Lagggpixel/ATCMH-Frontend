import test from "node:test";
import assert from "node:assert/strict";
import {adminNavigationGroups, adminNavigationItems} from "./AdminNavigation.ts";
import {accountPageState, accountStatusLabel} from "../account/AccountPageState.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {impersonationBannerText} from "../account/ImpersonationState.ts";

const user = (capabilities: Partial<AdminUser> = {}): AdminUser => ({id: "1", username: "Staff", canManageAllAssignments: false, canViewAuditLogs: false, canViewManual: false, canManageAccounts: false, canReviewAltAccounts: false, canViewSensitiveAuditDetails: false, canImpersonate: false, ...capabilities});

test("account and alt navigation outcomes follow server capabilities", () => {
    assert.equal(adminNavigationItems(user(), false).some(item => item.path === "/dashboard/accounts"), false);
    const privileged = adminNavigationItems(user({canManageAccounts: true, canReviewAltAccounts: true}), false).map(item => item.path);
    assert.ok(privileged.includes("/dashboard/accounts")); assert.ok(privileged.includes("/dashboard/alt-accounts"));
    assert.ok(!privileged.includes("/account"));
});

test("mock question navigation follows its dedicated server capability", () => {
    assert.equal(adminNavigationItems(user(), false).some(item => item.path === "/dashboard/mock-questions"), false);
    assert.equal(adminNavigationItems(user({canManageMockQuestions: true}), false).some(item => item.path === "/dashboard/mock-questions"), true);
});

test("dashboard navigation keeps mentorship, assessment, and administration grouped without nested assessment labels", () => {
    const groups = adminNavigationGroups(user({canManageMockQuestions: true, canManageApplicationQuestions: true, canManageAccounts: true, canReviewAltAccounts: true, canViewAuditLogs: true}), true);
    assert.deepEqual(groups.map(group => group.label), ["Mentorship", "Assessment", "Administration"]);
    assert.deepEqual(groups.map(group => group.items.map(item => item.label)), [
        ["Mentees", "Assignments", "Sessions", "User Notes", "Mentor Manual"],
        ["Mock Questions", "Application Questions", "Exam Center", "Course Center"],
        ["Statistics", "Accounts", "Alternative Evidence", "Audit Logs"],
    ]);
    assert.deepEqual(groups[1].sections.map(section => section.label), [undefined]);
    assert.deepEqual(groups[1].sections[0].items, [
        {path: "/dashboard/mock-questions", label: "Mock Questions"},
        {path: "/dashboard/application-questions", label: "Application Questions"},
        {path: "/dashboard/exams", label: "Exam Center"},
        {path: "/dashboard/exams/courses", label: "Course Center"},
    ]);
    assert.deepEqual(adminNavigationItems(user(), false).map(item => item.path), [
        "/dashboard/mentees", "/dashboard/assignments", "/dashboard/sessions", "/dashboard/usernotes", "/dashboard/manual", "/dashboard/stats",
    ]);
});

test("impersonation outcome names the target account", () => assert.equal(impersonationBannerText("42"), "Impersonating account 42"));

test("personal account outcomes distinguish restoration, conflicts, and linked identities", () => {
    assert.deepEqual(accountPageState(null, true, null, null), {kind: "loading"});
    assert.deepEqual(accountPageState(null, false, null, "link_conflict"), {kind: "signed-out", authMessage: "These identities are already linked to different accounts. Nothing was changed. Please contact support for review.", error: null});
    const state = accountPageState({accountId: "7", status: "ACTIVE", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "csrf", impersonating: false, identities: [{provider: "discord", subject: "d", displayName: "Pilot"}, {provider: "ifc", subject: "i"}]}, false, null, null);
    assert.deepEqual(state, {kind: "account", accountId: "7", status: "ACTIVE", discord: "Pilot", ifc: "i", expiresAt: "2026-07-14T00:00:00Z"});
});
test("real lowercase backend status renders as a user-facing label", () => assert.equal(accountStatusLabel("active"), "Active"));
