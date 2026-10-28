import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Haneda additional mapped stands match chart areas and documented routing limits", () => {
  const airport = getAirport({airport: "RJTT", airportDataVersion: "a2a8d071e131d3ecb0271fa32ccef493bfe0950bf19af7a263b806e7898d07d7"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "df39fa537efc538892ea9e2182620773135c94577b4554e857536aac14aa1524"});
  const references: Record<string, [number, number]> = {"14":[32.9,47],"15":[33,47],"72":[32.9,47.5],"73":[32.9,47.5],"104":[32.5,46.4],"105F":[32.5,46.4],"105P":[32.5,46.3],"106":[32.6,46.3],"106L":[32.6,46.3],"107":[32.6,46.3],"107L":[32.6,46.3],"107R":[32.6,46.3],"108":[32.6,46.3],"108L":[32.6,46.3],"108R":[32.6,46.3],"133":[32.8,46.4],"134":[32.8,46.4],"701":[32.7,47.7],"702":[32.7,47.8],"703":[32.7,47.8],"704":[32.6,47.8],"705":[32.6,47.8],"706":[32.6,47.9],"707":[32.5,47.9],"801":[32.7,47.7],"802":[32.7,47.8],"803":[32.7,47.8],"804":[32.6,47.8],"805":[32.6,47.8],"806":[32.6,47.9],"807":[32.5,47.9]};
  const no34L = new Set(["104","105F","105P","106","106L","107","107L","107R","108","108L","108R","133","134"]);
  const gates = gatesFor(airport).filter(gate => Object.hasOwn(references, gate.name));
  assert.equal(gatesFor(previous).length, 20);
  assert.equal(gates.length, 31);
  assert.equal(gatesFor(airport).length, 59);
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name];
    const point = {x: (139 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (35 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, gate.name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (end.id === "34L" && no34L.has(gate.name)) assert.ok(!route.path, gate.name);
      else assert.ok(route.path, `${gate.name} to ${end.id}`);
    }
  }
});

test("Haneda stand 60 uses its mapped lead-in branches", () => {
  const airport = getAirport({airport: "RJTT"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "d9d56071c26265a38f540498a2a015fc05ecc00b80cda58a32f0a405c59afcf7"});
  assert.equal(gatesFor(previous).length, 51);
  const gate = gatesFor(airport).find(stand => stand.name === "60")!;
  assert.ok(gate);
  for (const id of ["500718537", "500718559"]) assert.equal(airport.features.find(feature => feature.id === id)?.kind, "taxilane");
  const chart = {x: (139 + 47.3 / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (35 + 33.2 / 60 - airport.origin.lat) * 60};
  const position = standPlacement(gate.id, false, airport)!.position;
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});

test("Haneda branched stand lines remain connected and match chart areas", () => {
  const airport = getAirport({airport: "RJTT"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "497b9b2ddeb3ff044bb8361a8656be31b4d982e496cfbbee7b882e64804fe000"});
  const references: Record<string, [number, number]> = {"57":[33.3,47.3],"59":[33.2,47.3],"61":[33.1,47.3],"62":[33.1,47.4],"63":[33.1,47.4],"64":[33,47.4]};
  assert.equal(gatesFor(previous).length, 52);
  const gates = gatesFor(airport).filter(gate => Object.hasOwn(references, gate.name));
  assert.equal(gates.length, 6);
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name];
    const chart = {x: (139 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (35 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});

test("Haneda stand 65 connects through its mapped lead-in and short inferred join", () => {
  const airport = getAirport({airport: "RJTT"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "fa80de96ca964afe905c4eb07b90ed65782349fffcd8670aa8420ff5e9de1b88"});
  assert.equal(gatesFor(previous).length, 58);
  const gate = gatesFor(airport).find(stand => stand.name === "65")!;
  assert.ok(gate);
  const branch = airport.features.find(feature => feature.id === "500718545")!;
  assert.equal(branch.kind, "taxilane");
  assert.ok(Math.hypot(branch.points[0].x - branch.points[1].x, branch.points[0].y - branch.points[1].y) * 1852 < 10);
  const chart = {x: (139 + 47.4 / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (35 + 33 / 60 - airport.origin.lat) * 60};
  const position = standPlacement(gate.id, false, airport)!.position;
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});
