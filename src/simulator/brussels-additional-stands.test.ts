import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";
import chart from "./brussels-additional-stand-coordinates.json";

test("Brussels additional mapped stands match chart areas and routing limits", () => {
  const airport = getAirport({airport: "EBBR"});
  const previous = getAirport({airport: "EBBR", airportDataVersion: "f86424a50391a20cc19b96443a2093753ab62c1e98be6ab071302193e3062c16"});
  const gates = gatesFor(airport);
  const no25R = new Set(["965","964","970","971","969","962","960","961","959","955","953","954","952","950","951","957","966","963"]);
  assert.equal(gatesFor(previous).length, 50);
  assert.equal(gates.length, 150);
  assert.equal(chart.coordinates.length, 91);
  for (const [name, latMinutes, lonMinutes] of chart.coordinates) {
    if (typeof name !== "string" || typeof latMinutes !== "number" || typeof lonMinutes !== "number") throw new Error("Invalid chart reference");
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const point = {x: (4 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (50 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (end.id === "25L" || end.id === "25R" && no25R.has(name)) assert.ok(!route.path, `${name} to ${end.id}`);
      else assert.ok(route.path, `${name} to ${end.id}`);
    }
  }
});

test("Brussels nine additional stand lines match chart areas and connect to the network", () => {
  const airport = getAirport({airport: "EBBR"});
  const previous = getAirport({airport: "EBBR", airportDataVersion: "d8ca0c4f2d16c7b912f3a752857887283ab75c4a77ce7d13c66cd6c82e2ed1eb"});
  const references: Record<string, [number, number]> = {"230R":[54.1,29.3],"230L":[54.1,29.4],"232":[54.1,29.4],"234R":[54.1,29.4],"234L":[54.1,29.4],"236":[54.1,29.4],"238":[54.1,29.5],"240":[54.1,29.5],"512":[53.9,28.6]};
  assert.equal(gatesFor(previous).length, 141);
  const gates = gatesFor(airport).filter(gate => Object.hasOwn(references, gate.name));
  assert.equal(gates.length, 9);
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name];
    const chart = {x: (4 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (50 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125, gate.name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (end.id === "25L") assert.ok(!route.path, gate.name);
      else assert.ok(route.path, `${gate.name} to ${end.id}`);
    }
  }
});
