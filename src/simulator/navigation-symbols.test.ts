import assert from "node:assert/strict";
import test from "node:test";
import {navigationGlyphs, navigationKind} from "./navigation-symbols";
import {scopeNavigationFixes} from "./scope-overlays";
import {layoutFixLabels, projectFixSymbols} from "./scope-fix-labels";

test("IF navaid classes use source metadata, with a distinct TACAN subtype and a safe legacy fallback", () => {
  assert.equal(navigationKind({waypointType: "NDB"}), "ndb");
  assert.equal(navigationKind({waypointType: "VOR"}), "vor");
  for (const vorType of ["TACAN", "1"]) assert.equal(navigationKind({waypointType: "VOR", vorType}), "tacan");
  for (const vorType of ["VOR", "VORTAC", "0", "2"]) assert.equal(navigationKind({waypointType: "VOR", vorType}), "vor");
  assert.equal(navigationKind({waypointType: "TACAN"}), "tacan");
  assert.equal(navigationKind({}), "fix");
  assert.equal(navigationKind({waypointType: "unrecognised", vorType: "TACAN"}), "fix");
  assert.equal(new Set(Object.values(navigationGlyphs)).size, 4);
});

test("Fixes and Navaids switches independently filter backgrounds while the selected ATC route survives every combination", () => {
  const fixes = ["Fix", "NDB", "VOR", "VOR"].map((waypointType, index) => ({id: `P${index}`, point: {x: index * 3, y: 0}, waypointType, ...(index === 3 ? {vorType: "TACAN"} : {})}));
  const route = [{...fixes[2].point, name: "P2", waypointType: "VOR"}, {x: 15, y: 0, name: "SAVED"}];
  const camera = {center: {x: 0, y: 0}, scale: 10}, size = {width: 800, height: 600};
  for (const showFixes of [false, true]) for (const showNavaids of [false, true]) {
    const symbols = projectFixSymbols(scopeNavigationFixes(fixes, route, showFixes, showNavaids), route, camera, size);
    assert.deepEqual(symbols.filter(symbol => symbol.route).map(symbol => symbol.id).sort(), ["P2", "SAVED"]);
    assert.equal(symbols.some(symbol => symbol.id === "P0"), showFixes);
    assert.equal(symbols.some(symbol => symbol.id === "P1"), showNavaids);
    assert.equal(symbols.some(symbol => symbol.id === "P3"), showNavaids);
    const vor = symbols.find(symbol => symbol.id === "P2")!;
    assert.equal(vor.background, showNavaids);
    assert.equal(vor.kind, showNavaids ? "vor" : "fix");
    assert.equal(symbols.find(symbol => symbol.id === "SAVED")!.background, false);
    assert.equal(new Set(symbols.map(symbol => symbol.key)).size, symbols.length);
  }
});

test("IF label visibility follows every displayed symbol and centres identifiers underneath", () => {
  const size = {width: 800, height: 600};
  const symbols = projectFixSymbols([{id: "ABC", point: {x: 0, y: 0}, waypointType: "NDB"}], undefined, {center: {x: 0, y: 0}, scale: 10}, size);
  const labels = layoutFixLabels(symbols, size, name => name.length * 8, "all");
  assert.equal(symbols[0].kind, "ndb");
  assert.equal(labels.length, 1);
  assert.equal(labels[0].x + labels[0].width / 2, symbols[0].x);
  assert.equal(labels[0].y + labels[0].height / 2, symbols[0].y + 20);
});
