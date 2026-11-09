import assert from "node:assert/strict";
import test from "node:test";
import {catalog, simulate, type LabInput} from "./simulate";
import {engineFor} from "../../src/simulator/engine";
import {getAirport} from "../../src/simulator/airports";

const base: LabInput = {airport: "EGLL", runway: "27L", profile: "A320", mode: "visual", east: 5, north: 4,
  heading: 225, altitude: 1500, speed: 163, windDirection: 0, windSpeed: 0, tower: true, minutes: 20};

test("the lab forecasts a visual using the simulator and records its landing", () => {
  const result = simulate(base);
  assert.equal(result.outcome, "Landed");
  assert.ok(result.events.some(event => event.label === "Joining final"));
  assert.ok(result.events.some(event => event.label === "Established on final"));
  assert.ok(result.events.some(event => event.label === "Touchdown"));
  assert.ok(result.points.length > 2);
});

test("the lab uses the real Traffic handoff and exposes the resulting pattern", () => {
  const result = simulate({...base, runway: "27R", mode: "rv", east: 8, north: 3, heading: 180, speed: 180});
  assert.equal(result.outcome, "Landed");
  assert.ok(result.events.some(event => /base|downwind/.test(event.label)));
  assert.ok(result.messages.some(message => /contacting traffic/i.test(message.text)));
});

test("the reported wide base joins directly instead of flying a downwind loop", () => {
  const result = simulate({...base, runway: "27L", mode: "rv", east: 13.5, north: 8.5, heading: 180, speed: 163});
  assert.equal(result.outcome, "Landed");
  assert.ok(result.events.some(event => event.label === "Joining base"));
  assert.ok(!result.events.some(event => /downwind/i.test(event.label)));
  assert.ok(result.elapsed < 720, `landing took ${result.elapsed} seconds`);
});

test("the reported 200-degree heading joins the wide base directly", () => {
  const result = simulate({...base, mode: "rv", east: 13.9, north: 7.1, heading: 200, speed: 163});
  assert.equal(result.outcome, "Landed");
  assert.ok(result.events.some(event => event.label === "Joining base"));
  assert.ok(!result.events.some(event => /downwind/i.test(event.label)));
  assert.ok(result.elapsed < 720, `landing took ${result.elapsed} seconds`);
});

test("visuals initially heading away can turn back onto final in wind", () => {
  const g = engineFor({airport: "EGLL"}).runwayGeometry("27L"), airport = getAirport({airport: "EGLL"});
  for (const side of [-5, 5]) for (const windDirection of [0, 180]) {
    const result = simulate({...base, east: -g.vector.x * 12 - g.vector.y * side,
      north: -g.vector.y * 12 + g.vector.x * side, heading: (g.heading + 180) % 360,
      altitude: airport.elevation + 1500, speed: 180, windDirection, windSpeed: 20, minutes: 40});
    assert.equal(result.outcome, "Landed", `side ${side}, wind ${windDirection}: ${result.reason}`);
    assert.ok(result.events.some(event => event.label === "Established on final"));
  }
});

test("traffic already established on final flies directly to the runway", () => {
  const g = engineFor({airport: "EGLL"}).runwayGeometry("27L"), airport = getAirport({airport: "EGLL"});
  const result = simulate({...base, mode: "rv", east: -g.vector.x * 10, north: -g.vector.y * 10,
    heading: g.heading, altitude: airport.elevation + 1500, speed: 180});
  assert.equal(result.outcome, "Landed");
  assert.ok(result.events.some(event => event.label === "Joining final"));
  assert.ok(!result.events.some(event => /downwind|base/.test(event.label)));
  assert.ok(result.elapsed < 600);
});

