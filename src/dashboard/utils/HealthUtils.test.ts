import test from "node:test";
import assert from "node:assert/strict";
import {canViewHealth, filterHealthJobs, healthUptime, needsAttention} from "./HealthUtils.ts";
import {adminNavigationItems} from "../components/admin/AdminNavigation.ts";
import {resolveDashboardRoute} from "../route-map.ts";
import type {HealthJob} from "../types/BotHealth.ts";
import type {AdminUser} from "../types/AdminUser.ts";

const jobs: HealthJob[] = [
    {name: "session-post-colors", state: "HEALTHY", overdue: false},
    {name: "controlling-feed", state: "FAILED", overdue: false, failureReference: "job-123"},
    {name: "reminders", state: "RUNNING", overdue: true},
    {name: "attendance", state: "DISABLED", overdue: false, disabledReason: "Disabled by configuration"},
];

test("health page and navigation require application admin roles, even with other capabilities", () => {
    assert.equal(canViewHealth(undefined), false);
    for (const role of ["admin", "super_admin", "staff"] as const) {
        const user = {role, canManageAccounts: true} as AdminUser;
        assert.equal(canViewHealth(user), role !== "staff");
        assert.equal(adminNavigationItems(user, true).some(item => item.path === "/dashboard/health"), role !== "staff");
    }
    assert.deepEqual(resolveDashboardRoute("/dashboard/health"), {screen: "health"});
    assert.deepEqual(resolveDashboardRoute("/dashboard/health/invalid"), {screen: "not-found"});
});

test("attention filtering includes failed and overdue jobs, but not intentionally disabled jobs", () => {
    assert.equal(needsAttention(jobs[3]), false);
    assert.deepEqual(filterHealthJobs(jobs, "", true), jobs.slice(1, 3));
    assert.deepEqual(filterHealthJobs(jobs, " JOB-123 ", true), [jobs[1]]);
    assert.deepEqual(filterHealthJobs(jobs, "CONFIGURATION", false), [jobs[3]]);
    assert.deepEqual(filterHealthJobs(jobs, "session", true), []);
});

test("uptime formats days, hours and minutes", () => {
    assert.equal(healthUptime(187260), "2d 4h 1m");
    assert.equal(healthUptime(-1), "0d 0h 0m");
});
