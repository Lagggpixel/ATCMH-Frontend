import assert from "node:assert/strict";
import test from "node:test";
import {hitFixSymbol, layoutFixLabels, projectFixSymbols, selectScopeFixes} from "./scope-fix-labels";

const size = {width: 800, height: 600}, camera = {center: {x: 0, y: 0}, scale: 10};
const measure = (name: string) => name.length * 7;
const fixes = Array.from({length: 441}, (_,i) => ({id: `F${String(i).padStart(4, "0")}`, point: {x: (i % 21 - 10) * 2, y: (Math.floor(i / 21) - 10) * 2}}));

test("fix selection stays stable while zooming reveals detail and preserves routes and navaids", () => {
  const candidates = [...fixes, {id: "VOR", point: {x: 0, y: 0}, waypointType: "VOR"}];
  const route = [{x: 2, y: 2, name: "F0242"}];
  const wide = selectScopeFixes(candidates, route, 4);
  const close = selectScopeFixes(candidates, route, 20);
  const ids = (items: typeof candidates) => items.map(item => item.id).sort();
  assert.ok(wide.length < close.length && close.length < candidates.length);
  assert.ok(wide.some(fix => fix.id === "F0242") && wide.some(fix => fix.id === "VOR"));
  assert.deepEqual(ids(wide), ids(selectScopeFixes([...candidates].reverse(), route, 4)));
  assert.ok(wide.every(item => close.some(other => other.id === item.id)), "coarse cell winners survive finer cells");
});

test("route names survive a completely crowded cluster", () => {
  const points = [{id: "ROUTE", point: {x: 0, y: 0}}, {id: "OTHER", point: {x: 0, y: 0}}];
  const symbols = projectFixSymbols(points, [{x: 0, y: 0, name: "ROUTE"}], camera, size);
  assert.ok(layoutFixLabels(symbols, size, measure, "auto").some(label => label.symbol.id === "ROUTE"));
});

test("dense auto labels declutter while every visible fix keeps its symbol", () => {
  const symbols = projectFixSymbols(fixes, undefined, camera, size);
  const labels = layoutFixLabels(symbols, size, measure, "auto");
  assert.equal(symbols.length, fixes.length);
  assert.ok(labels.length > 0 && labels.length < symbols.length / 2);
  for (const label of labels) {
    assert.ok(label.x >= 4 && label.y >= 4 && label.x + label.width <= size.width - 4 && label.y + label.height <= size.height - 4);
    for (const other of labels) {
      if (label === other) continue;
      assert.ok(label.x + label.width + 8 <= other.x || other.x + other.width + 8 <= label.x || label.y + label.height + 8 <= other.y || other.y + other.height + 8 <= label.y, "Names must keep an eight-pixel gap");
    }
    for (const symbol of symbols) assert.ok(label.x + label.width + 4 <= symbol.x - 4 || label.x - 4 >= symbol.x + 4 || label.y + label.height + 4 <= symbol.y - 4 || label.y - 4 >= symbol.y + 4, "Names must not cover fix symbols");
  }
});

test("selected route wins contested space and can place a name on another side", () => {
  const cluster = [{id: "BG2", point: {x: 0, y: 0}}, {id: "ROUTE", point: {x: 0, y: 1.8}}];
  assert.deepEqual(layoutFixLabels(projectFixSymbols(cluster, undefined, camera, size), size, measure, "auto").map(label => label.symbol.id), ["BG2"]);
  const symbols = projectFixSymbols(cluster, [{x: .0001, y: 1.8, name: "ROUTE"}], camera, size);
  assert.equal(symbols[0].id, "ROUTE");
  assert.equal(layoutFixLabels(symbols, size, measure, "auto")[0].symbol.id, "ROUTE");
  const blockedRight = projectFixSymbols([{id: "ROUTE", point: {x: 0, y: 0}}, {id: "BLOCK", point: {x: 0, y: -2}}], [{x: 0, y: 0}], camera, size);
  const label = layoutFixLabels(blockedRight, size, measure, "auto").find(label => label.symbol.id === "ROUTE")!;
  assert.ok(label);
  assert.ok(label.x + label.width < 400, "Route name should use the free left side");
});

test("zooming in reveals more names at the same font size", () => {
  const wide = projectFixSymbols(fixes, undefined, {...camera, scale: 4}, size);
  const close = projectFixSymbols(fixes, undefined, {...camera, scale: 12}, size);
  assert.equal(wide.length, close.length);
  const wideLabels = layoutFixLabels(wide, size, measure, "auto"), closeLabels = layoutFixLabels(close, size, measure, "auto");
  assert.ok(closeLabels.length > wideLabels.length);
  assert.ok([...wideLabels, ...closeLabels].every(label => label.height === 14 && label.width === measure(label.symbol.id)));
});

test("catalogue reorder and repeat layouts are stable; a small pan keeps interior names", () => {
  const symbols = projectFixSymbols(fixes, undefined, camera, size);
  assert.deepEqual(projectFixSymbols([...fixes].reverse(), undefined, camera, size), symbols);
  const ids = (scale: typeof camera) => layoutFixLabels(projectFixSymbols(fixes, undefined, scale, size), size, measure, "auto").map(label => label.symbol.id);
  assert.deepEqual(ids(camera), ids(camera));
  assert.deepEqual(ids(camera), ids({...camera, center: {x: .1, y: .1}}));
});

test("All and None affect only names; offscreen fixes are culled by viewport", () => {
  const symbols = projectFixSymbols([...fixes, {id: "OFFSCREEN", point: {x: 200, y: 200}}], undefined, camera, size);
  assert.equal(symbols.length, fixes.length);
  assert.equal(layoutFixLabels(symbols, size, measure, "all").length, fixes.length);
  assert.deepEqual(layoutFixLabels(symbols, size, measure, "none"), []);
  assert.equal(symbols.length, fixes.length);
  assert.deepEqual(layoutFixLabels([], size, measure, "auto"), []);
});

test("names near viewport edges remain readable and hit testing finds even hidden labels", () => {
  const symbols = projectFixSymbols([{id: "EDGE", point: {x: 39, y: 0}}, {id: "CENTER", point: {x: 0, y: 0}}], [{x: 39, y: 0}], camera, size);
  const edge = layoutFixLabels(symbols, size, measure, "auto").find(label => label.symbol.id === "EDGE")!;
  assert.ok(edge && edge.x + edge.width < 790);
  assert.equal(hitFixSymbol(symbols, {x: 790, y: 300})?.id, "EDGE");
  assert.equal(hitFixSymbol(symbols, {x: 400, y: 309})?.id, "CENTER");
  assert.equal(hitFixSymbol(symbols, {x: 400, y: 320}), undefined);
  assert.equal(hitFixSymbol(symbols, {x: 400, y: 320}, 22)?.id, "CENTER");
  assert.equal(hitFixSymbol(symbols, {x: 0, y: 0}), undefined);
});
