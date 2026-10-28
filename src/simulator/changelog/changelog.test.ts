import assert from "node:assert/strict";
import test from "node:test";
import {CHANGELOG, changelogDate, changelogKey, changelogPreference, londonDay, unreadChangelog, visibleChangelog, type ChangelogDay} from "./changelog";

const update = {title: "A training improvement", description: "A clearer training workflow."};
const days: readonly ChangelogDay[] = [
  {date: "2026-10-20", updates: [update]}, {date: "2026-10-21", updates: [update]},
  {date: "2026-10-23", updates: [update]}, {date: "2026-10-22", updates: []},
];
const storage = () => {
  const values = new Map<string, string>();
  return {values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
};

test("daily feed orders real updates newest first, hiding empty and future days", () => {
  const current = visibleChangelog("2026-10-21", days);
  assert.deepEqual(current.map(day => day.date), ["2026-10-21", "2026-10-20"]);
  assert.deepEqual(visibleChangelog("2026-10-22", days), current, "a calendar day without changes adds nothing");
  assert.equal(visibleChangelog("2026-10-23", days)[0].date, "2026-10-23");
  assert.deepEqual(visibleChangelog("2026-10-19", days), []);
  assert.equal(days[0].date, "2026-10-20", "display sorting does not mutate the content source");
});
test("the changelog uses London days across summer, winter and the DST boundary", () => {
  assert.equal(londonDay(new Date("2026-10-21T23:30:00Z")), "2026-10-22");
  assert.equal(londonDay(new Date("2026-10-25T23:30:00Z")), "2026-10-25");
  assert.equal(londonDay(new Date("2026-12-01T00:01:00Z")), "2026-12-01");
  assert.equal(changelogDate("2026-10-21", "weekday"), "Wed");
  assert.equal(changelogDate("2026-10-21", "date"), "21 Oct 2026");
});
test("first visit offers the list, then only a newer changelog day can offer it again", () => {
  const current = visibleChangelog("2026-10-21", days);
  assert.deepEqual(unreadChangelog(current), current);
  assert.deepEqual(unreadChangelog(current, "2026-10-20").map(day => day.date), ["2026-10-21"]);
  assert.deepEqual(unreadChangelog(current, "2026-10-21"), []);
  assert.deepEqual(unreadChangelog(visibleChangelog("2026-10-22", days), "2026-10-21"), []);
  assert.deepEqual(unreadChangelog([{date: "2026-10-21", updates: [update, update]}], "2026-10-21"), [], "same-day edits do not repeatedly interrupt a mentor");
  assert.equal(unreadChangelog(visibleChangelog("2026-10-23", days), "2026-10-21")[0].date, "2026-10-23");
  assert.deepEqual(unreadChangelog(current, "2026-10-23"), [], "an older deployed bundle cannot replay an already seen day");
});
test("seen days survive remounts, remain isolated by mentor and never move backwards", () => {
  const saved = storage(), first = changelogPreference("mentor-persistence-a", saved);
  assert.equal(first.read(), undefined);
  first.write("2026-10-21");
  assert.equal(changelogPreference("mentor-persistence-a", saved).read(), "2026-10-21");
  assert.equal(changelogPreference("mentor-persistence-b", saved).read(), undefined);
  first.write("2026-10-20");
  assert.equal(saved.values.get(changelogKey("mentor-persistence-a")), "2026-10-21");
  // Another tab can have persisted a newer value before this tab acknowledges an older dialog.
  saved.setItem(changelogKey("mentor-persistence-a"), "2026-10-23");
  first.write("2026-10-22");
  assert.equal(first.read(), "2026-10-23");
});
test("malformed saved dates and entries do not throw or suppress real updates", () => {
  for (const [index, value] of ["invalid", "2026-99-99", "2026-02-30", "2026-1-1", '{"date":"2026-10-21"}'].entries()) {
    const saved = storage(), id = `mentor-invalid-${index}`;
    saved.setItem(changelogKey(id), value);
    const preference = changelogPreference(id, saved);
    assert.equal(preference.read(), undefined);
    preference.write(value);
    assert.deepEqual(unreadChangelog(visibleChangelog("2026-10-21", days), value), visibleChangelog("2026-10-21", days));
    assert.deepEqual(visibleChangelog("2026-10-21", [{date: value, updates: [update]}]), []);
    preference.write("2026-10-21");
    assert.equal(preference.read(), "2026-10-21");
  }
});
test("blocked browser storage still remembers the presented day for this tab", () => {
  const unavailable = {getItem(): never {throw new Error("Storage blocked");}, setItem(): never {throw new Error("Storage blocked");}};
  const preference = changelogPreference("mentor-blocked-storage", unavailable);
  assert.equal(preference.read(), undefined);
  preference.write("2026-10-21");
  assert.equal(changelogPreference("mentor-blocked-storage", unavailable).read(), "2026-10-21");
  assert.deepEqual(unreadChangelog(visibleChangelog("2026-10-21", days), preference.read()), []);
});
test("checked-in daily notes have unique valid dates and readable user-facing content", () => {
  assert.equal(new Set(CHANGELOG.map(day => day.date)).size, CHANGELOG.length);
  assert.equal(visibleChangelog("9999-12-31").length, CHANGELOG.length);
  for (const day of CHANGELOG) {
    assert.ok(day.updates.length > 0);
    for (const entry of day.updates) {assert.ok(entry.title.trim()); assert.ok(entry.description.trim());}
  }
});
test("the mentor changelog uses ATCMH role wording", () => {
  for (const entry of CHANGELOG.flatMap(day => day.updates)) assert.doesNotMatch(`${entry.title} ${entry.description}`, /\btrainers?\b|\btrainees?\b/i, entry.title);
});
