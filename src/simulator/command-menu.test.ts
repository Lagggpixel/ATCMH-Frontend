import assert from "node:assert/strict";
import test from "node:test";
import {instructionText, messageMenu, requestMessageMenu, REMARKS, type MenuEntry} from "./catalog";
import {applyEnvelope, initialExercise, newAircraft} from "./engine";
import {currentAtisOptions} from "./atis-options";

const find = (entries: MenuEntry[], ...labels: string[]): MenuEntry => {
  const entry = entries.find(item => item.label === labels[0]);
  assert.ok(entry, `Missing menu entry: ${labels[0]}`);
  return labels.length > 1 ? find(entry.children ?? [], ...labels.slice(1)) : entry;
};

test("restored Ground menu keeps distinct runway, parking, hold and pushback instructions", () => {
  const a = newAircraft("ground", false), entries = messageMenu("ground", a);
  const taxi = find(entries, "Taxi to...", "Runway 06").instruction!;
  assert.deepEqual(taxi, {type: "taxi", runway: "06", contactTowerWhenReady: true});
  assert.equal(instructionText(a, taxi), "Easy 571, taxi to runway 06, contact tower when ready");
  assert.equal(find(entries, "Taxi to...", "Runway 06").children, undefined);
  assert.ok(!find(entries, "Contact Other Frequency").children?.some(entry => entry.label.includes("when ready")));
  assert.match(instructionText(a, find(entries, "Taxi to...", "Parking").instruction!), /taxi to parking/);
  assert.match(instructionText(a, find(entries, "Continue Taxi").instruction!), /continue taxi/);
  assert.deepEqual(find(entries, "Pushback Approved", "Tail to the West").instruction, {type: "pushback", tail: "west"});
  assert.equal(find(entries, "Hold Position").instruction?.type, "stop");
  assert.equal(find(entries, "Progressive Taxi", "Turn left next taxiway").instruction?.type, "atc");
  assert.deepEqual(messageMenu("atis", a), []);
});

test("Tower restores landing, option, pattern turn and departure choices with executable parameters", () => {
  const a = newAircraft("air", true), entries = messageMenu("tower", a);
  assert.deepEqual(find(entries, "Cleared to Land / for the Option", "Number 2", "Cleared for the Option", "Runway 24", "Make Left Traffic", "Send").instruction,
    {type: "land", runway: "24", number: 2, option: true, hand: "left"});
  const turn = find(entries, "Pattern Instructions", "Turn base");
  assert.equal(instructionText(a, turn.instruction!, [turn]), "Speedbird 124, turn base");
  assert.deepEqual(find(entries, "Go Around", "Make Right Traffic", "Runway 24").instruction, {type: "go-around", hand: "right", runway: "24"});
  assert.deepEqual(find(messageMenu("tower", {...newAircraft("ground", false), requestedPatternDeparture: true}), "Cleared for Takeoff", "Runway 06", "Make Left Traffic", "Send").instruction,
    {type: "takeoff", runway: "06", hand: "left"});
});

