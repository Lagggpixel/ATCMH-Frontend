import assert from "node:assert/strict";
import test from "node:test";
import {clampCamera, mapCameraAltitude, mapCameraScale, ScopeCameraMotion, transformCamera, type MapCamera} from "./scope-camera";

const size = {width: 1000, height: 800};
const point = {x: 700, y: 300};
const initial = (): MapCamera => ({center: {x: 3, y: -5}, scale: 100});
const fixture = () => new ScopeCameraMotion(initial(), size);
const world = (camera: MapCamera, p = point) => ({x: camera.center.x + (p.x - size.width / 2) / camera.scale, y: camera.center.y - (p.y - size.height / 2) / camera.scale});
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function samePoint(a: {x: number; y: number}, b: {x: number; y: number}) {close(a.x, b.x); close(a.y, b.y);}

test("panning follows map coordinates at different zoom levels", () => {
  for (const scale of [1, 10, 100, 1000]) {
    const motion = fixture(); motion.camera.scale = scale;
    const anchor = world(motion.camera);
    motion.down(1, point, 0, "touch");
    motion.move(1, {x: 750, y: 340}, 20);
    samePoint(world(motion.camera, {x: 750, y: 340}), anchor);
    assert.equal(motion.up(1, 25), false);
  }
});

test("doubling pinch spacing doubles scale and moves the anchored midpoint", () => {
  const m = fixture(), before = world(m.camera, {x: 500, y: 400});
  m.down(1, {x: 400, y: 400}, 0, "touch"); m.down(2, {x: 600, y: 400}, 1, "touch");
  m.move(1, {x: 300, y: 400}, 20); m.move(2, {x: 700, y: 400}, 21);
  close(m.camera.scale, 200); samePoint(world(m.camera, {x: 500, y: 400}), before);
  m.move(1, {x: 350, y: 440}, 40); m.move(2, {x: 750, y: 440}, 41);
  close(m.camera.scale, 200); samePoint(world(m.camera, {x: 550, y: 440}), before);
});

test("two-to-one transition and automatic lost capture do not jump or click", () => {
  const m = fixture();
  m.down(1, {x: 400, y: 400}, 0, "touch"); m.down(2, {x: 600, y: 400}, 1, "touch");
  m.move(2, {x: 800, y: 400}, 20);
  assert.equal(m.up(2, 30), false); m.cancel(2);
  const before = structuredClone(m.camera);
  m.move(1, {x: 400, y: 400}, 40); assert.deepEqual(m.camera, before);
  m.move(1, {x: 420, y: 400}, 60);
  close(m.camera.center.x, before.center.x - 20 / before.scale);
  assert.equal(m.up(1, 70), false);
});

test("pinch rotation does not rotate the scope", () => {
  const m = fixture();
  m.down(1, {x: 400, y: 400}, 0, "touch"); m.down(2, {x: 600, y: 400}, 1, "touch");
  m.move(1, {x: 500, y: 300}, 20); m.move(2, {x: 500, y: 500}, 21);
  close(m.camera.scale, 100); samePoint(m.camera.center, initial().center);
  assert.deepEqual(Object.keys(m.camera).sort(), ["center", "scale"]);
});

test("swipes coast after release, decay and stop without frame-rate dependence", () => {
  function swipe() {
    const m = fixture(); m.down(1, point, 0, "touch"); m.move(1, {x: 800, y: 300}, 20); m.up(1, 25); m.cancel(1); return m;
  }
  const slow = swipe(), fast = swipe(), before = slow.camera.center.x;
  slow.step(32); fast.step(16); fast.step(16);
  close(slow.camera.center.x, fast.camera.center.x); assert.ok(slow.camera.center.x < before);
  const first = before - slow.camera.center.x, next = slow.camera.center.x;
  slow.step(32); assert.ok(next - slow.camera.center.x < first);
  for (let i = 0; i < 300; i++) slow.step(16);
  assert.equal(slow.step(16), false);
});

