import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const source = (filename: string) => readFileSync(join(appDirectory, filename), "utf8");

test("dashboard layout keeps the gated runtime mounted across child route changes", () => {
    const layout = source("layout.tsx");

    assert.match(layout, /<SiteFrame footer=\{false\} header=\{<DashboardHeader\/>\}>\s*<DashboardAccessGate>\s*<DashboardRuntime>\{children\}<\/DashboardRuntime>/);
    assert.match(layout, /import DashboardHeader from "@\/src\/dashboard\/DashboardHeader"/);
    assert.match(layout, /export const dynamic = "force-dynamic"/);
});

test("dashboard catch-all page only renders the route content", () => {
    const page = source("[[...segments]]\/page.tsx");

    assert.match(page, /return <DashboardRoute\/>/);
    assert.doesNotMatch(page, /DashboardRuntime|DashboardAccessGate|SiteFrame/);
});

test("dashboard replaces the public header contents without losing its shared treatment", () => {
    const layout = source("layout.tsx");
    const header = readFileSync(join(appDirectory, "../../dashboard/DashboardHeader.tsx"), "utf8");
    const headerStyles = readFileSync(join(appDirectory, "../../dashboard/DashboardHeader.module.css"), "utf8");

    assert.match(layout, /header=\{<DashboardHeader\/>\}/);
    assert.match(header, /site-header is-scrolled is-solid/);
    assert.match(header, /Back to main site/);
    assert.match(header, /<AdminNav adminUser=\{adminUser\} embedded\/>/);
    assert.match(header, /<AuthNavigation showLogin=\{false\}\/>/);
    assert.match(header, /nav-primary-auth \$\{styles\.accountNavigation}/);
    assert.match(headerStyles, /@media \(max-width: 1080px\)[\s\S]*?\.dashboardHeader \.accountNavigation\s*\{[^}]*display:\s*flex[^}]*min-width:\s*2\.75rem/s);
});
