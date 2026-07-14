import test from "node:test";
import assert from "node:assert/strict";
import {resolveAdminUserForSession, type SessionBoundAdminUser} from "./AdminSessionUtils.ts";
import type {AdminUser} from "../types/AdminUser.ts";

const staff: AdminUser = {
    id: "123",
    username: "Staff",
    canManageAllAssignments: false,
    canViewAuditLogs: false,
    canViewManual: false,
    canManageAccounts: false,
    canReviewAltAccounts: false,
    canViewSensitiveAuditDetails: false,
    canImpersonate: false,
};

test("admin visibility requires the exact session token that authorized the staff lookup", () => {
    const authorized: SessionBoundAdminUser = {token: "csrf-session-a", user: staff};

    assert.equal(resolveAdminUserForSession(authorized, "csrf-session-a"), staff);
    assert.equal(resolveAdminUserForSession(authorized, "csrf-session-b"), undefined);
    assert.equal(resolveAdminUserForSession(authorized, null), undefined);
    assert.equal(resolveAdminUserForSession(undefined, "csrf-session-a"), undefined);
});
