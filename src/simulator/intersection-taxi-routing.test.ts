import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";
import {planIntersectionTaxiRoute} from "./intersection-taxi-routing";

test("Brussels 25L C4 is an explicit, shorter intersection route", () => {
  const airport = getAirport({airport: "EBBR"});
  for (const name of ["965", "230R", "512"]) {
    const stand = gatesFor(airport).find(gate => gate.name === name)!;
    const position = standPlacement(stand.id, false, airport)!.position;
    assert.ok(planTaxiRoute(airport, position, "25L").error);
    const result = planIntersectionTaxiRoute(airport, position, "25L", "C4");
    assert.ok(result.path, `${name}: ${result.error}`);
    assert.equal(result.intersection, "C4");
    assert.equal(result.toraMetres, 1240);
    assert.equal(result.path.at(-1)?.runway, "25L");
    assert.ok(Math.hypot(result.path.at(-1)!.x - .4767042, result.path.at(-1)!.y + .47134617) < .000001);
  }
  const position = standPlacement(gatesFor(airport)[0].id, false, airport)!.position;
  assert.ok(planIntersectionTaxiRoute(airport, position, "25R", "C4").error);
  assert.ok(planIntersectionTaxiRoute(airport, position, "25L", "C3").error);
  const withoutC4 = {...airport, features: airport.features.filter(f => f.id !== "53270233")};
  assert.ok(planIntersectionTaxiRoute(withoutC4, position, "25L", "C4").error);
});

test("Dublin 16 N requires explicit selection and preserves the charted intersection distance", () => {
  const airport = getAirport({airport: "EIDW"});
  const stand = gatesFor(airport).find(gate => gate.name === "109C")!;
  const position = standPlacement(stand.id, false, airport)!.position;
  assert.ok(planTaxiRoute(airport, position, "16").error);
  const result = planIntersectionTaxiRoute(airport, position, "16", "N");
  assert.ok(result.path, result.error);
  assert.equal(result.toraMetres, 1653);
  assert.equal(result.intersection, "N");
  assert.equal(result.path.at(-1)?.runway, "16");
  assert.ok(Math.hypot(result.path.at(-1)!.x - .13412465982295, result.path.at(-1)!.y - .29868644856965) < .000001);
  assert.ok(planIntersectionTaxiRoute(airport, position, "34", "N").error);
  const missing = {...airport, features: airport.features.filter(f => f.id !== "963984867")};
  assert.ok(planIntersectionTaxiRoute(missing, position, "16", "N").error);
});