test("holding still before release prevents stale swipe inertia", () => {
  const m = fixture(); m.down(1, point, 0, "mouse"); m.move(1, {x: 800, y: 300}, 20); m.up(1, 200);
  const before = structuredClone(m.camera); assert.equal(m.step(16), false); assert.deepEqual(m.camera, before);
});

for (const type of ["touch", "mouse", "pen"]) test(`${type} double-press drag zooms in/up and out/down around the press`, () => {
  const m = fixture(), anchor = world(m.camera);
  m.down(1, point, 0, type); assert.equal(m.up(1, 20), true);
  m.down(1, point, 100, type); m.move(1, {x: point.x, y: point.y - 75 * Math.log(2)}, 120);
  close(m.camera.scale, 200); samePoint(world(m.camera), anchor);
  m.move(1, {x: point.x, y: point.y + 75 * Math.log(2)}, 140);
  close(m.camera.scale, 50); samePoint(world(m.camera), anchor);
  assert.equal(m.up(1, 150), false); assert.equal(m.step(16), false);
});

test("double-press does not steal rapid scenario point-placement taps", () => {
  const m = fixture();
  for (const at of [0, 100, 200]) {m.down(1, point, at, "mouse", false); assert.equal(m.up(1, at + 10), true);}
  assert.deepEqual(m.camera, initial());
});

test("distant, expired, long-held and mixed-input taps do not initiate double zoom", () => {
  for (const [at, p, type, release] of [[400, point, "touch", 10], [100, {x: 900, y: 300}, "touch", 10], [100, point, "mouse", 10], [600, point, "touch", 500]] as const) {
    const m = fixture(); m.down(1, point, 0, "touch"); m.up(1, release);
    m.down(1, p, at, type); m.move(1, {x: p.x, y: p.y - 50}, at + 20);
    assert.equal(m.camera.scale, 100);
  }
});

test("a second finger takes over double-press zoom without a stale anchor", () => {
  const m = fixture(); m.down(1, point, 0, "touch"); m.up(1, 10); m.down(1, point, 100, "touch");
  m.down(2, {x: 800, y: 300}, 110, "touch");
  m.move(2, {x: 900, y: 300}, 130); close(m.camera.scale, 200);
  assert.equal(m.up(2, 140), false); assert.equal(m.up(1, 150), false);
});

test("wheel pixels/lines/pages and trackpad magnification anchor both zoom directions", () => {
  for (const mode of [0, 1, 2]) for (const magnify of [false, true]) {
    const m = fixture(), anchor = world(m.camera);
    m.wheel(point, -.1, mode, magnify); assert.ok(m.camera.scale > 100); samePoint(world(m.camera), anchor);
    m.wheel(point, .1, mode, magnify); close(m.camera.scale, 100); samePoint(world(m.camera), anchor);
  }
});

test("clamped zoom still anchors the pointer and respects scope limits", () => {
  for (const scale of [.5, 8, 1800]) for (const factor of [.000001, 1000000]) {
    const before = {...initial(), scale}, anchor = world(before);
    const after = transformCamera(before, size, point, point, factor);
    close(mapCameraAltitude(after, size), factor < 1 ? 10000000 : 100); samePoint(world(after), anchor);
  }
});

test("all viewport heights have IF's 100 m to 10,000 km limits without the old scale caps", () => {
  for (const height of [390, 768, 800, 1000, 2160]) {
    const viewport = {...size, height};
    const nearest = clampCamera({...initial(), scale: 1e9}, viewport);
    const furthest = clampCamera({...initial(), scale: 1e-9}, viewport);
    close(mapCameraAltitude(nearest, viewport), 100);
    close(mapCameraAltitude(furthest, viewport) / 10000000, 1);
    assert.ok(nearest.scale > 1800); assert.ok(furthest.scale < .5);
    close(nearest.scale / furthest.scale, 100000);
    close(mapCameraScale(100, height), nearest.scale);
    samePoint(nearest.center, initial().center); samePoint(furthest.center, initial().center);
    assert.equal(clampCamera(initial(), viewport).scale, 100);
  }
});

