import assert from "node:assert/strict";
import test from "node:test";
import {getExamStatistics, histogramMedian} from "./exam-statistics";
import {setPoolForTests} from "./db";
import {parseStatisticsWindow} from "./statistics-window";

test("histogram median weights attempts, handles ties and has no fabricated empty score", () => {
    assert.equal(histogramMedian([]), null);
    assert.equal(histogramMedian([{percentage: 100, amount: 1}, {percentage: 20, amount: 3}]), 20);
    assert.equal(histogramMedian([{percentage: 0, amount: 1}, {percentage: 100, amount: 1}]), 50);
});
test("exam summary uses global distinct identities, weighted scores, half-open windows and separate undated counts", async () => {
    const calls: Array<{sql: string; values: readonly unknown[]}> = [];
    setPoolForTests({execute: async (sql: string, values: readonly unknown[] = []) => {
        calls.push({sql, values});
        if (sql.includes("submitted_at IS NULL")) return [[{amount: 4}]];
        if (sql.includes("GROUP BY quiz_id, percentage")) return [[{quiz_id: "a", percentage: 40, amount: 3}, {quiz_id: "b", percentage: 100, amount: 1}]];
        return [[{quiz_id: "a", title: "Ground", attempts: 3, identified: 1, unidentified: 1, timed_out: 1},
            {quiz_id: "b", title: "Tower", attempts: 1, identified: 1, unidentified: 0, timed_out: 0},
            {quiz_id: null, title: "Tower", attempts: 4, identified: 1, unidentified: 1, timed_out: 1}]];
    }} as never);
    try {
        const result = await getExamStatistics(parseStatisticsWindow(new URLSearchParams(), new Date("2026-09-30T12:00:00Z")));
        assert.equal(result.current.identifiedLearners, 1); // Same learner took both quizzes.
        assert.equal(result.current.medianScore, 40); assert.equal(result.current.timeoutRate, 25);
        assert.equal(result.current.unidentifiedAttempts, 1); assert.equal(result.undatedAttempts, 4);
        assert.equal(result.quizzes[0].medianScore, 40); assert.equal(result.previous?.attempts, 4);
        assert.equal(calls.length, 5);
        const statement = calls.find(call => call.sql.includes("WITH ROLLUP"))!;
        assert.match(statement.sql, /COUNT\(DISTINCT learner_id\)/);
        assert.match(statement.sql, /student_name REGEXP/); assert.match(statement.sql, /student_discord_id REGEXP/);
        assert.match(statement.sql, /submitted_at >= \? AND submitted_at < \?/);
        assert.deepEqual(statement.values, ["2026-08-31 12:00:00.000", "2026-09-30 12:00:00.000"]);
    } finally { setPoolForTests(undefined); }
});
test("all-time reporting has no previous period and empty ratios are unavailable", async () => {
    setPoolForTests({execute: async () => [[]]} as never);
    try {
        const result = await getExamStatistics(parseStatisticsWindow(new URLSearchParams("range=all"), new Date("2026-09-30T12:00:00Z")));
        assert.equal(result.previous, null); assert.equal(result.current.attempts, 0);
        assert.equal(result.current.medianScore, null); assert.equal(result.current.timeoutRate, null);
    } finally { setPoolForTests(undefined); }
});
