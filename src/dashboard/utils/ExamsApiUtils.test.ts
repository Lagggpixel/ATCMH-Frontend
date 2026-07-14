import test from "node:test";
import assert from "node:assert/strict";
import {ExamsApiUtils, ExamsAuthenticationRequiredError} from "./ExamsApiUtils.ts";

const sessionResponse = () => new Response(JSON.stringify({session: {accountId: "1", discordId: "123", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "exams-csrf", impersonating: false}}), {status: 200, headers: {"Content-Type": "application/json"}});
test.beforeEach(() => ExamsApiUtils.clearSessionCache());
test.afterEach(() => ExamsApiUtils.clearSessionCache());

const withFetch = async (run: (requests: Request[]) => Promise<void>) => {
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) { requests.push(new Request(new URL(String(input), "https://www.atcmh.org"), init)); return sessionResponse(); }
        requests.push(new Request(new URL(String(input), "https://www.atcmh.org"), init));
        return new Response(JSON.stringify({
            actor: {discordId: "mentor-1", canManageAll: false, capabilities: ["manage-exams"]},
            quizzes: [],
        }), {status: 200, headers: {"Content-Type": "application/json"}});
    };

    try {
        ExamsApiUtils.clearSessionCache();
        await run(requests);
    } finally {
        ExamsApiUtils.clearSessionCache();
        globalThis.fetch = originalFetch;
    }
};

test("management reads use the Exams host session without exposing a provider token", async () => {
    await withFetch(async requests => {
        await ExamsApiUtils.getManagementMe("discord-token");
        const quizzes = await ExamsApiUtils.listQuizzes("discord-token");

        assert.equal(requests.length, 2);
        assert.equal(requests[0].url, "https://www.atcmh.org/exams/api/management/me");
        assert.equal(requests[1].url, "https://www.atcmh.org/exams/api/management/quizzes");
        assert.equal(requests[0].headers.get("Authorization"), null);
        assert.equal(requests[0].credentials, "include");
        assert.equal(requests[1].headers.get("Authorization"), null);
        assert.equal(requests[1].credentials, "include");
        assert.deepEqual(quizzes, []);
    });
});

test("category management uses protected category and focused move endpoints", async () => {
    await withFetch(async requests => {
        await ExamsApiUtils.listCategories("admin-token");
        await ExamsApiUtils.createCategory("Mock Exams", "admin-token");
        await ExamsApiUtils.moveQuizCategory("quiz-id", "category-id", "admin-token");
        assert.equal(requests[0].url, "https://www.atcmh.org/exams/api/management/categories");
        assert.equal(requests[1].url, "https://www.atcmh.org/exams/api/auth/session");
        assert.equal(requests[2].method, "POST");
        assert.deepEqual(await requests[2].json(), {name: "Mock Exams"});
        assert.equal(requests[2].headers.get("X-CSRF-Token"), "exams-csrf");
        assert.equal(requests[3].url, "https://www.atcmh.org/exams/api/management/quizzes/quiz-id/category");
        assert.equal(requests[3].method, "PATCH");
        assert.deepEqual(await requests[3].json(), {categoryId: "category-id"});
        assert.equal(requests[3].headers.get("Authorization"), null);
        assert.equal(requests[3].headers.get("X-CSRF-Token"), "exams-csrf");
        assert.equal(requests[3].credentials, "include");
    });
});

test("attempt management reads and deletion use the protected paginated endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        requests.push(request);
        if (request.url.endsWith("/api/auth/session")) return sessionResponse();
        if (request.method === "DELETE") return new Response(null, {status: 204});
        if (request.url.endsWith("/attempt-id")) return new Response(JSON.stringify({
            attempt: {
                id: "attempt-id",
                code: "attempt-code",
                quizId: "quiz-id",
                quizTitle: "Tower basics",
                studentName: "Pilot",
                studentDiscordId: "123456789012345",
                score: 8,
                total: 10,
                percentage: 80,
                submittedAt: "2026-07-12T00:00:00Z",
                status: "submitted",
                submissionReason: "manual",
                review: {available: false},
            },
        }), {status: 200, headers: {"Content-Type": "application/json"}});
        return new Response(JSON.stringify({
            attempts: [{
                id: "attempt-id",
                code: "attempt-code",
                quizId: "quiz-id",
                quizTitle: "Tower basics",
                studentName: "Pilot",
                studentDiscordId: "123456789012345",
                score: 8,
                total: 10,
                percentage: 80,
                submittedAt: "2026-07-12T00:00:00Z",
                status: "submitted",
                submissionReason: "manual",
            }],
            page: 1,
            pageSize: 25,
            total: 1,
        }), {status: 200, headers: {"Content-Type": "application/json"}});
    };

    try {
        ExamsApiUtils.clearSessionCache();
        const page = await ExamsApiUtils.listAttempts(1, 25, "Tower pilot", "discord-token");
        const attempt = await ExamsApiUtils.getAttempt("attempt-id", "discord-token");
        await ExamsApiUtils.deleteAttempt("attempt-id", "discord-token");

        assert.equal(page.attempts.length, 1);
        assert.equal(attempt.review.available, false);
    } finally {
        ExamsApiUtils.clearSessionCache();
        globalThis.fetch = originalFetch;
    }

    const [request, detailRequest, sessionRequest, deleteRequest] = requests;
    assert.equal(request.url, "https://www.atcmh.org/exams/api/management/attempts?page=1&pageSize=25&query=Tower+pilot");
    assert.equal(request.headers.get("Authorization"), null);
    assert.equal(request.credentials, "include");
    assert.equal(detailRequest.url, "https://www.atcmh.org/exams/api/management/attempts/attempt-id");
    assert.equal(detailRequest.headers.get("Authorization"), null);
    assert.equal(sessionRequest.url, "https://www.atcmh.org/exams/api/auth/session");
    assert.equal(deleteRequest.method, "DELETE");
    assert.equal(deleteRequest.url, "https://www.atcmh.org/exams/api/management/attempts/attempt-id");
    assert.equal(deleteRequest.headers.get("Authorization"), null);
    assert.equal(deleteRequest.headers.get("X-CSRF-Token"), "exams-csrf");
    assert.equal(deleteRequest.credentials, "include");
});

