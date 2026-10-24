import assert from "node:assert/strict";
import test from "node:test";
import {approachGuide, approachGuideFromEndpoints} from "./approach-guides";
import {distance, runwayGeometry} from "./engine";

test("nearby approach cones extend outward with endpoint-specific colors", () => {
  const threshold = {x: 5, y: 4}, departure = {x: 8, y: 8};
  const guide = approachGuideFromEndpoints(threshold, departure, true)!;
  assert.ok(Math.abs(distance(guide.center, threshold) - 11) < 1e-9);
  assert.ok(guide.center.x < threshold.x && guide.center.y < threshold.y);
  assert.ok(Math.abs(distance(guide.left, guide.right) - 1) < 1e-9);
  assert.equal(guide.color, "#dc6464"); assert.equal(guide.centerColor, "#b46464");
  const opposite = approachGuideFromEndpoints(departure, threshold, false)!;
  assert.ok(opposite.center.x > departure.x && opposite.center.y > departure.y);
  assert.equal(opposite.color, "#808080"); assert.equal(opposite.centerColor, "#808080");
  assert.equal(approachGuideFromEndpoints(threshold, threshold, true), undefined);
  assert.equal(approachGuideFromEndpoints(threshold, {x: NaN, y: 0}, false), undefined);
});

test("both approach cones extend outward 11 NM with a perpendicular 1 NM base", () => {
  for (const runway of ["06", "24"] as const) {
    const guide = approachGuide(runway), {vector} = runwayGeometry(runway);
    const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9);
    close(distance(guide.threshold, guide.center), 11);
    close(distance(guide.center, guide.left), .5);
    close(distance(guide.center, guide.right), .5);
    close(distance(guide.left, guide.right), 1);
    close((guide.center.x - guide.threshold.x) * vector.x + (guide.center.y - guide.threshold.y) * vector.y, -11);
    close((guide.left.x - guide.center.x) * vector.x + (guide.left.y - guide.center.y) * vector.y, 0);
  }
});
