import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor} from "./scenarios";
import {buildTaxiGraph} from "./taxi-routing";

test("Nice stand 56L is removed as shown on the current parking chart", () => {
  const airport = getAirport({airport: "LFMN", airportDataVersion: "45c8f352c11b784b77d67acb2066a8ce2280fd1f46948e8c71d17bce26e3cde9"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "8849be453fc15269108c0c3ea255def0e36f8979545459d859151f8bbc1863b3"});
  // https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_01_OCT_2026/FRANCE/AIRAC-2026-10-01/html/eAIP/Cartes/LFMN/AD_2_LFMN_APDC_01.pdf
  const before = previous.features.find(feature => feature.id === "1225133691")!;
  const after = airport.features.find(feature => feature.id === before.id)!;
  assert.ok(gatesFor(previous).some(gate => gate.id === before.id));
  assert.ok(!gatesFor(airport).some(gate => gate.name === "56L"));
  assert.equal(after.kind, "taxilane");
  assert.deepEqual(after.points, before.points);
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
