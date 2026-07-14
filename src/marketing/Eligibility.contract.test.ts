import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("eligibility guides signed-out and IFC-unlinked accounts before requesting results", () => {
    const component = source("./Eligibility.tsx");
    assert.match(component, /Log in to see your account/);
    assert.match(component, /Link your Infinite Flight account/);
    assert.match(component, /if \(!session \|\| !hasIfcIdentity\)/);
    assert.match(component, /ApiUtils\.getEligibility\(\)/);
});

test("eligibility renders pass, fail, and manual verification outcomes", () => {
    const component = source("./Eligibility.tsx");
    assert.match(component, /pass: "Met"/);
    assert.match(component, /fail: "Not met"/);
    assert.match(component, /manual: "Manual verification required"/);
    assert.match(component, /temporarily unavailable/);
});

test("eligibility API uses the authenticated account endpoint", () => {
    const api = source("../dashboard/utils/ApiUtils.ts");
    assert.match(api, /\/account\/eligibility/);
    assert.match(api, /credentials: "include"/);
    assert.match(api, /status: "ready" \| "not_linked" \| "unavailable" \| "already_ifatc"/);
});

test("already IFATC accounts bypass the normal requirements list", () => {
    const component = source("./Eligibility.tsx");
    assert.match(component, /result\.status === "already_ifatc"/);
    assert.match(component, /already an IFATC; the remaining mentorship eligibility requirements do not apply/);
});
