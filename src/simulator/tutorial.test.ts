import assert from "node:assert/strict";
import test from "node:test";
import {
  TRACKS, WHATS_NEW, emptyProgress, endTour, findTargets, finishTrack, goToStep, numberIn, placeTourCard, readProgress, startTrack, suggestedTrack, trackById,
  type TourNode,
} from "./tutorial";

const root = (nodes: Record<string, (TourNode & {usable?: boolean})[]>) => ({querySelectorAll: (selector: string) => nodes[selector] ?? []});

test("stored progress is read safely and the old single tour carries over", () => {
  assert.deepEqual(readProgress(null, null), emptyProgress());
  assert.deepEqual(readProgress(null, "completed").done, ["start-share", "run-radar"]);
  assert.deepEqual(readProgress(null, "radar").active, {track: "run-radar", step: 0});
  assert.equal(readProgress(null, "skipped").welcomed, true);
  assert.deepEqual(readProgress("{broken", null), emptyProgress());
  const stored = readProgress(JSON.stringify({done: ["taxi", "nope"], welcomed: true, active: {track: "full-stop", step: 9}, queue: ["nope", "add-aircraft"]}), "completed");
  assert.deepEqual(stored.done, ["taxi"]);
  assert.deepEqual(stored.active, {track: "full-stop", step: 1, minimised: false});
  assert.deepEqual(stored.queue, ["add-aircraft"]);
});

test("Only what is new runs the four new tracks in order", () => {
  let progress = startTrack(emptyProgress(), WHATS_NEW[0], WHATS_NEW);
  const seen: string[] = [];
  while (progress.active) {seen.push(progress.active.track); progress = finishTrack(progress);}
  assert.deepEqual(seen, [...WHATS_NEW]);
  assert.deepEqual(progress.done, [...WHATS_NEW]);
  assert.equal(progress.welcomed, true);
});

test("steps stay in range and ending a tour clears the queue", () => {
  const progress = startTrack(emptyProgress(), "taxi", ["full-stop"]);
  assert.equal(goToStep(progress, 99).active?.step, trackById("taxi").steps.length - 1);
  assert.equal(goToStep(progress, -1).active?.step, 0);
  assert.deepEqual(endTour(progress), {...progress, active: null, queue: []});
});

test("the suggested track is the one in progress, then the first not done", () => {
  assert.equal(suggestedTrack(emptyProgress(), ["home", "radar"]), "start-share");
  assert.equal(suggestedTrack({...emptyProgress(), done: ["start-share", "run-radar"]}, ["home", "radar"]), "taxi");
  assert.equal(suggestedTrack(startTrack(emptyProgress(), "full-stop"), ["home", "radar"]), "full-stop");
  assert.equal(suggestedTrack(startTrack(emptyProgress(), "start-share"), ["radar"]), "run-radar");
});

test("targets match by selector, visible text and usability", () => {
  const plan = {textContent: " Plan on scope ", usable: true}, other = {textContent: "Start Taxi", usable: true}, hidden = {textContent: "Plan on scope", usable: false};
  const page = root({button: [other, hidden, plan], '[data-simulator-tour="traffic"]': [{textContent: "Aircraft 3"}]});
  assert.deepEqual(findTargets(page, {selector: "button", text: ["Plan on scope"]}, node => (node as {usable?: boolean}).usable !== false), [plan]);
  assert.equal(findTargets(page, {tour: "traffic"}).length, 1);
  assert.equal(numberIn("Aircraft 12"), 12);
  assert.equal(numberIn("Aircraft"), null);
});

test("every track uses Mentor/Mentee wording and actionable steps have something to act on", () => {
  for (const track of TRACKS) for (const step of track.steps) {
    const copy = `${step.title} ${step.text} ${step.hint ?? ""} ${step.task ?? ""}`;
    assert.doesNotMatch(copy, /trainer|trainee|\bmentor\b|\bmentee\b/, `${track.id}: ${step.title}`);
    for (const check of step.done ?? []) if (check.kind === "event" && !check.target) assert.ok(step.target, `${track.id}: ${step.title} needs a target`);
    if (step.done) assert.ok(step.task, `${track.id}: ${step.title} needs a task label`);
  }
});

test("the guide card stays beside its target and inside the viewport", () => {
  assert.deepEqual(placeTourCard({left: 100, top: 100, width: 200, height: 40}, {width: 1440, height: 900}, {width: 360, height: 300}), {left: 316, top: 100});
  assert.deepEqual(placeTourCard({left: 1100, top: 100, width: 300, height: 40}, {width: 1440, height: 900}, {width: 360, height: 300}), {left: 724, top: 100});
  assert.deepEqual(placeTourCard(null, {width: 1440, height: 900}, {width: 360, height: 300}), {left: 1068, top: 588});
});
