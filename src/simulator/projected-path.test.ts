import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {calculateProjectedPath, type PathPredictionInput} from "./projected-path";
import cyycLegacy from "./data/cyyc-before-axis-repair.json";

for (const station of ["EGLL:local", "EGLL:approach", "EGLL:center"]) for (const autoReadback of [false, true]) {
  test(`worker forecast matches existing engine: ${station}, automatic ${autoReadback}`, () => {
    const engine = engineFor({airport: "EGLL", trainingStation: station}), state = engine.initialExercise();
    state.aircraft = Array.from({length: 3}, (_, i) => {
      const a = engine.newAircraft(`forecast-${i}`, true); a.position.y -= i * 2;
      if (station.endsWith("local") && i > 0) a.sequence = {number: i + 1, followingId: `forecast-${i - 1}`, runway: a.runway!, circuit: 0, followingCircuit: 0};
      return a;
    });
    const input: PathPredictionInput = {aircraftId: "forecast-2", aircraft: state.aircraft, airport: state.airport!, airportDataVersion: state.airportDataVersion,
      radarEnvironment: state.radarEnvironment, weather: {...state.weather!, windDirection: 260, windSpeed: 18, visibilityKm: 10, qnh: 1013, temperature: 12, dewpoint: 7}, autoReadback};
    const before = structuredClone(input), selected = input.aircraft[2];
    const expected = engineFor({...input, traffic: input.aircraft}).projectedPath(selected, 120, input.aircraft, autoReadback);
    const candidate = structuredClone(input);
    assert.deepEqual(calculateProjectedPath(candidate), expected);
    assert.deepEqual(candidate, before, "forecast does not modify the snapshot");
  });
}

test("ground forecast and missing selection preserve the existing behavior", () => {
  const engine = engineFor({airport: "EGPH"}), state = engine.initialExercise();
  const input: PathPredictionInput = {aircraftId: state.aircraft[1].id, aircraft: state.aircraft, airport: "EGPH", autoReadback: true};
  assert.deepEqual(calculateProjectedPath(structuredClone(input)), engine.projectedPath(state.aircraft[1], 120, state.aircraft, true));
  assert.deepEqual(calculateProjectedPath({...input, aircraftId: "removed"}), []);
  assert.throws(() => calculateProjectedPath({...input, airportDataVersion: "unavailable"}), /version is unavailable/);
});

test("worker forecasts retain a saved scenario's pinned airport geometry", () => {
  const selection = {airport: "CYYC", airportDataVersion: cyycLegacy.dataVersion};
  const engine = engineFor(selection), a = engine.newAircraft("saved", true);
  const input: PathPredictionInput = {...selection, aircraftId: a.id, aircraft: [a], autoReadback: false};
  assert.deepEqual(calculateProjectedPath(input), engine.projectedPath(a, 120, [a], false));
});
