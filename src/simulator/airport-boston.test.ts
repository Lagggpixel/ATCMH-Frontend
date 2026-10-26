import assert from "node:assert/strict";
import test from "node:test";
import {airportCallsign, airportSelection, getAirport, runwayEnds} from "./airports";
import {approachGuide} from "./approach-guides";
import {blankScenario, createScenarioExercise, scenarioSchema} from "./scenarios";
import {exerciseSchema} from "./protocol";
import {restoreExercise} from "./engine";
import {GET} from "../app/simulator/data/[snapshot]/route";

const ends = ["04L", "04R", "09", "14", "15L", "15R", "22L", "22R", "27", "32", "33L", "33R"];
const ilsEnds = ["04R", "22L", "27", "15R", "33L"];

test("Boston exposes all six sourced runway pairs and its public snapshot", async () => {
  const airport = getAirport({airport: "KBOS"});
  assert.equal(airportCallsign(airport), "Boston");
  assert.deepEqual(runwayEnds(airport).map(end => end.id).sort(), ends);
  const response = await GET(new Request("https://example.test/simulator/data/kbos.json"), {params: Promise.resolve({snapshot: "kbos.json"})});
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.dataVersion, airport.dataVersion);
  assert.equal(snapshot.runways.length, 6);
  assert.match(snapshot.sources.osmSha256, /^[a-f0-9]{64}$/);
  assert.ok(airport.features.some(feature => feature.kind === "taxiway"));
  assert.ok(airport.features.some(feature => feature.kind === "parking_position"));
});

for (const mode of ["local", "approach", "center"] as const) test(`Boston ${mode}: pinned scenarios survive reload with the verified approach equipment`, () => {
  const airport = getAirport({airport: "KBOS"});
  const definition = scenarioSchema.parse(blankScenario(airportSelection(airport, mode)));
  const {exercise} = createScenarioExercise(definition, "boston-test", "5d947496-8490-44ee-b108-e033484db363");
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(exercise))));
  assert.equal(restored.airport, "KBOS");
  assert.equal(restored.airportDataVersion, airport.dataVersion);
  assert.equal(restored.trainingStation, `KBOS:${mode}`);
  if (mode === "local") return;
  const approaches = restored.radarEnvironment!.approaches;
  assert.deepEqual(approaches.filter(approach => approach.type === "ils").map(approach => approach.runway).sort(), [...ilsEnds].sort());
  for (const type of ["gps", "visual"]) assert.deepEqual(approaches.filter(approach => approach.type === type).map(approach => approach.runway).sort(), ends);
  for (const end of ends) assert.equal(approachGuide(end, airport).color, ilsEnds.includes(end) ? "#dc6464" : "#808080");
});
