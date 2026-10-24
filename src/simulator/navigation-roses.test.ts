import assert from "node:assert/strict";
import test from "node:test";
import {COMPASS_ROSE_RADIUS_NM, compassRoseBearings, compassRoseTick, projectCompassRoses} from "./navigation-roses";
import {scopeNavigationFixes} from "./scope-overlays";

const camera = {center: {x: 0, y: 0}, scale: 10}, viewport = {width: 800, height: 600};
const fixes = [
  {id: "FIX", point: {x: -20, y: 0}, waypointType: "Fix"},
  {id: "NDB", point: {x: -10, y: 0}, waypointType: "NDB"},
  {id: "VOR", point: {x: 0, y: 0}, waypointType: "VOR", slavedVariation: -12},
  {id: "VORTAC", point: {x: 10, y: 0}, waypointType: "VOR", vorType: "VORTAC"},
  {id: "TACAN", point: {x: 20, y: 0}, waypointType: "VOR", vorType: "TACAN"},
];

test("roses belong to background VOR-family aids, never ordinary fixes, NDBs or route-only points", () => {
  const route = [{x: 0, y: 0, name: "VOR", waypointType: "VOR"}];
  for (const showFixes of [true, false]) {
    const shown = projectCompassRoses(scopeNavigationFixes(fixes, route, showFixes, true), camera, viewport);
    assert.equal(shown.length, 3); assert.equal(shown[0].variation, -12);
    const hidden = scopeNavigationFixes(fixes, route, showFixes, false);
    assert.ok(hidden.some(fix => fix.id === "VOR" && fix.routeOnly));
    assert.deepEqual(projectCompassRoses(hidden, camera, viewport), []);
  }
});

test("rose radius follows map scale and its centre follows pan without moving the navaid", () => {
  const wide = projectCompassRoses([fixes[2]], camera, viewport)[0];
  const close = projectCompassRoses([fixes[2]], {...camera, scale: 20}, viewport)[0];
  assert.equal(wide.radius, COMPASS_ROSE_RADIUS_NM * camera.scale);
  assert.equal(close.radius, wide.radius * 2);
  const panned = projectCompassRoses([fixes[2]], {...camera, center: {x: 2, y: -3}}, viewport)[0];
  assert.equal(panned.x, wide.x - 20); assert.equal(panned.y, wide.y - 30);
  assert.equal(panned.radius, wide.radius);
});

test("offscreen rings retain visible north spokes while unrelated offscreen geometry is culled", () => {
  const fix = {...fixes[2], point: {x: -45, y: 0}};
  assert.equal(projectCompassRoses([fix], camera, viewport).length, 1);
  assert.deepEqual(projectCompassRoses([{...fix, point: {x: -80, y: 0}}], camera, viewport), []);
  // The ring is outside the view, but the spoke from the visible station to north is not.
  assert.equal(projectCompassRoses([fixes[2]], {...camera, scale: 100}, viewport).length, 1);
  // A station below the viewport can also have a north spoke passing through it.
  assert.equal(projectCompassRoses([{...fixes[2], point: {x: 0, y: -4}}], {...camera, scale: 100}, viewport).length, 1);
  // A station above the viewport has its north spoke pointing away from the view.
  assert.deepEqual(projectCompassRoses([{...fixes[2], point: {x: 0, y: 4}}], {...camera, scale: 100}, viewport), []);
  assert.deepEqual(projectCompassRoses([fixes[2]], {...camera, scale: 0}, viewport), []);
});

test("magnetic north has a full spoke and the other 35 bearings retain short ticks", () => {
  assert.deepEqual(compassRoseBearings, Array.from({length: 36}, (_, index) => index * 10));
  const rose = {x: 400, y: 300, radius: 100, variation: 0};
  assert.deepEqual(compassRoseTick(rose, 0), {outer: {x: 400, y: 200}, inner: {x: 400, y: 300}});
  assert.deepEqual(compassRoseTick(rose, 360).inner, {x: 400, y: 300});
  const east = compassRoseTick(rose, 90); assert.equal(east.outer.x, 500); assert.equal(east.outer.y, 300);
  assert.equal(east.inner.x, 490);
  const adjusted = compassRoseTick({...rose, variation: 30}, 0);
  assert.ok(Math.abs(adjusted.outer.x - 450) < 1e-9);
  assert.ok(adjusted.outer.y < rose.y);
  assert.deepEqual(adjusted.inner, {x: 400, y: 300});
  for (const bearing of compassRoseBearings.slice(1)) {
    const tick = compassRoseTick(rose, bearing);
    assert.ok(Math.abs(Math.hypot(tick.inner.x - rose.x, tick.inner.y - rose.y) - 90) < 1e-9);
  }
});