test("camera restore, recentering and viewport resize clamp to the current height", () => {
  const m = new ScopeCameraMotion({...initial(), scale: 1e9}, size);
  close(mapCameraAltitude(m.camera, size), 100);
  m.reset({...initial(), scale: 1e-9});
  close(mapCameraAltitude(m.camera, size) / 10000000, 1);
  const shorter = {...size, height: 390};
  m.reset({...initial(), scale: mapCameraScale(100, size.height)});
  const resized = clampCamera(m.camera, shorter);
  close(mapCameraAltitude(resized, shorter), 100);
  samePoint(resized.center, initial().center);
  assert.ok(Number.isFinite(clampCamera(initial(), {...size, height: 0}).scale));
});

test("wheel, native magnification, pinch, double-press and animated buttons obey both bounds", () => {
  for (const direction of [-1, 1]) {
    const expected = direction > 0 ? 100 : 10000000;
    const check = (m: ScopeCameraMotion) => close(mapCameraAltitude(m.camera, size) / expected, 1);
    const wheel = fixture();
    for (let i = 0; i < 5; i++) wheel.wheel(point, -direction * 1e6, 0, true);
    check(wheel);
    const native = fixture(); native.magnify(point, direction > 0 ? 1e9 : 1e-9); check(native);
    const pinch = fixture();
    pinch.down(1, point, 0, "touch"); pinch.down(2, {x: point.x + 100, y: point.y}, 1, "touch");
    if (direction > 0) pinch.move(2, {x: point.x + 1e9, y: point.y}, 20);
    else {pinch.camera.scale = mapCameraScale(10000000, size.height) * 2; pinch.move(2, {x: point.x + 2, y: point.y}, 20);}
    check(pinch);
    const double = fixture(); double.down(1, point, 0, "touch"); double.up(1, 10);
    double.down(1, point, 100, "touch"); double.move(1, {x: point.x, y: point.y - direction * 3000}, 120); check(double);
    const buttons = fixture(); buttons.zoom(direction > 0 ? 1e9 : 1e-9);
    for (let i = 0; i < 300; i++) buttons.step(16);
    check(buttons);
  }
});

test("native magnification uses scale ratios and ignores invalid samples", () => {
  const m = fixture(), anchor = world(m.camera);
  m.magnify(point, 1.25); m.magnify(point, 1.5 / 1.25);
  close(m.camera.scale, 150); samePoint(world(m.camera), anchor);
  const before = structuredClone(m.camera);
  for (const factor of [0, -1, NaN, Infinity]) {m.magnify(point, factor); assert.deepEqual(m.camera, before);}
});

test("buttons zoom smoothly, decay and preserve the map centre", () => {
  for (const factor of [1.4, 1 / 1.4]) {
    const m = fixture(); m.zoom(factor); assert.deepEqual(m.camera, initial());
    assert.equal(m.step(16), true); assert.ok(Math.abs(m.camera.scale - 100) < Math.abs(100 * factor - 100));
    for (let i = 0; i < 300; i++) m.step(16);
    assert.ok(Math.abs(m.camera.scale - 100 * factor) < .1); samePoint(m.camera.center, initial().center);
  }
});

test("cancel, new press and recenter stop motion; unknown lost capture is harmless", () => {
  for (const action of [(m: ScopeCameraMotion) => m.cancel(), (m: ScopeCameraMotion) => m.down(2, point, 50, "touch"), (m: ScopeCameraMotion) => m.reset(initial())]) {
    const m = fixture(); m.down(1, point, 0, "touch"); m.move(1, {x: 800, y: 300}, 20); m.up(1, 30);
    action(m); const before = structuredClone(m.camera); assert.equal(m.step(16), false); assert.deepEqual(m.camera, before);
  }
});

test("route editing tracks fingers without moving the camera or starting inertia", () => {
  const m = fixture(); m.down(1, point, 0, "touch"); m.move(1, {x: 800, y: 300}, 20, false);
  assert.deepEqual(m.camera, initial()); m.cancel(1); assert.equal(m.step(16), false);
  assert.equal(m.up(1, 30), false);
});