test("wide heading changes near base avoid long downwind detours", () => {
  const aircraft = [
    {airport: "EGLL", runway: "27L", profile: "A320", speed: 180},
    {airport: "EGLL", runway: "09R", profile: "A320", speed: 180},
    {airport: "KJFK", runway: "22L", profile: "B77W", speed: 220},
  ];
  for (const item of aircraft) {
    const g = engineFor({airport: item.airport}).runwayGeometry(item.runway), airport = getAirport({airport: item.airport});
    for (const [side, offset] of [[5, 315], [-5, 90], [-5, 135]]) {
      const result = simulate({...base, ...item, mode: "rv", east: -g.vector.x * 8 - g.vector.y * side,
        north: -g.vector.y * 8 + g.vector.x * side, heading: (g.heading + offset) % 360,
        altitude: airport.elevation + 1500, minutes: 40});
      const description = `${item.airport} ${item.runway}, side ${side}, heading offset ${offset}`;
      assert.equal(result.outcome, "Landed", `${description}: ${result.reason}`);
      assert.ok(result.events.some(event => event.label === "Joining base"), description);
      assert.ok(!result.events.some(event => /downwind/.test(event.label)), description);
      let length = 0;
      for (let i = 1; i < result.points.length; i++) length += Math.hypot(result.points[i].x - result.points[i - 1].x, result.points[i].y - result.points[i - 1].y);
      assert.ok(length < 25, `${description}: ${length} NM`);
      const aligned = result.points.find(point => point.stage.includes("final")
        && Math.abs(((g.heading - point.heading + 540) % 360) - 180) <= 12
        && Math.abs(-(point.x - g.threshold.x) * g.vector.y + (point.y - g.threshold.y) * g.vector.x) <= .25);
      const distance = aligned && -((aligned.x - g.threshold.x) * g.vector.x + (aligned.y - g.threshold.y) * g.vector.y);
      assert.ok(distance && distance >= 3, `${description}: aligned final ${distance} NM`);
    }
  }
});

test("the heavy-aircraft base entry makes room in a crosswind", () => {
  const item = {airport: "KJFK", runway: "22L", profile: "B77W", speed: 220};
  const g = engineFor({airport: item.airport}).runwayGeometry(item.runway), airport = getAirport({airport: item.airport});
  const result = simulate({...base, ...item, mode: "rv", east: -g.vector.x * 8 - g.vector.y * 5,
    north: -g.vector.y * 8 + g.vector.x * 5, heading: (g.heading + 315) % 360,
    altitude: airport.elevation + 1500, windDirection: 90, windSpeed: 20, minutes: 40});
  assert.equal(result.outcome, "Landed", result.reason);
  assert.ok(result.events.some(event => event.label === "Joining base"));
  let length = 0;
  for (let i = 1; i < result.points.length; i++) length += Math.hypot(result.points[i].x - result.points[i - 1].x, result.points[i].y - result.points[i - 1].y);
  assert.ok(length < 30, `${length} NM`);
  const aligned = result.points.find(point => point.stage.includes("final")
    && Math.abs(((g.heading - point.heading + 540) % 360) - 180) <= 12
    && Math.abs(-(point.x - g.threshold.x) * g.vector.y + (point.y - g.threshold.y) * g.vector.x) <= .25);
  const distance = aligned && -((aligned.x - g.threshold.x) * g.vector.x + (aligned.y - g.threshold.y) * g.vector.y);
  assert.ok(distance && distance >= 3, `aligned final ${distance} NM`);
});

test("without a Tower handoff the visual forecast reports the missed approach", () => {
  const result = simulate({...base, tower: false});
  assert.equal(result.outcome, "Missed approach");
  assert.match(result.reason, /Tower handoff/);
});

test("input validation rejects unknown aircraft, runway, and non-finite positions", () => {
  assert.ok(catalog().airports.some(airport => airport.icao === "EGLL"));
  assert.throws(() => simulate({...base, profile: "missing"}), /aircraft profile/);
  assert.throws(() => simulate({...base, runway: "99"}), /runway/);
  assert.throws(() => simulate({...base, east: NaN}), /East offset/);
});
