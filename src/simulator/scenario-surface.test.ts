import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {airportList, defaultRunway} from "./airports";
import {addLocalScenarioAircraft, createLocalAircraft, type LocalAircraftOptions} from "./local-aircraft";
import {blankScenario, createScenarioExercise, normalizeScenario, scenarioSchema} from "./scenarios";

for (const airport of airportList) test(`${airport.icao}: explicit surface scenarios save and materialize without a mapped gate`, () => {
  const position = {...airport.features.find(f => f.kind === "taxiway")!.points[0]};
  const options: LocalAircraftOptions = {placement: "ground", position, callsign: "Easy 25", type: "A320", runway: defaultRunway(airport),
    distance: 5, leg: "downwind", hand: "left", height: 1500, speed: 160, heading: 90, landing: "full-stop", flight: "departure", frequency: "ground"};
  const aircraft = createLocalAircraft({airport: airport.icao}, "surface", options);
  const definition = normalizeScenario(scenarioSchema.parse(addLocalScenarioAircraft(blankScenario({airport: airport.icao}), aircraft, undefined, 0)));
  assert.equal(definition.aircraft[0].gateId, undefined);
  assert.deepEqual(definition.aircraft[0].seed.position, position);
  const {exercise} = createScenarioExercise(definition, "surface-session", "generation");
  assert.deepEqual(exercise.aircraft[0].position, position);
  assert.equal(exercise.aircraft[0].mode, "parked");
  assert.equal(exercise.aircraft[0].altitude, airport.elevation);
  assert.equal(exercise.aircraft[0].groundReady, true);
  const airborne = createLocalAircraft({airport: airport.icao}, "inbound", {...options, placement: "circuit", speed: "auto", frequency: "tower", flight: "pattern"});
  assert.equal(airborne.speedMode, "auto", "new pattern traffic must slow for landing");
});

test("the scenario setup has a real selected Ground & Tower option", () => {
  const require = createRequire(import.meta.url), original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {};};
  try {
    const Setup = require("./ScenarioSetup").default as typeof import("./ScenarioSetup").default;
    const html = renderToStaticMarkup(createElement(Setup, {definition: blankScenario(), onChange() {}}));
    assert.match(html, /<option value="local" selected="">Ground &amp; Tower<\/option>/);
  } finally {if (original) require.extensions[".css"] = original; else delete require.extensions[".css"];}
});
