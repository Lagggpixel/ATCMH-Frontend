import assert from "node:assert/strict";
import test from "node:test";
import {securityHeadersFor} from "./security-headers";

const env = {FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.org", DASHBOARD_API_URL: "https://dashboard-api.atcmh.org"};
const csp = (path: string) => securityHeadersFor(env, "production", path).find(header => header.key === "Content-Security-Policy")!.value;

test("Kokoro WASM and same-origin workers are permitted only on simulator routes", () => {
    for (const path of ["/sweatbox/staff/id", "/sweatbox/speech/kokoro-v1/worker.mjs"]) {
        assert.match(csp(path), /script-src[^;]+'wasm-unsafe-eval'/);
        assert.match(csp(path), /worker-src 'self'/);
        assert.doesNotMatch(csp(path), /huggingface|jsdelivr|'unsafe-eval'/);
    }
    for (const path of ["/", "/dashboard", "/sweatbox-other"]) assert.doesNotMatch(csp(path), /wasm-unsafe-eval|worker-src/);
});

test("terrain lookup connections are restricted to simulator pages", () => {
    for (const path of ["/sweatbox", "/sweatbox/staff/id", "/sweatbox/mentee/id", "/sweatbox/scenarios/new"]) assert.match(csp(path), /connect-src[^;]+https:\/\/terrain\.infinitehorizon\.app/);
    for (const path of ["/", "/dashboard", "/sweatbox-other", "/pilot-guide"]) assert.doesNotMatch(csp(path), /terrain\.infinitehorizon/);
});

test("YouTube embeds and direct videos are scoped to guide reader and editor", () => {
    for (const path of ["/pilot-guide", "/pilot-guide/", "/dashboard/pilot-guide", "/dashboard/pilot-guide/"]) {
        assert.match(csp(path), /frame-src blob: https:\/\/www\.youtube-nocookie\.com;/);
        assert.match(csp(path), /media-src 'self' (?:blob: )?https:;/);
        assert.doesNotMatch(csp(path), /frame-src[^;]+youtube\.com/);
    }
});
test("other routes retain their original frame and media restrictions", () => {
    for (const path of ["", "/", "/pilot-guide-other", "/pilot-guide/subpage"]) {
        assert.match(csp(path), /frame-src blob:;/);
        assert.doesNotMatch(csp(path), /youtube|media-src/);
    }
    assert.match(csp("/pilot-guide"), /frame-ancestors 'none'/);
    assert.match(csp("/pilot-guide"), /upgrade-insecure-requests/);
});


test("course editor previews and course videos work after dashboard or exams client navigation", () => {
    for (const path of ["/dashboard", "/dashboard/courses/abc/edit", "/exams", "/exams/courses/abc"]) {
        assert.match(csp(path), /img-src 'self' data: https: blob:;/);
        assert.match(csp(path), /media-src 'self' blob: https:;/);
    }
    for (const path of ["/", "/dashboard-other", "/exams-other"]) {
        assert.doesNotMatch(csp(path), /img-src[^;]*blob:|media-src/);
    }
});
