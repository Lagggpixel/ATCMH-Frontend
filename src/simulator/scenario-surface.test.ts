import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {airportList, airportSelection, airportSupportsTraining, defaultRunway} from "./airports";
import {engineFor} from "./engine";
import {addLocalScenarioAircraft, createLocalAircraft, type LocalAircraftOptions} from "./local-aircraft";
import {blankScenario, createScenarioExercise, normalizeScenario, scenarioSchema, scenarioSchemaFor, seedFromAircraft, type ScenarioEvent} from "./scenarios";

for (const airport of airportList) test(`${airport.icao}: explicit surface scenarios save and materialize without a mapped gate`, () => {
  const position = {...airport.features.find(f => f.kind === "taxiway")!.points[0]};
  const options: LocalAircraftOptions = {placement: "ground", position, callsign: "Easy 25", type: "A320", runway: defaultRunway(airport),
    distance: 5, leg: "downwind", hand: "left", height: 1500, speed: 160, heading: 90, landing: "full-stop", flight: "departure", frequency: "ground"};
  const aircraft = createLocalAircraft({airport: airport.icao}, "surface", options);
  const draft = addLocalScenarioAircraft(blankScenario({airport: airport.icao}), aircraft, undefined, 0);
  const localAvailable = airportSupportsTraining(airport, "local");
  if (!localAvailable) assert.equal(scenarioSchema.safeParse(draft).success, false);
  const definition = normalizeScenario((localAvailable ? scenarioSchema : scenarioSchemaFor(draft)).parse(draft));
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

test("scenario event request menus use each airport's elevation and the selected aircraft", () => {
  const require = createRequire(import.meta.url), original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {};};
  try {
    const Editor = require("./ScenarioEventEditor").default as typeof import("./ScenarioEventEditor").default;
    for (const airport of airportList) {
      const selection = airportSelection(airport), engine = engineFor(selection);
      const ground = engine.newAircraft("ground", false), airborne = engine.newAircraft("airborne", true);
      airborne.altitude = airport.elevation + 100;
      const definition = {...blankScenario(selection), aircraft: [ground, airborne].map(a => ({key: a.id, initial: true, seed: seedFromAircraft(a)}))};
      const requests = (aircraftKey: string) => {
        const event: ScenarioEvent = {id: "request", title: "Pilot request", trigger: {type: "time", at: 60}, actions: [{type: "request", aircraftKey, requestId: "roger", runway: defaultRunway(airport)}]};
        const html = renderToStaticMarkup(createElement(Editor, {definition, event, onChange() {}, onRemove() {}, onPickPosition() {}}));
        const menu = /<label>Request<select[^>]*>(.*?)<\/select>/.exec(html)?.[1];
        assert.ok(menu, `${airport.icao}: request menu exists`);
        return [...menu.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
      };
      const groundRequests = requests("ground");
      assert.ok(groundRequests.includes("pushback"), `${airport.icao}: parked Ground traffic can request pushback`);
      assert.ok(groundRequests.includes("taxi-runway"), `${airport.icao}: parked Ground traffic can request taxi`);
      const airborneRequests = requests("airborne");
      assert.ok(airborneRequests.includes("inbound-land"), `${airport.icao}: airborne Tower traffic can request landing`);
      assert.ok(!airborneRequests.includes("departure"), `${airport.icao}: airborne traffic has no ground departure request`);
      definition.aircraft[0].seed.frequency = "tower";
      const towerRequests = requests("ground");
      assert.ok(towerRequests.includes("departure"), `${airport.icao}: parked Tower traffic can request departure`);
      assert.ok(!towerRequests.includes("pushback"), `${airport.icao}: pushback is limited to Ground`);
    }
  } finally {if (original) require.extensions[".css"] = original; else delete require.extensions[".css"];}
});
