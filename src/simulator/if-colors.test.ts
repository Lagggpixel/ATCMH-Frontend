import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {engineFor} from "./engine";
import {IF_COLORS, IF_MAP_COLORS, pilotMessageColor} from "./if-colors";
import {EXERCISE_WEATHER, type Exercise, type Frequency, type Message} from "./model";

test("pilot colors stay consistent across renders and within IF's pastel range", () => {
  const colors = new Set<string>();
  for (let id = 0; id < 1000; id++) {
    const color = pilotMessageColor(`aircraft-${id}`);
    assert.equal(color, pilotMessageColor(`aircraft-${id}`));
    const channels = color.match(/\d+/g)!.map(Number);
    assert.equal(channels.length, 3);
    assert.ok(channels.every(channel => channel >= 127 && channel <= 254));
    colors.add(color);
  }
  assert.ok(colors.size > 900, "Different pilots should not collapse onto a few shared colors");
});

const require = createRequire(import.meta.url);
function withComponents(check: (components: {Scope: typeof import("./Scope").default; MessageLog: typeof import("./MessagePanel").MessageLog; GroundQuickActions: typeof import("./GroundQuickActions").default}) => void) {
  const original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {aircraftTag: "aircraftTag", tagColorDot: "tagColorDot"};};
  try {check({Scope: require("./Scope").default, MessageLog: require("./MessagePanel").MessageLog, GroundQuickActions: require("./GroundQuickActions").default});}
  finally {if (original) require.extensions[".css"] = original; else delete require.extensions[".css"];}
}

test("radio rows retain one color per pilot and prioritize off-frequency gray", () => withComponents(({MessageLog}) => {
  const messages: Message[] = [
    {id: "1", aircraftId: "one", time: 0, frequency: "tower", sender: "controller", text: "Clear to land"},
    {id: "2", aircraftId: "one", time: 1, frequency: "tower", sender: "pilot", text: "Readback"},
    {id: "3", aircraftId: "two", time: 2, frequency: "tower", sender: "pilot", text: "Request"},
    {id: "4", aircraftId: "one", time: 3, frequency: "tower", sender: "pilot", text: "Readback again"},
  ];
  const colors = (frequency: Frequency | "all") => [...renderToStaticMarkup(createElement(MessageLog, {messages, frequency})).matchAll(/data-frequency="tower" style="color:([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(colors("tower"), [IF_COLORS.cleared, pilotMessageColor("one"), pilotMessageColor("two"), pilotMessageColor("one")]);
  assert.deepEqual(colors("all"), colors("tower"));
  assert.deepEqual(colors("ground"), messages.map(() => IF_COLORS.offFrequency));
}));

test("selected off-frequency labels become white while custom highlights retain priority", () => withComponents(({Scope}) => {
  const engine = engineFor({airport: "EGPH"});
  const aircraft = {...engine.newAircraft("color-label", true), position: {x: 0, y: 0}, frequency: "tower" as const, clearedToLand: false, tagAngle: 0};
  const render = (selected: string | null, color: string | null = null) => renderToStaticMarkup(createElement(Scope, {aircraft: [{...aircraft, color}], running: false, frequency: "ground", selected, onSelect() {}}));
  assert.match(render(aircraft.id), /--label-text:#ffffff/);
  const custom = render(aircraft.id, "#fc473a");
  assert.match(custom, /--label-text:#fc473a/);
  assert.match(custom, /class="tagColorDot" style="background:#fc473a"/);
  assert.ok(custom.includes(`stroke="${IF_MAP_COLORS.labelLeader}"`));
}));

test("ground runway choices use current wind, including calm winds and tailwinds beyond 90 degrees", () => withComponents(({GroundQuickActions}) => {
  const engine = engineFor({airport: "EGPH"});
  const aircraft = {...engine.newAircraft("taxi-color", false), frequency: "ground" as const, mode: "taxi" as const};
  const colors = (windSpeed: number) => {
    const exercise: Exercise = {...engine.initialExercise(), aircraft: [aircraft], weather: {...EXERCISE_WEATHER, windDirection: 140, windSpeed}};
    const html = renderToStaticMarkup(createElement(GroundQuickActions, {aircraft, exercise, frequency: "ground", connected: true, dispatch() {}, onSent() {}}));
    return Object.fromEntries([...html.matchAll(/style="color:([^"]+)"[^>]*>Taxi to Runway (\d{2})/g)].map(([, color, runway]) => [runway, color]));
  };
  assert.deepEqual(colors(5), {"06": IF_COLORS.cleared, "24": IF_COLORS.cleared});
  assert.deepEqual(colors(10), {"06": IF_COLORS.warning, "24": IF_COLORS.alert});
}));
