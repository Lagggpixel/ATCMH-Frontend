import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Admin eligibility bypass is explicitly identified in the application UI", () => {
    const application = source("./ApplicationPage.tsx");
    assert.match(application, /application\.superAdminBypassActive === true \? <AdminBypassNotice\/> : null/);
    assert.match(application, /Admin bypass active/);
    assert.match(application, /aria-label="Admin eligibility bypass active"/);
});

test("the bypass warning remains conspicuous in editable and terminal application states", () => {
    const application = source("./ApplicationPage.tsx");
    const styles = source("./ApplicationPage.module.css");
    assert.equal(application.match(/<AdminBypassNotice\/>/g)?.length, 2);
    assert.match(styles, /\.bypassNotice[^}]+border: 2px solid #f59e0b/);
    assert.match(styles, /\.bypassNotice strong[^}]+text-transform: uppercase/);
});
