import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {buildGroundRoute, destinationAt, groundRouteError} from "./ground-route";
import {BRUSSELS_25L_C4, DUBLIN_16_N, planIntersectionTaxiRoute} from "./intersection-taxi-routing";
import {gatesFor, standPlacement} from "./scenarios";

test("an explicitly selected Brussels C4 entry survives route reconstruction", () => {
  const airport = getAirport({airport: "EBBR"});
  for (const name of ["965", "230R", "512"]) {
    const stand = gatesFor(airport).find(gate => gate.name === name)!;
    const start = standPlacement(stand.id, false, airport)!.position;
    const planned = planIntersectionTaxiRoute(airport, start, "25L", "C4");
    assert.ok(planned.path, name);
    const target = planned.path.at(-1)!;
    const inferred = destinationAt(airport, target);
    assert.ok(inferred.type !== "runway" || inferred.id !== "25L", "C4 is closer to the reciprocal runway end");
    const built = buildGroundRoute(airport, "taxi", [start, target], {type: "runway", id: "25L"});
    assert.ok(built.route, `${name}: ${built.error}`);
    assert.ok(Math.hypot(built.route.points.at(-1)!.x - BRUSSELS_25L_C4.hold.x, built.route.points.at(-1)!.y - BRUSSELS_25L_C4.hold.y) < 1e-6);
    assert.equal(built.route.points.at(-1)!.runway, "25L");
    assert.equal(groundRouteError(airport, built.route, "taxi"), null);
  }
});

test("an explicitly selected Dublin N entry survives route reconstruction", () => {
  const airport = getAirport({airport: "EIDW"});
  const stand = gatesFor(airport).find(gate => gate.name === "109C")!;
  const start = standPlacement(stand.id, false, airport)!.position;
  const planned = planIntersectionTaxiRoute(airport, start, "16", "N");
  assert.ok(planned.path, planned.error);
  const built = buildGroundRoute(airport, "taxi", [start, planned.path.at(-1)!], {type: "runway", id: "16"});
  assert.ok(built.route, built.error);
  assert.ok(Math.hypot(built.route.points.at(-1)!.x - DUBLIN_16_N.hold.x, built.route.points.at(-1)!.y - DUBLIN_16_N.hold.y) < 1e-6);
  assert.equal(groundRouteError(airport, built.route, "taxi"), null);
});
