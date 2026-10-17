import assert from "node:assert/strict";
import test from "node:test";
import {placeTourCard, shouldStartTutorial, tutorialKey, tutorialPreference} from "./tutorial";

test("first visit, skipping and completion persist per account and survive remounts", () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {configurable: true, value: {localStorage: {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)}}});
  try {
    assert.equal(tutorialPreference("staff-a").read(), null);
    tutorialPreference("staff-a").write("skipped");
    assert.equal(tutorialPreference("staff-a").read(), "skipped");
    assert.equal(tutorialPreference("staff-b").read(), null);
    tutorialPreference("staff-a").write("radar");
    assert.equal(tutorialPreference("staff-a").read(), "radar");
    tutorialPreference("staff-a").write("completed");
    assert.equal(tutorialPreference("staff-a").read(), "completed");
    values.set(tutorialKey("staff-b"), "invalid");
    assert.equal(tutorialPreference("staff-b").read(), null);
    assert.equal(values.size, 2);
  } finally {if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");}
});

test("Sessions hands off to the radar once, while skipped and finished tours stay dismissed", () => {
  assert.equal(shouldStartTutorial(null, false), true);
  assert.equal(shouldStartTutorial(null, true), true);
  assert.equal(shouldStartTutorial("radar", false), false);
  assert.equal(shouldStartTutorial("radar", true), true);
  for (const outcome of ["completed", "skipped"] as const) for (const live of [true, false]) assert.equal(shouldStartTutorial(outcome, live), false);
});

test("coach marks prefer the side of a target and stay inside phone and short viewports", () => {
  const position = placeTourCard({left: 20, top: 80, width: 200, height: 400}, {width: 1440, height: 1000}, {width: 350, height: 300});
  assert.equal(position.left, 236); assert.equal(position.top, 80);
  for (const viewport of [{width: 390, height: 844}, {width: 1024, height: 360}]) {
    const card = {width: 320, height: Math.min(300, viewport.height - 24)};
    for (const target of [null, {left: -50, top: -100, width: 1200, height: 1000}]) {
      const result = placeTourCard(target, viewport, card);
      assert.ok(result.left >= 12 && result.top >= 12);
      assert.ok(result.left + card.width <= viewport.width - 12);
      assert.ok(result.top + card.height <= viewport.height - 12);
    }
  }
});

test("unavailable browser storage never prevents opening or dismissing the tutorial", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {configurable: true, value: {get localStorage() {throw new Error("Storage blocked");}}});
  try {
    assert.equal(tutorialPreference("staff-a").read(), null);
    assert.doesNotThrow(() => tutorialPreference("staff-a").write("skipped"));
    assert.doesNotThrow(() => tutorialPreference("staff-a").write("completed"));
  } finally {if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");}
});