test("option requests retain traffic choices for either landing intention and every variant requires Send", () => {
  for (const landing of ["touch-and-go", "full-stop"] as const) for (const read of [false, true]) {
    let state = initialExercise();
    const id = state.aircraft[0].id;
    const apply = (action: import("./model").Action) => {
      const result = applyEnvelope(state, {id: `option-${state.revision}`, time: 1, action});
      assert.equal(result.error, undefined); state = result.state;
    };
    apply({kind: "pilot", aircraftId: id, text: "", request: {id: "inbound-option", runway: "24"}});
    apply({kind: "edit", aircraftId: id, patch: {landing}});
    const request = state.messages.findLast(m => m.aircraftId === id && m.request?.id === "inbound-option")!;
    if (read) apply({kind: "read", aircraftId: id, frequency: "tower"});
    const aircraft = state.aircraft.find(a => a.id === id)!;
    const before = JSON.stringify(state);
    const entries = requestMessageMenu("tower", aircraft, request, state.aircraft, state.messages);
    for (const number of [1, 2, 8]) {
      const clearance = find(entries, "Cleared to Land / for the Option", `Number ${number}`, "Cleared for the Option");
      assert.equal(clearance.instruction, undefined);
      for (const runway of clearance.children!) {
        assert.equal(runway.instruction, undefined, "selecting a runway must not send");
        assert.deepEqual(runway.children!.map(e => e.label), ["Send", "Make Right Traffic", "Make Left Traffic"]);
        const base = {type: "land", runway: runway.label.replace("Runway ", ""), number, option: true};
        assert.deepEqual(find(runway.children!, "Send").instruction, base);
        for (const hand of ["right", "left"] as const) {
          const traffic = find(runway.children!, `Make ${hand === "left" ? "Left" : "Right"} Traffic`);
          assert.equal(traffic.instruction, undefined, "selecting traffic must not send");
          assert.deepEqual(traffic.children!.map(e => e.label), ["Send"]);
          const instruction = find(traffic.children!, "Send").instruction!;
          assert.deepEqual(instruction, {...base, hand});
          assert.match(instructionText(aircraft, instruction), new RegExp(`cleared for the option, after the option, make ${hand} traffic$`));
        }
      }
    }
    assert.equal(JSON.stringify(state), before, "reviewing choices must not transmit or clear the aircraft");
    const command = find(entries, "Cleared to Land / for the Option", "Number 2", "Cleared for the Option", "Runway 24", "Make Right Traffic", "Send").instruction!;
    apply({kind: "command", aircraftId: id, command, frequency: "tower", replyTo: request.id});
    assert.deepEqual(state.messages.findLast(m => m.sender === "controller")!.instruction, command);
    assert.equal(state.messages.filter(m => m.sender === "controller" && m.instruction?.type === "land").length, 1);
  }
});

test("takeoff traffic directions require the pilot's pattern request and reset on leaving the frequency", () => {
  let state = initialExercise(); state.aircraft[1].frequency = "tower";
  const choices = () => find(messageMenu("tower", state.aircraft[1], state.aircraft, undefined, state.messages), "Cleared for Takeoff", "Runway 24").children!.map(e => e.label);
  assert.ok(!choices().includes("Make Left Traffic"));
  const apply = (action: import("./model").Action) => {const r = applyEnvelope(state, {id: `pattern-request-${state.revision}`, time: 1, action}); assert.equal(r.error, undefined); state = r.state;};
  apply({kind: "pilot", aircraftId: state.aircraft[1].id, text: "", request: {id: "departure", runway: "24", remainingInPattern: true}});
  assert.ok(choices().includes("Make Left Traffic")); assert.ok(choices().includes("Make Right Traffic"));
  apply({kind: "read", aircraftId: state.aircraft[1].id, frequency: "tower"}); assert.ok(choices().includes("Make Left Traffic"));
  apply({kind: "edit", aircraftId: state.aircraft[1].id, patch: {frequency: "ground"}});
  apply({kind: "edit", aircraftId: state.aircraft[1].id, patch: {frequency: "tower"}});
  assert.ok(!choices().includes("Make Left Traffic"));
  apply({kind: "pilot", aircraftId: state.aircraft[1].id, text: "", request: {id: "departure", runway: "24", remainingInPattern: false}});
  assert.ok(!choices().includes("Make Right Traffic"));
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
  assert.equal(REMARKS.length, 10);
  assert.deepEqual(draft.remarks, ["No pattern work", "Gate Hold", "Mult. Freq. In Use", "Custom restriction"]);
  assert.deepEqual(draft.notams, ["Event", "Low visibility", "Custom notice"]);
  assert.equal(JSON.stringify(state), before);
  const published = applyEnvelope(state, {id: "publish", time: 1, action: {kind: "publish-atis"}}).state;
  assert.deepEqual(published.atis, draft); assert.deepEqual(published.publishedDraft, draft);
  assert.match(published.publishedAtis, /no pattern work.*gate hold in effect.*multiple frequencies in use.*Notams, event in progress.*low visibility, use caution/);
  assert.doesNotMatch(published.publishedAtis, /Training event|Separate ground|Simulated low/);
  assert.equal(JSON.stringify(state), before);
});
