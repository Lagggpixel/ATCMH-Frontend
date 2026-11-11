import assert from "node:assert/strict";
import test from "node:test";
import {aircraftSummary, flightPlanText, machNumber, procedureLines, simulatedPilot} from "./aircraft-information";
import {aircraftMessageHeading} from "./aircraft-message-heading";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {EXERCISE_WEATHER, type Aircraft, type RoutePoint} from "./model";

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

test("new aircraft information separates GS and IAS using session wind before a motion sample", () => {
  const engine = engineFor({airport: "EGPH"}), airport = getAirport({airport: "EGPH"});
  const a: Aircraft = {...engine.newAircraft("new-information", true), mode: "heading", heading: 90, altitude: 0, speed: 200};
  delete a.groundSpeed;
  for (const [windDirection, expected] of [[90, 170], [270, 230], [0, 202]] as const) {
    const weather = {...EXERCISE_WEATHER, windDirection, windSpeed: 30, qnh: 1013.25, temperature: 15};
    assert.match(aircraftSummary(a, airport, weather).speeds, new RegExp(`^GS: ${expected} IAS: 200 `));
    assert.match(aircraftMessageHeading(a, airport, weather).speed, new RegExp(`^GS: ${expected} IAS: 200 `));
  }
  const calm = {...EXERCISE_WEATHER, windSpeed: 0, qnh: 1013.25, temperature: 15};
  a.altitude = 10000; a.speed = 250;
  assert.match(aircraftSummary(a, airport, calm).speeds, /^GS: 291 IAS: 250 /);
  for (const temperature of [-10, 35]) {
    const weather = {...calm, temperature};
    const summary = aircraftSummary(a, airport, weather).speeds, heading = aircraftMessageHeading(a, airport, weather).speed;
    assert.equal(summary.match(/Mach: (\d+\.\d+)/)![1], heading.match(/ M(\d+\.\d+)/)![1]);
  }
  a.groundSpeed = 0;
  assert.match(aircraftSummary(a, airport, calm).speeds, /^GS: 0 IAS: 250 /, "recorded zero remains authoritative");
  delete a.groundSpeed; a.mode = "taxi"; a.speed = 20;
  assert.match(aircraftSummary(a, airport, calm).speeds, /^GS: 20 IAS: 20 /, "surface speed needs no density or wind correction");
});
