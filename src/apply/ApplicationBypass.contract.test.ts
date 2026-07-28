import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Super Admin eligibility bypass is explicit and limited in the application UI", () => {
    const application = source("./ApplicationPage.tsx");
    assert.match(application, /application\.superAdminBypassActive === true \? <SuperAdminBypassNotice\/> : null/);
    assert.match(application, /Super Admin bypass active/);
    assert.match(application, /existing-role\/IFATC eligibility restriction was overridden solely to test this application flow/);
    assert.match(application, /Every other eligibility and safety check still applies/);
    assert.match(application, /marked for moderation audit/);
});

test("the bypass warning remains conspicuous in editable and terminal application states", () => {
    const application = source("./ApplicationPage.tsx");
    const styles = source("./ApplicationPage.module.css");
    assert.equal(application.match(/<SuperAdminBypassNotice\/>/g)?.length, 2);
    assert.match(styles, /\.bypassNotice[^}]+border: 2px solid #f59e0b/);
    assert.match(styles, /\.bypassNotice strong[^}]+text-transform: uppercase/);
});
