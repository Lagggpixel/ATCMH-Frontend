import assert from "node:assert/strict";
import test from "node:test";
import {approachGuide} from "./approach-guides";
import {distance, runwayGeometry} from "./engine";

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
