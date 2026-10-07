import assert from "node:assert/strict";
import test from "node:test";
import {wrapPreview} from "./wraps-preview";
import {wrapStoryStats} from "./wraps-story";

test("highlights retain separate annual and August totals from the overview data", () => {
    const data = structuredClone(wrapPreview);
    data.year.attendance.attended = 71;
    data.august.attendance.attended = 9;
    const stats = wrapStoryStats(data, "member");
    assert.deepEqual(stats.filter(stat => stat.label === "Recorded attendances").map(stat => [stat.period, stat.value]), [["2026 · Year to date", 71], ["August 2026", 9]]);
    assert.ok(stats.every(stat => !stat.label.includes("exam") && !stat.label.includes("Mentees")));
});

test("mentor highlights include personal participation as well as hosted activity", () => {
    const stats = wrapStoryStats(wrapPreview, "mentor");
    for (const period of ["2026 · Year to date", "August 2026"]) {
        const labels = stats.filter(stat => stat.period === period).map(stat => stat.label);
        for (const label of ["Sessions delivered", "Mentees supported", "Mentees passed", "Mock exams conducted", "Recorded attendances", "Sessions joined", "Sign-ups cancelled"]) assert.ok(labels.includes(label), `${period}: missing ${label}`);
    }
});

test("mentee highlights use recorded exam outcomes and omit a pass without an achievement", () => {
    const data = structuredClone(wrapPreview);
    data.year.exams = [{name: "Written exam", attempts: 1, passed: false}];
    data.year.menteeJourney = [];
    const stats = wrapStoryStats(data, "mentee").filter(stat => stat.period.startsWith("2026"));
    assert.equal(stats.find(stat => stat.label === "Written exam attempt")?.value, 1);
    assert.ok(!stats.find(stat => stat.label === "Written exam attempt")?.description.includes("passed"));
    assert.ok(!stats.find(stat => stat.label === "Mentorship passed"));
});
