import assert from "node:assert/strict";
import test from "node:test";
import {comparisonText, statisticsQuery, fetchStatistics} from "./StatisticsUtils";
import {parseStatisticsWindow} from "../../lib/statistics-window";

const now = new Date("2026-09-30T12:00:00Z");
test("30 and 90 day presets create equal-duration UTC comparison windows", () => {
    for (const range of ["30", "90"] as const) {
        const query = statisticsQuery(range, now);
        const window = parseStatisticsWindow(query, now);
        assert.equal(Date.parse(window.to) - Date.parse(window.from!), Number(range) * 86_400_000);
        assert.equal(Date.parse(window.from!) - Date.parse(window.previousFrom!), Number(range) * 86_400_000);
    }
    assert.equal(parseStatisticsWindow(statisticsQuery("all", now), now).previousFrom, null);
});
test("custom ranges include the end date, cap today at now, and reject invalid dates", () => {
    assert.equal(statisticsQuery("custom", now, "2026-09-01", "2026-09-29").get("to"), "2026-09-30T00:00:00.000Z");
    assert.equal(statisticsQuery("custom", now, "2026-09-30", "2026-09-30").get("to"), now.toISOString());
    for (const [start, end] of [["2026-09-31", "2026-09-31"], ["", "2026-09-30"], ["2026-10-01", "2026-10-02"], ["2026-09-30", "2026-09-29"]]) {
        assert.throws(() => statisticsQuery("custom", now, start, end));
    }
});
test("server rejects reversed, non-UTC and future reporting boundaries", () => {
    for (const query of ["from=2026-09-30T12:00:00Z", "from=2026-02-30T00:00:00Z", "to=2026-10-01T00:00:00Z", "range=all&from=2026-09-01T00:00:00Z", "range=90", "from=2026-09-01T00:00:00%2B00:00"]) {
        assert.throws(() => parseStatisticsWindow(new URLSearchParams(query), now));
    }
});
test("comparisons distinguish zero, missing data, count changes and percentage points", () => {
    assert.equal(comparisonText(125, 100, true), "+25 pp vs previous period");
    assert.equal(comparisonText(3, 0), "+3 vs previous period");
    assert.equal(comparisonText(0, 0), "No change vs previous period");
    assert.equal(comparisonText(null, 0), "Comparison unavailable");
});
test("report fetches are independent and failures give a usable retry message", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async input => String(input).includes("exam") ? new Response("unavailable", {status: 503}) : Response.json({passes: 2});
    try {
        const [programme, exams] = await Promise.allSettled([fetchStatistics("/programme"), fetchStatistics("/exam")]);
        assert.equal(programme.status, "fulfilled"); assert.equal(exams.status, "rejected");
        if (exams.status === "rejected") assert.match(exams.reason.message, /Try again/);
    } finally { globalThis.fetch = original; }
});