test("management reads surface an Exams API failure without retrying through the Dashboard API", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async () => {
        callCount += 1;
        return new Response("Exams service unavailable", {status: 503, statusText: "Service Unavailable"});
    };

    try {
        await assert.rejects(() => ExamsApiUtils.listQuizzes("discord-token"), /503 Service Unavailable/);
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(callCount, 1);
});

test("quiz saves use the protected management create endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) return sessionResponse();
        request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        return new Response(JSON.stringify({quiz: {id: 18, title: "Tower basics"}}), {
            status: 201,
            headers: {"Content-Type": "application/json"},
        });
    };

    try {
        ExamsApiUtils.clearSessionCache();
        await ExamsApiUtils.saveQuiz({
            title: "Tower basics",
            description: "Learn the basics",
            category: "Tower",
            feedbackMode: "after_submission",
            timeLimitSeconds: 900,
            tags: [],
            isPrivate: true,
            randomizeQuestions: false,
            questions: [{prompt: "Who clears a runway?", randomizeOptions: false, options: [{text: "Tower", isCorrect: true}, {text: "Ground", isCorrect: false}]}],
        }, "discord-token");
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.ok(request);
    assert.equal(request.url, "https://www.atcmh.org/exams/api/management/quizzes");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("Authorization"), null);
    assert.equal(request.headers.get("X-CSRF-Token"), "exams-csrf");
    assert.equal(request.credentials, "include");
});

test("website saves surface a mentor denial from the Exams API", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => String(input).endsWith("/api/auth/session") ? sessionResponse() : new Response("Administrator access is required", {
        status: 403,
        statusText: "Forbidden",
    });

    try {
        ExamsApiUtils.clearSessionCache();
        await assert.rejects(
            () => ExamsApiUtils.saveWebsiteContent({home: null, announcements: [], pages: []}, "mentor-token"),
            /403 Forbidden/
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("import preview uploads the selected file with the Exams host session", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) return sessionResponse();
        request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        return new Response(JSON.stringify({
            valid: true,
            errors: [],
            idempotencyKey: "preview-key",
            normalizedImport: {title: "Tower basics"},
        }), {status: 200, headers: {"Content-Type": "application/json"}});
    };

    try {
        ExamsApiUtils.clearSessionCache();
        const preview = await ExamsApiUtils.previewImport(new File(["{}"], "tower.json", {type: "application/json"}), "discord-token");
        assert.equal(preview.valid, true);
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.ok(request);
    assert.equal(request.url, "https://www.atcmh.org/exams/api/management/imports/preview");
    assert.equal(request.headers.get("Authorization"), null);
    assert.equal(request.headers.get("X-CSRF-Token"), "exams-csrf");
    assert.equal(request.credentials, "include");
    assert.match(request.headers.get("Content-Type") ?? "", /^multipart\/form-data; boundary=/);
    const body = await request.formData();
    assert.equal((body.get("file") as File).name, "tower.json");
});

test("import commit sends only a server-previewed payload and idempotency key", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) return sessionResponse();
        request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        return new Response(JSON.stringify({valid: true, errors: [], result: {quizId: "quiz-1"}}), {
            status: 201,
            headers: {"Content-Type": "application/json"},
        });
    };

    try {
        ExamsApiUtils.clearSessionCache();
        await ExamsApiUtils.commitImport({title: "Tower basics"}, "preview-key", "discord-token");
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.ok(request);
    assert.equal(request.url, "https://www.atcmh.org/exams/api/management/imports/commit");
    assert.equal(request.headers.get("Authorization"), null);
    assert.equal(request.headers.get("X-CSRF-Token"), "exams-csrf");
    assert.equal(request.credentials, "include");
    assert.deepEqual(await request.json(), {
        normalizedImport: {title: "Tower basics"},
        idempotencyKey: "preview-key",
    });
});

