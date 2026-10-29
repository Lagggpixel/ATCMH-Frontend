import assert from "node:assert/strict";
import test from "node:test";
import {flightPlanText, machNumber, procedureLines, simulatedPilot} from "./aircraft-information";
import type {RoutePoint} from "./model";

const fix = (name: string, altitude?: number): RoutePoint => ({x: 0, y: 0, name, ...(altitude !== undefined ? {altitude} : {})});
const sid = {key: "a", type: "SID" as const, name: "SUMMA2"};
const star = {key: "b", type: "STAR" as const, name: "BEARR5"};

test("information panel formats the route like Infinite Flight", () => {
  const plan = [fix("KSEA"), {...fix("SUMMA", 10000), procedure: sid}, {...fix("BKE"), procedure: sid}, fix("HOVEL", 34000), fix("VELUY", 0),
    {...fix("BYI"), procedure: star}, {...fix("BEARR", 12000), procedure: star}, fix("KSLC")];
  assert.equal(flightPlanText(plan), "KSEA, SUMMA2(SUMMA@10,000, BKE), HOVEL(34,000), VELUY, BEARR5(BYI, BEARR@12,000), KSLC");
  assert.deepEqual(procedureLines(plan), ["SID       : SUMMA2", "STAR      : BEARR5"]);
  assert.deepEqual(procedureLines([{...fix("CORLE"), procedure: {key: "c", type: "Approach", name: "I27"}}]), ["APPROACH  : I27"]);
});

test("information panel route falls back to a numbered waypoint and is empty without fixes", () => {
  assert.equal(flightPlanText([{x: 0, y: 0}, fix("PGY")]), "WPT1, PGY");
  assert.equal(flightPlanText([]), "");
});

test("simulated pilot details stay fixed per aircraft", () => {
  const first = simulatedPilot({id: "a1", callsign: "SWA2214"});
  assert.deepEqual(simulatedPilot({id: "a1", callsign: "SWA2214"}), first);
  assert.ok(first.grade >= 1 && first.grade <= 5);
  assert.match(first.identifier, /^[0-9A-F]{8}$/);
  assert.match(first.flightTime, /^\d+hr\d{2}mn$/);
});

test("Mach readout rises with altitude at the same IAS", () => {
  assert.ok(machNumber(0, 0) === 0);
  assert.ok(Math.abs(machNumber(276, 34000) - .8) < .08);
  assert.ok(machNumber(250, 30000) > machNumber(250, 10000));
});
