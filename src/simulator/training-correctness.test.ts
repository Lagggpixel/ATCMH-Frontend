import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {applyEnvelope, engineFor, initialExercise as defaultExercise, newAircraft, speedProfile, trimMessages, MESSAGE_HISTORY} from "./engine";
import {catalogFor} from "./catalog";
import {getAirport, type AirportSelection} from "./airports";
import {advanceScenario} from "./scenario-engine";
import {blankScenario, createScenarioExercise, seedFromAircraft, type ScenarioDefinition} from "./scenarios";
import {menteeActionAllowed} from "./protocol";
import {profileForType} from "./aircraft-performance";
import {EXERCISE_WEATHER, pendingPilotMessage, type Aircraft, type Exercise, type Frequency, type Message} from "./model";

const initialExercise = (id: string, selection?: AirportSelection) => selection ? engineFor(selection).initialExercise(id) : defaultExercise(id);
const messageMenuFor = (exercise: Exercise, frequency: Frequency, aircraft: Aircraft) =>
  catalogFor(getAirport(exercise), exercise.radarEnvironment, exercise.weather).messageMenu(frequency, aircraft, exercise.aircraft, undefined, exercise.messages);

const send = (state: Exercise, action: Parameters<typeof applyEnvelope>[1]["action"]) => applyEnvelope(state, {id: randomUUID(), time: 0, action}).state;

test("trimming the live log keeps unanswered pilot calls and pending instructions older than the last 300", () => {
  const exercise = initialExercise("trim"), [first, second] = exercise.aircraft;
  const call: Message = {id: "old-call", aircraftId: first.id, time: 0, frequency: first.frequency!, sender: "pilot", text: "ready to taxi", read: false};
  const chatter: Message[] = Array.from({length: MESSAGE_HISTORY + 50}, (_, index) => ({id: `chatter-${index}`, aircraftId: second.id, time: index, frequency: second.frequency!, sender: "pilot", text: "roger", read: true}));
  const trimmed = trimMessages({aircraft: exercise.aircraft, messages: [call, ...chatter]});
  assert.equal(trimmed[0].id, "old-call");
  // The saved snapshot stays within its 300-message schema limit.
  assert.equal(trimmed.length, MESSAGE_HISTORY);
  assert.equal(trimmed[1].id, "chatter-51");
  assert.equal(pendingPilotMessage({...exercise, messages: trimmed}, first.id, first.frequency!)?.id, "old-call");
  // Calls from aircraft that have left the exercise are history, and age out normally.
  assert.equal(trimMessages({aircraft: [second], messages: [call, ...chatter]})[0].id, `chatter-50`);
});

test("free-play Reset clears the board instead of bringing back demo traffic", () => {
  const exercise = initialExercise("reset");
  assert.ok(exercise.aircraft.length > 0);
  const reset = send(exercise, {kind: "reset"});
  assert.deepEqual(reset.aircraft, []);
  assert.equal(reset.revision, exercise.revision + 1);
});

test("trainees cannot change the exercise weather; trainers still can", () => {
  const exercise = initialExercise("weather"), weather = {...EXERCISE_WEATHER, windSpeed: 35};
  assert.equal(menteeActionAllowed({kind: "weather", weather}, exercise), false);
  assert.equal(send(exercise, {kind: "weather", weather}).weather?.windSpeed, 35);
});

test("pattern traffic flies its own downwind speed, and light types borrow a light profile", () => {
  const cessna = newAircraft("c172", true);
  Object.assign(cessna, {mode: "pattern", leg: "downwind", performanceProfile: "C172", leavingCircuit: false});
  const profile = speedProfile(cessna);
  assert.ok(profile.target <= 110, `downwind target ${profile.target} kt`);
  assert.ok(profile.target <= profile.maximum);
  const jet = newAircraft("a320", true);
  Object.assign(jet, {mode: "pattern", leg: "downwind", performanceProfile: "A320", leavingCircuit: false});
  assert.equal(speedProfile(jet).target, 220);
  for (const type of ["P28A", "PA-28", "XCUB", "CARAVAN", "Q400"]) assert.ok(profileForType(type), type);
  assert.equal(profileForType("P28A"), "C172");
});

test("radar positions offer a Wrong Runway message", () => {
  const approach = initialExercise("approach", {trainingStation: "EGPH:approach"});
  const radarMenu = messageMenuFor(approach, "approach", approach.aircraft[0]);
  const misc = radarMenu.find(e => e.label === "Misc. Messages");
  assert.ok(misc?.children?.some(e => e.label === "Wrong Runway"));
});

function scenario(condition: ScenarioDefinition["events"][number]["trigger"]): ScenarioDefinition {
  const air = newAircraft("air", true); Object.assign(air, {mode: "heading", heading: 90, targetHeading: 90, altitude: 1500, targetAltitude: 1500});
  return {...blankScenario(), title: "Triggers", aircraft: [{key: "air", initial: true, seed: seedFromAircraft(air)}], events: [
    {id: "watch", title: "Watch", trigger: condition, actions: [{type: "note", text: "Fired"}]},
  ]};
}

test("altitude triggers fire when the aircraft passes the value, including a staff edit that jumps past it", () => {
  const {runtime, exercise} = createScenarioExercise(scenario({type: "condition", delay: 0, condition: {type: "altitude", aircraftKey: "air", altitude: 3000}}), "session", randomUUID());
  let state = advanceScenario({...exercise, running: true}, runtime, 1, 1000).exercise;
  assert.equal(runtime.events.watch.status, "scheduled");
  const id = runtime.aircraftIds.air;
  state = send(state, {kind: "edit", aircraftId: id, patch: {altitude: 4500, targetAltitude: 4500}});
  advanceScenario(state, runtime, .2, 2000);
  assert.equal(runtime.events.watch.status, "completed");
});

test("overhead triggers do not need automatic pilot actions", () => {
  const {runtime, exercise} = createScenarioExercise(scenario({type: "condition", delay: 0, condition: {type: "overhead", aircraftKey: "air", radius: 5}}), "session", randomUUID());
  const id = runtime.aircraftIds.air;
  let state = send({...exercise, running: true}, {kind: "auto-readback", enabled: false});
  state = {...state, aircraft: state.aircraft.map(a => a.id === id ? {...a, position: {x: .2, y: .2}, transitionAltitude: 2500} : a)};
  advanceScenario(state, runtime, .2, 1000);
  assert.equal(runtime.events.watch.status, "completed");
});