test("import preview returns server validation errors for display instead of treating them as an API outage", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => String(input).endsWith("/api/auth/session") ? sessionResponse() : new Response(JSON.stringify({
        valid: false,
        errors: [{path: "questions[0].options", message: "exactly one option must be correct"}],
    }), {status: 422, headers: {"Content-Type": "application/json"}});

    try {
        ExamsApiUtils.clearSessionCache();
        const preview = await ExamsApiUtils.previewImport(new File(["{}"], "tower.json", {type: "application/json"}), "discord-token");
        assert.deepEqual(preview.errors, [{path: "questions[0].options", message: "exactly one option must be correct"}]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("import commit returns server validation errors for display instead of treating them as an API outage", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => String(input).endsWith("/api/auth/session") ? sessionResponse() : new Response(JSON.stringify({
        valid: false,
        errors: [{path: "idempotencyKey", message: "preview is invalid, expired, or already used"}],
    }), {status: 422, headers: {"Content-Type": "application/json"}});

    try {
        ExamsApiUtils.clearSessionCache();
        const result = await ExamsApiUtils.commitImport({title: "Tower basics"}, "expired-key", "discord-token");
        assert.deepEqual(result.errors, [{path: "idempotencyKey", message: "preview is invalid, expired, or already used"}]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("quiz unlock reads use the selected quiz management endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) return sessionResponse();
        request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        return new Response(JSON.stringify({unlocks: [{discordId: "123456789012345", userName: "Pilot", unlockedBy: "mentor", unlockedAt: "2026-07-11T00:00:00Z"}]}), {status: 200, headers: {"Content-Type": "application/json"}});
    };
    try {
        const unlocks = await ExamsApiUtils.listQuizUnlocks("quiz-id", "discord-token");
        assert.equal(unlocks[0].discordId, "123456789012345");
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.ok(request);
    assert.equal(request.url, "https://www.atcmh.org/exams/api/management/quizzes/quiz-id/unlocks");
    assert.equal(request.headers.get("Authorization"), null);
    assert.equal(request.headers.get("X-CSRF-Token"), null);
    assert.equal(request.credentials, "include");
});

test("quiz unlock writes send an explicit unlocked state", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) return sessionResponse();
        request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        return new Response(JSON.stringify({unlock: {quizId: "quiz-id", discordId: "123456789012345", userName: "Pilot", unlocked: true}}), {status: 200, headers: {"Content-Type": "application/json"}});
    };
    let result;
    try {
        result = await ExamsApiUtils.updateQuizUnlock("quiz-id", {discordId: "123456789012345", userName: "Pilot", unlocked: true}, "discord-token");
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.ok(request);
    assert.equal(request.url, "https://www.atcmh.org/exams/api/management/quizzes/quiz-id/unlocks");
    assert.equal(request.method, "PUT");
    assert.equal(request.headers.get("Authorization"), null);
    assert.equal(request.headers.get("X-CSRF-Token"), "exams-csrf");
    assert.equal(request.credentials, "include");
    assert.deepEqual(await request.json(), {discordId: "123456789012345", userName: "Pilot", unlocked: true});
    assert.deepEqual(result, {quizId: "quiz-id", discordId: "123456789012345", userName: "Pilot", unlocked: true});
});

test("mutations fail with a controlled auth error when the Exams session is absent", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({session: null}), {status: 200, headers: {"Content-Type": "application/json"}});
    try {
        await assert.rejects(() => ExamsApiUtils.createCategory("Tower", "unused"), ExamsAuthenticationRequiredError);
    } finally { globalThis.fetch = originalFetch; }
});

test("a mutation clears, re-bootstraps, and retries once after auth loss", async () => {
    const originalFetch = globalThis.fetch;
    const csrfHeaders: Array<string | null> = [];
    let sessionLoads = 0;
    let mutationCalls = 0;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/auth/session")) {
            sessionLoads += 1;
            return new Response(JSON.stringify({session: {accountId: "1", discordId: "123", expiresAt: "2026-07-14T00:00:00Z", csrfToken: sessionLoads === 1 ? "old-csrf" : "new-csrf", impersonating: false}}), {status: 200, headers: {"Content-Type": "application/json"}});
        }
        mutationCalls += 1;
        const request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
        csrfHeaders.push(request.headers.get("X-CSRF-Token"));
        if (mutationCalls === 1) return new Response(null, {status: 401});
        return new Response(JSON.stringify({category: {id: "tower", name: "Tower"}}), {status: 200, headers: {"Content-Type": "application/json"}});
    };
    try {
        await ExamsApiUtils.createCategory("Tower", "unused");
    } finally { globalThis.fetch = originalFetch; }
    assert.equal(sessionLoads, 2);
    assert.deepEqual(csrfHeaders, ["old-csrf", "new-csrf"]);
});
