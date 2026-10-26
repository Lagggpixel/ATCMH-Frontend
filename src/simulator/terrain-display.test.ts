import assert from "node:assert/strict";
import test from "node:test";
import {drawTerrain, terrainClass, terrainElevationAt, terrainExtremes, terrainFigureColor, terrainHundreds, TERRAIN_COLORS} from "./terrain-display";
import {fetchScopeTerrain} from "./server/terrain-grid";
import type {ScopeTerrain} from "./scope-map-data";

const grid = (elevations: (number | null)[], size = 2, spacing = 10): ScopeTerrain => ({airport: "KASE", spacing, size, origin: {x: -spacing / 2 * (size - 1), y: -spacing / 2 * (size - 1)}, elevations});
const peaks = {max: 14000, field: 7800};

test("terrain is classified in EGPWS bands relative to the reference altitude", () => {
  assert.equal(terrainClass(13100, 11000, peaks), "red");
  assert.equal(terrainClass(12500, 11000, peaks), "amberHigh");
  assert.equal(terrainClass(10600, 11000, peaks), "amberLow");
  assert.equal(terrainClass(10200, 11000, peaks), "greenHigh");
  assert.equal(terrainClass(9200, 11000, peaks), "greenLow");
  assert.equal(terrainClass(8800, 11000, peaks), undefined);
  assert.equal(terrainClass(null, 11000, peaks), "noData");
});

test("peaks mode shades the highest ground in view and leaves ground near the field black", () => {
  assert.equal(terrainClass(13000, undefined, peaks), "greenHigh");
  assert.equal(terrainClass(11000, undefined, peaks), "greenLow");
  assert.equal(terrainClass(8500, undefined, peaks), undefined);
  assert.equal(terrainClass(900, undefined, {max: 900, field: 80}), undefined);
});

test("elevation is interpolated inside the grid and unknown outside or beside missing samples", () => {
  const terrain = grid([0, 1000, 2000, 3000]);
  assert.equal(terrainElevationAt(terrain, {x: 0, y: 0}), 1500);
  assert.equal(terrainElevationAt(terrain, {x: -5, y: -5}), 0);
  assert.equal(terrainElevationAt(terrain, {x: 6, y: 0}), undefined);
  assert.equal(terrainElevationAt(grid([0, null, 0, 0]), {x: 0, y: 0}), null);
});

test("readout extremes only count samples in view and figures use ND colours", () => {
  const terrain = grid([100, 200, 300, 9000, 500, 600, 700, 800, 900], 3, 50);
  assert.deepEqual(terrainExtremes(terrain, {center: {x: -50, y: -50}, scale: 10}, {width: 100, height: 100}), {max: 9000, min: 100});
  assert.equal(terrainHundreds(7820), "078"); assert.equal(terrainHundreds(14249), "142");
  assert.equal(terrainFigureColor(14200, 11000), TERRAIN_COLORS.red);
  assert.equal(terrainFigureColor(11200, 11000), TERRAIN_COLORS.amber);
  assert.equal(terrainFigureColor(7800, 11000), TERRAIN_COLORS.green);
  assert.equal(terrainFigureColor(14200, undefined), TERRAIN_COLORS.green);
});

test("dense bands draw four times as many dots as sparse ones", () => {
  const count = (elevation: number) => {
    let dots = 0;
    const ctx = {fillStyle: "", globalAlpha: 1, save() {}, restore() {}, fillRect() {dots++;}} as unknown as CanvasRenderingContext2D;
    drawTerrain(ctx, grid([elevation, elevation, elevation, elevation], 2, 100), {center: {x: 0, y: 0}, scale: 1}, {width: 64, height: 64}, 11000, 7800);
    return dots;
  };
  assert.equal(count(14000), 256); assert.equal(count(10600), 64); assert.equal(count(5000), 0);
});

test("the terrain grid samples every point once and tolerates a few missing heights", async () => {
  const seen = new Set<string>();
  let calls = 0;
  const terrain = await fetchScopeTerrain("KASE", async (lat, lon) => {
    calls++; seen.add(`${lat},${lon}`);
    if (calls % 50 === 0) throw new Error("gap");
    return 8000.4;
  }, 4);
  assert.equal(terrain.size, 61); assert.equal(terrain.elevations.length, 61 * 61);
  assert.equal(seen.size, 61 * 61);
  assert.ok(terrain.elevations.every(value => value === null || value === 8000));
  await assert.rejects(fetchScopeTerrain("KASE", async () => {throw new Error("down");}, 4));
});
