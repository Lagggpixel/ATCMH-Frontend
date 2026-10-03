import assert from "node:assert/strict";
import test from "node:test";
import {resolveDashboardRoute} from "./route-map";
import {adminNavigationGroups} from "./components/admin/AdminNavigation";
import type {AdminUser} from "./types/AdminUser";

test("the pilot guide is a direct Administration screen for administrators", () => {
    assert.deepEqual(resolveDashboardRoute("/dashboard/pilot-guide"), {screen: "pilot-guide"});
    assert.deepEqual(resolveDashboardRoute("/dashboard/pilot-guide/invalid"), {screen: "not-found"});
    for (const role of ["admin", "super_admin"] as const) {
        const group = adminNavigationGroups({role} as AdminUser, true).find(item => item.label === "Administration");
        assert.ok(group?.items.some(item => item.path === "/dashboard/pilot-guide"));
    }
    for (const user of [undefined, {role: "staff"} as AdminUser]) assert.ok(!adminNavigationGroups(user, true).some(group => group.items.some(item => item.path === "/dashboard/pilot-guide")));
});
