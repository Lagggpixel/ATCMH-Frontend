import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {AIRPORT, initialExercise} from "./engine";
import {buildGroundRoute} from "./ground-route";
import {groundRouteItems} from "./ground-route-display";

function fixture() {
  const aircraft = initialExercise().aircraft[1];
  const end = AIRPORT.runway.ends.find(end => end.id === "24")!;
  const {route, error} = buildGroundRoute(AIRPORT, "taxi", [aircraft.position, end.point]);
  assert.equal(error, undefined);
  return {aircraft, route: route!};
}
const require = createRequire(import.meta.url);
function withCss(run: () => void) {
  const original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = new Proxy({}, {get: (_, key) => key === "__esModule" ? false : String(key)});};
  try {run();} finally {if (original) require.extensions[".css"] = original; else delete require.extensions[".css"];}
}

test("Current Path retains native item ordering, editable taxiway rows and separate destination/threshold items", () => {
  const {route} = fixture(), items = groundRouteItems(AIRPORT, route);
  assert.equal(items[0].text, "Start");
  assert.deepEqual(items.slice(-2).map(item => item.text), ["06-24 [Threshold]", "24"]);
  assert.ok(items.some(item => item.type === "taxiway" && item.canHold));
  assert.equal(items.at(-1)!.canHold, false);
  assert.deepEqual(items.at(-1)!.point, AIRPORT.runway.ends.find(end => end.id === "24")!.point);
  const checked = structuredClone(route); checked.points.at(-1)!.hold = true;
  assert.equal(groundRouteItems(AIRPORT, checked).at(-2)!.text, "06-24 (Hold) [Threshold]");
});

test("the native path menu contains route rows and Send/Cancel without the extra form", () => withCss(() => {
  const {aircraft, route} = fixture();
  const Editor = require("./GroundRouteEditor").default as typeof import("./GroundRouteEditor").default;
  const routing = {draft: {aircraftId: aircraft.id, kind: route.kind, controls: route.controls, destination: route.destination, route, holds: {}, pending: false}, busy: false, mode: "controller" as const,
    start() {}, move() {}, choose() {}, cancel() {}, remove() {}, hold() {}, async send() {}};
  const html = renderToStaticMarkup(createElement(Editor, {airport: AIRPORT, aircraft, routing}));
  assert.match(html, /<header>Current Path<\/header>/);
  assert.ok(renderToStaticMarkup(createElement(Editor, {airport: AIRPORT, aircraft, routing: {...routing, mode: "staff" as const}})).includes(`Start ${route.kind === "pushback" ? "Pushback" : "Taxi"}`));
  assert.ok(renderToStaticMarkup(createElement(Editor, {airport: AIRPORT, aircraft, routing: {...routing, mode: "scenario" as const}})).includes("Save Route"));
  assert.match(html, /06-24 \[Threshold\]/);
  assert.match(html, /aria-label="Hold at 06-24 threshold"/);
  assert.doesNotMatch(html, /checked=""/);
  assert.ok(!html.includes("<select") && !html.includes("preview") && !html.includes("Remove") && !html.includes("via point"));
  assert.match(html, /<footer>.*>Cancel<\/button>.*>Send Taxi<\/button><\/footer>/);
}));

test("draft markers are hollow native rings and the committed HOLD is a separate boxed badge", () => withCss(() => {
  const {route} = fixture();
  route.points.at(-1)!.hold = true;
  const {default: Overlay, GroundHoldLabels} = require("./GroundRouteOverlay") as typeof import("./GroundRouteOverlay");
  const project = (point: {x: number; y: number}) => ({x: point.x * 100, y: point.y * 100});
  const html = renderToStaticMarkup(createElement(Overlay, {airport: AIRPORT, route, project, scale: 100, onMove() {}}));
  assert.match(html, /stroke="#ff00ff" stroke-width="4"/);
  assert.match(html, /r="3" fill="none" stroke="#fff" stroke-width="2"/);
  assert.ok(html.includes('class="groundRouteMapLabel"') && html.includes("Hold 06-24 Hold"));
  const committed = renderToStaticMarkup(createElement(GroundHoldLabels, {points: route.points, project}));
  assert.match(committed, /class="groundRouteHoldLabel"[^>]*>HOLD<\/span>/);
  assert.ok(!committed.includes("HOLD 24"));
}));

test("a seeded physical taxi path is not a cleared green route; issued routes and the staff view remain visible", () => withCss(() => {
  const {aircraft, route} = fixture();
  const Scope = require("./Scope").default as typeof import("./Scope").default;
  const props = {airport: AIRPORT, aircraft: [aircraft], running: false, frequency: "ground" as const, selected: aircraft.id, onSelect() {}};
  const render = (extra = {}) => renderToStaticMarkup(createElement(Scope, {...props, ...extra}));
  assert.ok(!render().includes(`aria-label="${aircraft.callsign} taxi route"`));
  assert.ok(render({groundRouteCleared: true}).includes(`aria-label="${aircraft.callsign} taxi route"`));
  assert.ok(render({sentGroundRoute: route}).includes(`aria-label="${aircraft.callsign} taxi route"`));
  assert.ok(render({frequency: "all"}).includes(`aria-label="${aircraft.callsign} taxi route"`));
}));

test("staff see the aircraft's automatic runway exit without a historic taxi clearance", () => withCss(() => {
  const {aircraft} = fixture();
  const Scope = require("./Scope").default as typeof import("./Scope").default;
  const arrival = {...aircraft, mode: "rollout" as const, runwayExit: [aircraft.position, {x: 1, y: 1}, {x: 2, y: 1}],
    arrivalExit: {instruction: "automatic" as const, speed: 15 as const}, taxiPath: [], taxiIndex: 0};
  const props = {airport: AIRPORT, aircraft: [arrival], running: false, selected: arrival.id, onSelect() {}};
  const staff = renderToStaticMarkup(createElement(Scope, {...props, frequency: "all"}));
  assert.ok(staff.includes(`aria-label="${arrival.callsign} taxi route"`));
  const tower = renderToStaticMarkup(createElement(Scope, {...props, frequency: "tower"}));
  assert.ok(!tower.includes(`aria-label="${arrival.callsign} taxi route"`));
}));
