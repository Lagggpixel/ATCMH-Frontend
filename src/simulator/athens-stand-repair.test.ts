import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Athens named stands park at the mapped nose-wheel nodes while old exercises keep their snapshot", () => {
  const airport = getAirport({airport: "LGAV"});
  const previous = getAirport({airport: "LGAV", airportDataVersion: "ff0697f42c09605d11877a393891f5d3c670cadd59e29f13aa92c7a9bb8967f2"});
  const ids = ["326787155", "326787156", "326787157", "326787158", "326787162", "326787164", "326787166", "326854368", "326854370", "326854371", "326854372", "326854373", "326854375", "326854378", "326854379", "326854380", "326854384"];
  const available = new Set(gatesFor(airport).map(gate => gate.id));
  assert.notEqual(airport.dataVersion, previous.dataVersion);
  for (const id of ids) {
    const oldStand = previous.features.find(feature => feature.id === id)!;
    const newStand = airport.features.find(feature => feature.id === id)!;
    assert.deepEqual(newStand.points, [...oldStand.points].reverse(), id);
    assert.deepEqual(standPlacement(id, false, airport)!.position, oldStand.points[0], id);
    assert.deepEqual(standPlacement(id, false, previous)!.position, oldStand.points.at(-1), id);
    assert.equal(available.has(id), gatesFor(previous).some(gate => gate.id === id), id);
  }
});

test("Athens exposes named stand endpoints on the mapped taxilane network", () => {
  const airport = getAirport({airport: "LGAV"});
  const previous = getAirport({airport: "LGAV", airportDataVersion: "4a2502ec8e7b3614188299d5476589c522515594be4d3e0e17b163e2952cb23d"});
  const prior = new Map(previous.features.map(feature => [feature.id, feature]));
  const added = airport.features.filter(feature => feature.kind === "parking_position" && prior.get(feature.id)?.kind === "taxilane");
  const available = new Set(gatesFor(airport).map(gate => gate.id));
  assert.equal(added.length, 58);
  assert.ok(added.every(stand => stand.name && available.has(stand.id)));
  for (const stand of added) {
    const before = prior.get(stand.id)!;
    assert.ok(JSON.stringify(stand.points) === JSON.stringify(before.points) || JSON.stringify(stand.points) === JSON.stringify([...before.points].reverse()), stand.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, standPlacement(stand.id, false, airport)!.position, end.id).path, `${stand.name} to ${end.id}`);
  }
  assert.ok(added.some(stand => stand.name === "B03"));
  assert.ok(added.some(stand => stand.name === "B84"));
});

test("Santiago exposes named connected stands and retains the previous snapshot", () => {
  const airport = getAirport({airport: "SCEL"});
  const previous = getAirport({airport: "SCEL", airportDataVersion: "40a43b43b66052e471dfd2d8db1d758569c96d2aef78737b830e433f05e7f8ad"});
  const gates = gatesFor(airport);
  assert.equal(previous.features.filter(feature => feature.kind === "parking_position").length, 0);
  assert.equal(gates.length, 91);
  assert.equal(gates.filter(gate => gate.name === "A02").length, 1);
  assert.ok(gates.every(gate => gate.name && gate.points.length >= 2));
  assert.deepEqual(standPlacement("677911729", false, airport)!.position, {x: -.31438, y: -.17712});
  assert.equal(gates.find(gate => gate.id === "677911729")!.name, "B01");
});

test("Princess Juliana offers chart-matched stands and preserves its old snapshot", () => {
  const airport = getAirport({airport: "TNCM"});
  const previous = getAirport({airport: "TNCM", airportDataVersion: "14fea331784d42715ed0013b51a4ae6b388e36f67a9d4c8fe7049fa7a3d745ff"});
  const gates = gatesFor(airport);
  assert.equal(previous.features.filter(feature => feature.kind === "parking_position").length, 0);
  assert.equal(gates.length, 17);
  assert.ok(gates.some(gate => gate.name === "A1"));
  assert.ok(gates.some(gate => gate.name === "C12"));
  assert.ok(!gates.some(gate => ["B4", "B5", "C5", "C6"].includes(gate.name)));
  // Bound the difference between the chart coordinates and mapped endpoints.
  const seconds: Record<string, [number, number]> = {
    A1: [36.04, 51.58], A2: [36.40, 49.13], A3: [36.76, 46.68], A4: [36.97, 44.20],
    B1: [35.61, 54.03], B2: [33.88, 56.20], B3: [32.73, 57.30],
    C1: [32.57, 39.95], C2: [33.12, 40.49], C3: [32.96, 41.61], C4: [32.80, 42.72],
    C7: [30.12, 44.57], C8: [30.28, 43.46], C9: [30.44, 42.36], C10: [30.60, 41.25],
    C11: [31.72, 38.12], C12: [31.86, 37.00],
  };
  for (const gate of gates) {
    const [latitudeSeconds, longitudeSeconds] = seconds[gate.name];
    const lat = 18 + 2 / 60 + latitudeSeconds / 3600;
    const lon = -(63 + 6 / 60 + longitudeSeconds / 3600);
    const reference = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - reference.x, position.y - reference.y) * 1852 < 22, gate.name);
  }
});
