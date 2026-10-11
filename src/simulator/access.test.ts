import assert from "node:assert/strict";
import test from "node:test";
import {canAccessStaffSimulator} from "./feature";
import {adminNavigationGroups} from "../dashboard/components/admin/AdminNavigation";
import type {AdminUser} from "../dashboard/types/AdminUser";

test("simulator entry accepts staff, administrators and Simulator Testers", () => {
  for (const user of [{role: "admin"}, {role: "super_admin"}, {role: "staff", canManageAllAssignments: true}, {role: "staff", canManageAllAssignments: false, canAccessSimulator: true}] as AdminUser[]) {
    assert.equal(canAccessStaffSimulator(user), true);
    assert.ok(adminNavigationGroups(user, true, true).find(group => group.label === "Assessment")?.items.some(item => item.path === "/simulator/staff" && item.label === "ATC Simulator"));
    assert.ok(!adminNavigationGroups(user, true, false).some(group => group.items.some(item => item.path === "/simulator/staff")));
  }
  for (const user of [undefined, {} as AdminUser, {role: "staff"} as AdminUser]) {
    assert.equal(canAccessStaffSimulator(user), false);
    assert.ok(!adminNavigationGroups(user, true, true).some(group => group.items.some(item => item.path === "/simulator/staff")));
  }
  for (const role of ["staff", "admin", "super_admin"] as const)
    assert.equal(canAccessStaffSimulator({role, canManageAllAssignments: true, canAccessSimulator: false}), false);
});

test("Simulator Tester gets simulator access without other dashboard navigation", () => {
  const tester = {role: "staff", canAccessSimulator: true, canAccessDashboard: false, canManageAllAssignments: false} as AdminUser;
  assert.equal(canAccessStaffSimulator(tester), true);
  assert.deepEqual(adminNavigationGroups(tester, true, true).flatMap(group => group.items), [{path: "/simulator/staff", label: "ATC Simulator"}]);
  assert.deepEqual(adminNavigationGroups(tester, true, false), []);
  assert.equal(canAccessStaffSimulator({...tester, canAccessSimulator: false}), false);
});
