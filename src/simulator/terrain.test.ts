import assert from "node:assert/strict";
import test from "node:test";
import {defaultAirport} from "./airports";
import {terrainCoordinates, terrainElevation, rawTerrainElevation, terrainFeet} from "./terrain";

test("terrain coordinates use the airport origin and elevation rounds up to 100ft", () => {
  const point = terrainCoordinates(defaultAirport, {x: 60, y: 60});
  assert.equal(point.latitude, defaultAirport.origin.lat + 1);
  assert.equal(point.longitude, defaultAirport.origin.lon + 1 / Math.cos(defaultAirport.origin.lat * Math.PI / 180));
  assert.equal(terrainFeet(10761.15), 10800); assert.equal(terrainFeet(0), 0); assert.equal(terrainFeet(1), 100);
});
test("terrain lookup validates data, caches successes and permits retry after failures", async () => {
  const original = globalThis.fetch; let requests = 0;
  try {
    globalThis.fetch = async () => {requests++; return new Response(JSON.stringify({elevationFt: 10761.15}));};
    const signal = new AbortController().signal;
    assert.equal(await terrainElevation(10, 20, signal), 10800); assert.equal(await terrainElevation(10, 20, signal), 10800); assert.equal(requests, 1);
    assert.equal(await rawTerrainElevation(10, 20, signal), 10761.15); assert.equal(requests, 1);
    globalThis.fetch = async () => new Response(JSON.stringify({elevationFt: null}));
    await assert.rejects(terrainElevation(11, 20, signal), /Terrain unavailable/);
    globalThis.fetch = async () => new Response("", {status: 429});
    await assert.rejects(terrainElevation(11, 20, signal), /Terrain unavailable/);
    globalThis.fetch = async () => new Response(JSON.stringify({elevationFt: 1}));
    assert.equal(await terrainElevation(11, 20, signal), 100);
  } finally {globalThis.fetch = original;}
});
