import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import test from "node:test";
import {DASHBOARD_APPEARANCE_KEY, dashboardAppearanceBootstrap, parseDashboardAppearance, resolveDashboardTheme} from "./appearance";

test("appearance accepts only supported saved preferences", () => {
    for (const value of [null, "", "navy", "{invalid}", "system"]) assert.equal(parseDashboardAppearance(value), "system");
    assert.equal(parseDashboardAppearance("dark"), "dark");
    assert.equal(parseDashboardAppearance("light"), "light");
});

test("explicit preferences override OS appearance; System follows the OS", () => {
    for (const systemDark of [true, false]) {
        assert.equal(resolveDashboardTheme("light", systemDark), "light");
        assert.equal(resolveDashboardTheme("dark", systemDark), "dark");
        assert.equal(resolveDashboardTheme("system", systemDark), systemDark ? "dark" : "light");
    }
});

function bootstrap({path = "/dashboard/courses", saved = null, systemDark = false, blocked = false}: {path?: string; saved?: string | null; systemDark?: boolean; blocked?: boolean}) {
    const dataset: Record<string, string> = {};
    runInNewContext(dashboardAppearanceBootstrap, {
        location: {pathname: path}, document: {documentElement: {dataset}},
        localStorage: {getItem(key: string) { assert.equal(key, DASHBOARD_APPEARANCE_KEY); if (blocked) throw new Error("Storage denied"); return saved; }},
        matchMedia(query: string) { assert.equal(query, "(prefers-color-scheme: dark)"); return {matches: systemDark}; },
    });
    return dataset.dashboardTheme;
}

test("first paint restores the saved choice and respects System", () => {
    assert.equal(bootstrap({saved: "dark"}), "dark");
    assert.equal(bootstrap({saved: "light", systemDark: true}), "light");
    assert.equal(bootstrap({saved: "system", systemDark: true}), "dark");
    assert.equal(bootstrap({saved: "unknown", systemDark: false}), "light");
    assert.equal(bootstrap({blocked: true, systemDark: true}), "dark");
});

test("dashboard preference applies to courses and pilot guide without altering public or assessment pages", () => {
    for (const path of ["/", "/exams", "/exams/courses-example", "/account", "/dashboard-example", "/pilot-guide-example"]) assert.equal(bootstrap({path, saved: "dark"}), undefined);
    assert.equal(bootstrap({path: "/dashboard", saved: "dark"}), "dark");
    assert.equal(bootstrap({path: "/exams/courses/example", saved: "dark"}), "dark");
    assert.equal(bootstrap({path: "/exams/courses", saved: "light", systemDark: true}), "light");
    assert.equal(bootstrap({path: "/pilot-guide", saved: "dark"}), "dark");
    assert.equal(bootstrap({path: "/pilot-guide/", saved: "light", systemDark: true}), "light");
});
