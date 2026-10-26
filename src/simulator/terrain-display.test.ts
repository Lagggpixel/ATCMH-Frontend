import assert from "node:assert/strict";
import test from "node:test";
import {drawTerrain, stepTerrainReference, terrainClass, terrainElevationAt, terrainExtremes, terrainFigureColor, terrainHundreds, TERRAIN_COLORS} from "./terrain-display";
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

test("peaks mode splits ground from 500 ft above the field to the highest point into three densities", () => {
  // Field 7,800: floor 8,300, range 5,700 to the 14,000 ft peak.
  assert.equal(terrainClass(13000, undefined, peaks), "greenHigh");
  assert.equal(terrainClass(11000, undefined, peaks), "greenLow");
  assert.equal(terrainClass(8500, undefined, peaks), "greenFaint");
  assert.equal(terrainClass(8200, undefined, peaks), undefined);
  // Gentle country still shows its hills; flat ground near the field stays black.
  assert.equal(terrainClass(2000, undefined, {max: 2600, field: 100}), "greenHigh");
  assert.equal(terrainClass(700, undefined, {max: 2600, field: 100}), "greenFaint");
  assert.equal(terrainClass(400, undefined, {max: 900, field: 80}), undefined);
});

test("the manual reference steps through whole thousands above the field and back to AUTO", () => {
  assert.equal(stepTerrainReference(0, 1, 7820), 9000);
  assert.equal(stepTerrainReference(9000, 1, 7820), 10000);
  assert.equal(stepTerrainReference(9000, -1, 7820), 0);
  assert.equal(stepTerrainReference(0, -1, 7820), 0);
  assert.equal(stepTerrainReference(0, 1, 80), 2000);
  assert.equal(stepTerrainReference(25000, 1, 80), 25000);
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

function dots(elevation: number, camera: {center: {x: number; y: number}; scale: number}) {
  const drawn: {x: number; y: number; alpha: number}[] = [];
  const ctx = {fillStyle: "", globalAlpha: 1, save() {}, restore() {}, fillRect(x: number, y: number) {drawn.push({x, y, alpha: this.globalAlpha});}};
  drawTerrain(ctx as unknown as CanvasRenderingContext2D, grid([elevation, elevation, elevation, elevation], 2, 400), camera, {width: 240, height: 240}, 11000, 7800);
  return drawn;
}

test("dense bands draw about four times as many dots as sparse ones", () => {
  const camera = {center: {x: 0, y: 0}, scale: 6};
  const dense = dots(14000, camera).length, sparse = dots(10600, camera).length;
  assert.ok(dense / sparse > 3.5 && dense / sparse < 4.6, `${dense} / ${sparse}`);
  assert.equal(dots(5000, camera).length, 0);
});

test("terrain dots stay pinned to the map while panning and fade in between zoom doublings", () => {
  const key = (list: {x: number; y: number}[], dx = 0) => new Set(list.map(d => `${(d.x + dx).toFixed(3)},${d.y.toFixed(3)}`));
  // Panning by a whole number of lattice cells moves every dot with the map.
  const before = dots(14000, {center: {x: 0, y: 0}, scale: 6}), after = dots(14000, {center: {x: 2, y: 0}, scale: 6});
  const moved = key(after, 12), common = [...key(before)].filter(item => moved.has(item));
  assert.ok(common.length > before.length * .8);
  // Halfway between doublings the in-between dots are half-faded; just past a doubling they are gone.
  const half = dots(14000, {center: {x: 0, y: 0}, scale: 6 / 2 ** .5});
  assert.ok(half.some(d => Math.abs(d.alpha - .375) < .01) && half.some(d => d.alpha === .75));
  const zoomedOut = dots(14000, {center: {x: 0, y: 0}, scale: 6 / 1.999});
  assert.ok(zoomedOut.every(d => d.alpha === .75));
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
