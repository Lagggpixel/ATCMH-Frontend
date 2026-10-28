import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {airportSelection, airportSupportsTraining, airportTrainingCapabilities, getAirport, supportsTrainingMode} from "./airports";
import {blankScenario, gatesFor, scenarioSchema, scenarioSchemaFor, storedScenarioSchema} from "./scenarios";
import {TrainingService} from "./server/training-service";

test("airport capabilities support radar-only and local-only configurations", () => {
  assert.deepEqual(airportTrainingCapabilities(getAirport({airport: "KASE"})), {local: false, radar: true});
  assert.equal(airportSupportsTraining(getAirport({airport: "KASE"}), "local"), false);
  assert.equal(gatesFor(getAirport({airport: "KASE"})).length, 0);
  for (const mode of ["approach", "center"] as const) assert.equal(airportSupportsTraining(getAirport({airport: "KASE"}), mode), true);
  const localOnly = {local: true, radar: false};
  assert.equal(supportsTrainingMode(localOnly, "local"), true);
  assert.equal(supportsTrainingMode(localOnly, "approach"), false);
  assert.equal(supportsTrainingMode(localOnly, "center"), false);
  assert.equal(airportSupportsTraining(getAirport({airport: "EGPH"}), "local"), true);
  const noGroundChart = {...getAirport({airport: "EGPH"}), features: getAirport({airport: "EGPH"}).features.filter(feature => feature.kind === "runway")};
  assert.deepEqual(airportTrainingCapabilities(noGroundChart), {local: false, radar: true});
});

test("new scenarios reject unsupported airport modes while existing ones remain readable", () => {
  const airport = getAirport({airport: "KASE"});
  const local = blankScenario(airportSelection(airport, "local"));
  assert.ok(storedScenarioSchema.safeParse(local).success);
  assert.match(scenarioSchema.safeParse(local).error!.message, /radar training only/);
  assert.ok(scenarioSchemaFor(local).safeParse({...local, title: "Existing local scenario"}).success);
  for (const mode of ["approach", "center"] as const) assert.ok(scenarioSchema.safeParse(blankScenario(airportSelection(airport, mode))).success);
});

test("an unsupported saved scenario cannot start a new session", async () => {
  const definition = blankScenario(airportSelection(getAirport({airport: "KASE"}), "local"));
  const service = new TrainingService() as unknown as {launch: (actor: {accountId: string; staff: boolean}, scenario: typeof definition, id: string, revision: number) => Promise<unknown>};
  await assert.rejects(service.launch({accountId: "trainer", staff: true}, definition, "scenario", 1), /radar training only/);
});

test("the setup selector reflects airport availability for the host's training mode", () => {
  const require = createRequire(import.meta.url), original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {};};
  try {
    const Setup = require("./ScenarioSetup").default as typeof import("./ScenarioSetup").default;
    for (const mode of ["local", "approach"] as const) {
      const definition = blankScenario(airportSelection(getAirport({airport: "EGPH"}), mode));
      const html = renderToStaticMarkup(createElement(Setup, {definition, onChange: () => {}}));
      if (mode === "approach" && !html.includes('value="approach"')) continue; // ATCMH offers local training only.
      const option = html.match(/<option[^>]*value="KASE"[^>]*>[^<]*<\/option>/)?.[0] ?? "";
      assert.ok(option.includes("KASE"));
      assert.equal(option.includes("disabled="), mode === "local");
    }
  } finally {if (original) require.extensions[".css"] = original; else delete require.extensions[".css"];}
});
