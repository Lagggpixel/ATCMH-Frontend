import assert from "node:assert/strict";
import test from "node:test";
import {securityHeadersFor} from "./security-headers";

const env = {FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.org", DASHBOARD_API_URL: "https://dashboard-api.atcmh.org"};
const csp = (path: string) => securityHeadersFor(env, "production", path).find(header => header.key === "Content-Security-Policy")!.value;

test("YouTube embeds and direct videos are scoped to guide reader and editor", () => {
    for (const path of ["/pilot-guide", "/pilot-guide/", "/dashboard/pilot-guide", "/dashboard/pilot-guide/"]) {
        assert.match(csp(path), /frame-src blob: https:\/\/www\.youtube-nocookie\.com;/);
        assert.match(csp(path), /media-src 'self' https:;/);
        assert.doesNotMatch(csp(path), /frame-src[^;]+youtube\.com/);
    }
});
test("other routes retain their original frame and media restrictions", () => {
    for (const path of ["", "/", "/dashboard", "/dashboard/courses", "/pilot-guide-other", "/pilot-guide/subpage", "/dashboard/pilot-guide/subpage"]) {
        assert.match(csp(path), /frame-src blob:;/);
        assert.doesNotMatch(csp(path), /youtube|media-src/);
    }
    assert.match(csp("/pilot-guide"), /frame-ancestors 'none'/);
    assert.match(csp("/pilot-guide"), /upgrade-insecure-requests/);
});
