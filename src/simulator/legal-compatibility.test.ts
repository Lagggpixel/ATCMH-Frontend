import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {readFileSync, existsSync} from "node:fs";
import {resolve} from "node:path";
import {commandTasks, instructionText, pilotRequests, resolvePilotRequest, REQUEST_IDS} from "./catalog";
import {initialExercise, newAircraft, atisText, engineFor} from "./engine";
import {createScenarioExercise, blankScenario, seedFromAircraft, scenarioSchema} from "./scenarios";
import {advanceScenario} from "./scenario-engine";
import {exerciseSchema, instructionSchema} from "./protocol";
import {selectSpeechVoice, browserSpeechOutput} from "./radio-audio";
import {GET} from "../app/simulator/data/egph.json/route";
import data from "./data/egph.json";

test("every stable request and exact legacy label executes the same scenario without rewriting its source", () => {
  for (const id of REQUEST_IDS) {
    const request = resolvePilotRequest({requestId: id})!;
    for (const legacy of [true, false]) {
      const radar = ["check-in", "request-approach", "missed-approach", "flight-following", "radar-vectors", "star-descent", "diversion", "airport-in-sight"].includes(id);
      const base = {...blankScenario(), ...(radar ? {trainingStation: "EGPH:approach"} : {})};
      const a = (radar ? engineFor(base).newAircraft : newAircraft)("seed", request.phase !== "ground" && !["pushback", "taxi-runway", "taxi-parking", "cross-runway"].includes(id));
      a.frequency = ["pushback", "taxi-runway", "taxi-parking", "cross-runway"].includes(id) ? "ground" : "tower";
      if (id === "frequency-change") a.frequency = "ground";
      if (radar) a.frequency = "approach";
      const definition = {...base, aircraft: [{key: "target", initial: true, seed: seedFromAircraft(a)}], events: [{id: "request", title: "Request", trigger: {type: "time" as const, at: 0}, actions: [{type: "request" as const, aircraftKey: "target", runway: "06" as const, ...(legacy ? {label: request.legacyLabel} : {requestId: id, label: "Display text can change"})}]}]};
      const before = JSON.stringify(definition);
      const {exercise, runtime} = createScenarioExercise(scenarioSchema.parse(definition), "session", "generation");
      exercise.running = true;
      const result = advanceScenario(exercise, runtime, 0, 1000).exercise;
      assert.equal(runtime.events.request.status, "completed", `${id}/${legacy}`);
      assert.equal(result.messages.length, 1); assert.match(result.messages[0].text, new RegExp(request.text, "i"));
      assert.equal(JSON.stringify(definition), before);
    }
  }
  assert.equal(resolvePilotRequest({requestId: "unknown", label: "Request pushback"}), undefined);
});

test("schema 1 preserves old messages, taxi defaults and legacy ATIS references", () => {
  const state = initialExercise();
  state.atis.procedures = ["SID - GOSA1C"]; state.publishedAtis = "Historical radio text";
  state.messages = [{id: "old", aircraftId: state.aircraft[1].id, time: 1, frequency: "ground", sender: "controller", text: "Saved parking wording", instruction: {type: "taxi"}}];
  const saved = JSON.stringify(state);
  assert.equal(JSON.stringify(exerciseSchema.parse(JSON.parse(saved))), saved);
  assert.match(atisText(state.atis), /SID - GOSA1C/);
  assert.match(instructionText(state.aircraft[1], {type: "taxi"}), /continue taxi/);
  assert.match(instructionText(state.aircraft[1], instructionSchema.parse({type: "taxi", destination: "parking"})), /taxi to parking/);
  assert.match(instructionText(state.aircraft[0], {type: "land", option: false}), /cleared to land/);
});

test("task labels can change without changing radio meaning; every supported command remains reachable", () => {
  const ground = newAircraft("ground", false), air = newAircraft("air", true);
  const tasks = [...commandTasks("ground", ground), ...commandTasks("tower", ground), ...commandTasks("tower", air)];
  const types = new Set(tasks.map(t => t.command.type));
  for (const type of ["pushback", "taxi", "stop", "hold-short", "cross", "takeoff", "land", "pattern", "extend", "go-around", "sequence", "frequency"]) assert.ok(types.has(type as never));
  const task = tasks.find(t => t.id === "cross")!, before = instructionText(ground, task.command);
  task.label = "A translated control label"; assert.equal(instructionText(ground, task.command), before);
  assert.ok(pilotRequests(air).every(r => r.id));
});

test("automatic speech cannot select a remote/default voice; explicit remote speech requires opt-in", () => {
  const remote = {voiceURI: "remote", localService: false, lang: "en-GB"}, local = {voiceURI: "local", localService: true, lang: "en-US"};
  const settings = {voice: "", rate: 1, volume: 1};
  assert.equal(selectSpeechVoice([remote], settings), undefined);
  assert.equal(selectSpeechVoice([remote, local], settings), local);
  assert.equal(selectSpeechVoice([remote, local], {...settings, voice: "remote"}), undefined);
  assert.equal(selectSpeechVoice([remote, local], {...settings, voice: "remote", allowOnline: true}), remote);
  assert.equal(selectSpeechVoice([remote], {...settings, allowOnline: true}), undefined);
  assert.equal(selectSpeechVoice([local], {...settings, voice: "missing", allowOnline: true}), undefined);
});

test("browser adapter refuses to call speech synthesis when only online voices are available", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window"); let spoken = 0, failed = 0;
  Object.defineProperty(globalThis, "window", {configurable: true, value: {speechSynthesis: {getVoices: () => [{voiceURI: "online", localService: false, lang: "en-GB"}], speak: () => spoken++}, SpeechSynthesisUtterance: function() {}}});
  try {browserSpeechOutput()!.speak("Private radio text", {voice: "", rate: 1, volume: 1}, () => {}, () => failed++); assert.equal(spoken, 0); assert.equal(failed, 1);}
  finally {if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");}
});

test("offered derived map data is exactly the engine database and contains no session fields", async () => {
  const response = GET(); assert.match(response.headers.get("content-disposition")!, /attachment/);
  assert.deepEqual(await response.json(), data);
  assert.deepEqual(Object.keys(data).sort(), ["icao", "name", "origin", "elevation", "sourceDate", "osmAttribution", "runway", "features"].sort());
});

test("policy versions and hashes match canonical UTF-8 LF documents and the sibling backend registry", () => {
  const receipt = JSON.parse(readFileSync(resolve("docs/simulator-policy-receipt.json"), "utf8"));
  const backendPath = resolve("../Backend/src/main/java/me/reid/auth/RequiredPolicyRegistry.java");
  const registry = existsSync(backendPath) ? readFileSync(backendPath, "utf8") : null;
  for (const document of receipt.documents) {
    const bytes = readFileSync(resolve(document.file));
    assert.ok(!bytes.includes(13), "policy files use canonical LF");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), document.sha256);
    if (registry) {assert.ok(registry.includes(document.sha256)); assert.ok(registry.includes(`"${document.version}"`));}
  }
});
