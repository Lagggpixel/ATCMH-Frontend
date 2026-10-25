import assert from "node:assert/strict";
import test from "node:test";
import {approachGuide, approachGuideFromEndpoints} from "./approach-guides";
import {distance, runwayGeometry} from "./engine";
import {airportList, getAirport, runwayEnds} from "./airports";
import runwayIls from "./data/runway-ils.json";

test("every supported runway end has explicit localizer and glideslope data", () => {
  const capabilities: Record<string, Record<string, {localizer: boolean; glideslope: boolean}>> = runwayIls.airports;
  assert.deepEqual(Object.keys(capabilities).sort(), airportList.map(airport => airport.icao).sort());
  for (const airport of airportList) for (const end of runwayEnds(airport)) {
    const capability = capabilities[airport.icao]?.[end.id];
    assert.ok(capability, `${airport.icao} ${end.id} is missing ILS capability data`);
    assert.equal(typeof capability.localizer, "boolean");
    assert.equal(typeof capability.glideslope, "boolean");
  }
});

for (const [icao, ilsEnds, grayEnds] of [
  ["LTFM", ["16R", "34L", "17L", "35R", "18", "36"], ["16L", "34R", "17R", "35L"]],
  ["EIDW", ["10L", "10R", "28L", "28R", "16"], ["34"]],
  ["RJTT", ["16L", "16R", "22", "23", "34L", "34R"], ["04", "05"]],
] as const) test(`${icao}: cones use the verified capabilities of each runway end`, () => {
  const airport = getAirport({airport: icao});
  for (const runway of ilsEnds) assert.equal(approachGuide(runway, airport).color, "#dc6464", runway);
  for (const runway of grayEnds) assert.equal(approachGuide(runway, airport).color, "#808080", runway);
});

test("localizer-only ends are red even without a glideslope; uninstrumented ends stay gray", () => {
  const airport = getAirport({airport: "KBHM"});
  assert.equal(approachGuide("18", airport).color, "#dc6464");
  assert.equal(approachGuide("36", airport).color, "#808080");
  assert.equal(approachGuide("06", airport).color, "#dc6464");
});

test("nearby approach cones extend outward with endpoint-specific colors", () => {
  const threshold = {x: 5, y: 4}, departure = {x: 8, y: 8};
  const guide = approachGuideFromEndpoints(threshold, departure, true)!;
  assert.ok(Math.abs(distance(guide.center, threshold) * 1852 - 19000) < 1e-8);
  assert.ok(guide.center.x < threshold.x && guide.center.y < threshold.y);
  assert.ok(Math.abs(distance(guide.left, guide.right) * 1852 - 1991.20008) < 1e-8);
  assert.equal(guide.color, "#dc6464"); assert.equal(guide.centerColor, "#b46464");
  const opposite = approachGuideFromEndpoints(departure, threshold, false)!;
  assert.ok(opposite.center.x > departure.x && opposite.center.y > departure.y);
  assert.equal(opposite.color, "#808080"); assert.equal(opposite.centerColor, "#808080");
  assert.equal(approachGuideFromEndpoints(threshold, threshold, true), undefined);
  assert.equal(approachGuideFromEndpoints(threshold, {x: NaN, y: 0}, false), undefined);
});

test("both approach cones use IF's 19000m length and 995.60004m half-width", () => {
  for (const runway of ["06", "24"] as const) {
    const guide = approachGuide(runway), {vector} = runwayGeometry(runway);
    const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9);
    close(distance(guide.threshold, guide.center), 19000 / 1852);
    close(distance(guide.center, guide.left), 995.60004 / 1852);
    close(distance(guide.center, guide.right), 995.60004 / 1852);
    close(distance(guide.left, guide.right), 1991.20008 / 1852);
    close((guide.center.x - guide.threshold.x) * vector.x + (guide.center.y - guide.threshold.y) * vector.y, -19000 / 1852);
    close((guide.left.x - guide.center.x) * vector.x + (guide.left.y - guide.center.y) * vector.y, 0);
  }
});
