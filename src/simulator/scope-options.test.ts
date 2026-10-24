import assert from "node:assert/strict";
import test from "node:test";
import {initialOptions, scopeOptionRows, toggleTrafficFilter, trafficFilters, trafficVisible} from "./scope-options";
import {ALTITUDES, altitudeLabel} from "./radar";
import {windAltitudeChoices, windAtAltitude} from "./scope-map-data";

test("scope controls match IF's names, fresh ATC defaults and traffic submenu", () => {
  assert.deepEqual(scopeOptionRows.map(([, label]) => label), ["Fixes", "Navaids", "Airspaces", "Taxiways", "Approaches", "Uncontrolled Airports", "Aircraft Trails", "Only Trails On Frequency"]);
  assert.equal(initialOptions.waypoints, false); assert.equal(initialOptions.navaids, false);
  assert.equal(initialOptions.airspaces, true); assert.equal(initialOptions.windsAloft, false);
  assert.equal(trafficFilters.length, 6);
  assert.equal(toggleTrafficFilter("15000", "15000"), "none");
  assert.equal(toggleTrafficFilter("15000", "20000"), "20000");
});
test("altitude filters preserve tuned aircraft and inclusive thresholds", () => {
  for (const altitude of [0, 9999, 10000, 10001, 14999, 15000, 15001, 29999, 30000, 30001]) {
    for (const [filter] of trafficFilters) {
      assert.equal(trafficVisible({altitude, frequency: "approach"}, filter, "approach"), true);
      const inBand = filter === "below15" ? altitude >= 15000 : altitude <= Number(filter);
      assert.equal(trafficVisible({altitude, frequency: "tower"}, filter, "approach"), inBand);
      assert.equal(trafficVisible({altitude, frequency: "approach"}, filter, "all"), inBand);
    }
  }
  assert.equal(trafficVisible({altitude: 18000, frequency: "approach"}, "15000", "approach"), true);
  assert.equal(trafficVisible({altitude: 18000, frequency: "tower"}, "15000", "approach"), false);
});
test("IF uses feet through 17000 and flight levels from FL180, separate from the 15K filter", () => {
  assert.equal(altitudeLabel(ALTITUDES.find(a => a.unit === "feet" && a.value === 15000)!), "15,000ft");
  assert.equal(altitudeLabel(ALTITUDES.find(a => a.unit === "feet" && a.value === 17000)!), "17,000ft");
  assert.deepEqual(ALTITUDES.find(a => a.unit === "flight-level"), {unit: "flight-level", value: 180});
  assert.deepEqual(windAltitudeChoices.map(([, label]) => label), ["AUTO", "SURFACE", "3,000ft", "8,000ft", "13,000ft", "FL180", "FL230", "FL280", "FL330", "FL380", "FL430"]);
});
test("winds interpolate directions through north and do not invent above-model or underground samples", () => {
  const profile = {point: {x: 0, y: 0}, surface: {altitude: 100, speed: 5, direction: 0}, levels: [{altitude: 1000, speed: 20, direction: 350}, {altitude: 3000, speed: 20, direction: 10}]};
  const value = windAtAltitude(profile, 2000)!;
  assert.ok(Math.abs(value.direction) < 1e-9); assert.ok(value.speed > 19 && value.speed < 20);
  assert.equal(windAtAltitude(profile, 0), profile.surface);
  assert.equal(windAtAltitude(profile, 50), undefined);
  assert.equal(windAtAltitude(profile, 4000), undefined);
});
