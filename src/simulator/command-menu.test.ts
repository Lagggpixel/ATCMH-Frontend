import assert from "node:assert/strict";
import test from "node:test";
import {instructionText, messageMenu, REMARKS, type MenuEntry} from "./catalog";
import {applyEnvelope, initialExercise, newAircraft} from "./engine";
import {currentAtisOptions} from "./atis-options";

const find = (entries: MenuEntry[], ...labels: string[]): MenuEntry => {
  const entry = entries.find(item => item.label === labels[0]);
  assert.ok(entry, `Missing menu entry: ${labels[0]}`);
  return labels.length > 1 ? find(entry.children ?? [], ...labels.slice(1)) : entry;
};

test("restored Ground menu keeps distinct runway, parking, hold and pushback instructions", () => {
  const a = newAircraft("ground", false), entries = messageMenu("ground", a);
  const taxi = find(entries, "Taxi to...", "Runway 06", "Send").instruction!;
  assert.deepEqual(taxi, {type: "taxi", runway: "06", contactTowerWhenReady: true});
  assert.equal(instructionText(a, taxi), "Easy 571, taxi to runway 06, contact tower when ready");
  for (const runway of find(entries, "Taxi to...").children!.filter(entry => entry.label.startsWith("Runway "))) {
    assert.deepEqual(runway.children?.map(entry => entry.label), ["Send"]);
    assert.equal(find(runway.children!, "Send").instruction?.type, "taxi");
  }
  const taxi24 = find(entries, "Taxi to...", "Runway 24", "Send").instruction!;
  assert.deepEqual(taxi24, {type: "taxi", runway: "24", contactTowerWhenReady: true});
  assert.equal(instructionText(a, taxi24), "Easy 571, taxi to runway 24, contact tower when ready");
  assert.ok(!find(entries, "Contact Other Frequency").children?.some(entry => entry.label.includes("when ready")));
  assert.match(instructionText(a, find(entries, "Taxi to...", "Parking").instruction!), /taxi to Parking/);
  assert.match(instructionText(a, find(entries, "Continue Taxi").instruction!), /continue taxi/);
  assert.deepEqual(find(entries, "Pushback Approved", "Tail to the West").instruction, {type: "pushback", tail: "west"});
  assert.equal(find(entries, "Hold Position").instruction?.type, "stop");
  assert.match(find(entries, "Progressive Taxi").note!, /Not simulated/);
  assert.deepEqual(messageMenu("atis", a), []);
});

test("Tower restores landing, option, pattern turn and departure choices with executable parameters", () => {
  const a = newAircraft("air", true), entries = messageMenu("tower", a);
  assert.deepEqual(find(entries, "Cleared to Land / for the Option", "Number 2", "Cleared for the Option", "Runway 24", "Make Left Traffic").instruction,
    {type: "land", runway: "24", number: 2, option: true, hand: "left"});
  const turn = find(entries, "Pattern Instructions", "Turn base");
  assert.equal(instructionText(a, turn.instruction!, [turn]), "Speedbird 124, turn base");
  assert.deepEqual(find(entries, "Go Around", "Make Right Traffic").instruction, {type: "go-around", hand: "right"});
  assert.deepEqual(find(messageMenu("tower", newAircraft("ground", false)), "Cleared for Takeoff", "Runway 06", "Make Left Traffic").instruction,
    {type: "takeoff", runway: "06", hand: "left"});
});

test("Exit runway appears only for aircraft on the ground, including before and after takeoff", () => {
  const ground = newAircraft("exit", false), elevation = ground.altitude;
  for (const mode of ["pattern", "heading", "go-around", "takeoff"] as const) {
    const entries = messageMenu("tower", {...ground, mode, frequency: "tower", altitude: elevation + 50});
    assert.ok(!entries.some(entry => entry.label === "Exit runway"), mode);
    assert.ok(!find(entries, "Misc. Messages").children!.some(entry => entry.label === "Exit Runway"), `${mode} misc`);
  }
  for (const mode of ["parked", "pushback", "taxi", "lineup", "takeoff", "rollout"] as const) {
    const entries = messageMenu("tower", {...ground, mode, frequency: "tower"});
    assert.deepEqual(find(entries, "Exit runway", "Left", "Send").instruction, {type: "exit-runway", side: "left"});
    assert.ok(find(entries, "Misc. Messages").children!.some(entry => entry.label === "Exit Runway"), `${mode} misc`);
  }
});

test("Give way sends from the direction or runway choice and guesses only matching traffic", () => {
  const source = {...newAircraft("source", false), heading: 90, position: {x: 0, y: 0}};
  const exiting = {...newAircraft("exiting", false), mode: "rollout" as const, runway: "24" as const, position: {x: .1, y: 0}};
  const right = {...newAircraft("right", false), mode: "taxi" as const, position: {x: 0, y: -.1}};
  const entries = messageMenu("ground", source, [source, exiting, right]);
  assert.deepEqual(find(entries, "Give way to...", "Aircraft exiting runway", "Runway 24").instruction, {type: "give-way", aircraftId: exiting.id, description: "aircraft exiting runway 24"});
  assert.deepEqual(find(entries, "Give way to...", "Aircraft on your right").instruction, {type: "give-way", aircraftId: right.id, description: "aircraft on your right"});
  assert.deepEqual(find(messageMenu("ground", source, [source]), "Give way to...", "Aircraft ahead").instruction, {type: "give-way", aircraftId: undefined, description: "aircraft ahead"});
});

test("ATIS adapts selected legacy options without mutating archived source data", () => {
  const state = initialExercise();
  state.atis.remarks = ["No circuit training", "Hold at stand", "Separate ground and tower frequencies", "Custom restriction"];
  state.atis.notams = ["Training event", "EVENT", "Simulated low visibility", "LOW VISIBILITY", "Custom notice"];
  const before = JSON.stringify(state);
  const draft = currentAtisOptions(state.atis);
  assert.deepEqual(REMARKS, ["No Pattern Work", "Gate Hold", "Flight plan required"]);
  assert.deepEqual(draft.remarks, ["No Pattern Work", "Gate Hold", "Custom restriction"]);
  assert.deepEqual(draft.notams, ["Low Visibility", "Custom notice"]);
  assert.equal(JSON.stringify(state), before);
  const published = applyEnvelope(state, {id: "publish", time: 1, action: {kind: "publish-atis"}}).state;
  assert.deepEqual(published.atis, draft); assert.deepEqual(published.publishedDraft, draft);
  assert.match(published.publishedAtis, /No Pattern Work.*Gate Hold.*Low Visibility/);
  assert.doesNotMatch(published.publishedAtis, /Training event|EVENT|Separate ground|Simulated low/);
  assert.equal(JSON.stringify(state), before);
});
