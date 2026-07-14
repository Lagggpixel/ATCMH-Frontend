import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const source = (filename: string) => readFileSync(join(appDirectory, filename), "utf8");

test("dashboard layout keeps the gated runtime mounted across child route changes", () => {
    const layout = source("layout.tsx");

    assert.match(layout, /<SiteFrame footer=\{false\}>\s*<DashboardAccessGate>\s*<DashboardRuntime>\{children\}<\/DashboardRuntime>/);
    assert.match(layout, /export const dynamic = "force-dynamic"/);
});

test("dashboard catch-all page only renders the route content", () => {
    const page = source("[[...segments]]\/page.tsx");

    assert.match(page, /return <DashboardRoute\/>/);
    assert.doesNotMatch(page, /DashboardRuntime|DashboardAccessGate|SiteFrame/);
});
