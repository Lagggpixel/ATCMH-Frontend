import assert from "node:assert/strict";
import test from "node:test";
import {RoleApi} from "./RoleApi";
import {configureDashboardApiUrl} from "./ApiUtils";
import {canManageRoles} from "../types/DashboardRole";
import type {AdminUser} from "../types/AdminUser";
import {adminNavigationGroups} from "../components/admin/AdminNavigation";
import {resolveDashboardRoute} from "../route-map";

test("Roles navigation and UI are exclusive to the unimpersonated superadmin capability", () => {
    const root = {role: "super_admin", canManageRoles: true} as AdminUser;
    assert.equal(canManageRoles(root), true);
    assert.equal(canManageRoles(root, true), false);
    assert.equal(canManageRoles({...root, canManageRoles: false}), false);
    for (const user of [undefined, {role: "admin", canManageRoles: true} as AdminUser, {role: "staff", canManageRoles: true} as AdminUser]) {
        assert.equal(canManageRoles(user), false);
        assert.ok(!adminNavigationGroups(user, true).some(group => group.items.some(item => item.path === "/dashboard/roles")));
    }
    assert.ok(adminNavigationGroups(root, true).find(group => group.label === "Administration")?.items.some(item => item.label === "Roles"));
    assert.deepEqual(resolveDashboardRoute("/dashboard/roles"), {screen: "roles"});
});

test("role APIs preserve identity strings, use cookies and CSRF, and surface failed saves", async () => {
    const original = globalThis.fetch;
    configureDashboardApiUrl("https://example.test/api/dashboard");
    const member = {discordId: "1194282107401412678", displayName: "Kai"};
    const requests: Array<{url: string; options?: RequestInit}> = [];
    globalThis.fetch = async (url, options) => {requests.push({url: String(url), options}); return new Response(JSON.stringify({changed: true, members: [member]}));};
    try {
        await RoleApi.add("ADMIN", member, "csrf");
        await RoleApi.remove("SIMULATOR_TESTER", member, "csrf");
        await RoleApi.candidates("Kai & Mustang");
        assert.equal(requests[0].options?.method, "PUT");
        assert.equal(requests[0].options?.credentials, "include");
        assert.equal(new Headers(requests[0].options?.headers).get("X-CSRF-Token"), "csrf");
        assert.deepEqual(JSON.parse(requests[0].options?.body as string), {discordId: member.discordId});
        assert.equal(requests[1].options?.method, "DELETE");
        assert.match(requests[1].url, /SIMULATOR_TESTER\/members\/1194282107401412678$/);
        assert.equal(new URL(requests[2].url).searchParams.get("q"), "Kai & Mustang");
        assert.equal(new Headers(requests[2].options?.headers).get("X-CSRF-Token"), null);
        globalThis.fetch = async () => new Response(JSON.stringify({error: "Superadmin access is required"}), {status: 403});
        await assert.rejects(RoleApi.add("ADMIN", member, "csrf"), /Superadmin access/);
    } finally {globalThis.fetch = original; configureDashboardApiUrl("https://dashboard-api.atcmh.org");}
});
