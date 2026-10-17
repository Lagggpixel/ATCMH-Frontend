import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {getAirport, simulatedMetar} from "./airports";
import {EXERCISE_WEATHER, type Airport} from "./model";

test("runway label text and borders follow the wind in the displayed METAR", async () => {
  const require = createRequire(import.meta.url);
  const originalCssLoader = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {runwayTag: "runwayTag"};};
  const {default: Scope} = require("./Scope.tsx") as typeof import("./Scope");
  const weather = EXERCISE_WEATHER as {windDirection: number};
  const original = weather.windDirection;
  const render = (airport: Airport) => renderToStaticMarkup(React.createElement(Scope, {airport, aircraft: [], running: false, frequency: "all", selected: null, onSelect: () => {}}));
  const labels = (airport: Airport) => Object.fromEntries([...render(airport).matchAll(/<span[^>]*style="([^"]*)"[^>]*>(\d{2}[LRC]?)<\/span>/g)].map(([, style, id]) => [id, style]));
  const check = (actual: Record<string, string>, expected: Record<string, string>) => {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const [id, color] of Object.entries(expected)) {
      assert.ok(actual[id].includes(`color:${color};`), `${id}: ${actual[id]}`);
      assert.ok(actual[id].includes(`border-color:${color}`), `${id} border: ${actual[id]}`);
    }
  };
  const dallas = getAirport({airport: "KDAL"});
  try {
    weather.windDirection = 240;
    assert.match(simulatedMetar(dallas), /Wind 240° at 10KT/);
    check(labels(dallas), {"13L": "#e8b257", "13R": "#e8b257", "31L": "#e8b257", "31R": "#e8b257"});
    check(labels(getAirport({airport: "EGPH"})), {"06": "#ff3434", "24": "#91e98d"});

    weather.windDirection = 135.6;
    assert.match(simulatedMetar(dallas), /Wind 135\.6° at 10KT/);
    check(labels(dallas), {"13L": "#91e98d", "13R": "#91e98d", "31L": "#ff3434", "31R": "#ff3434"});

    weather.windDirection = 315.6;
    assert.match(simulatedMetar(dallas), /Wind 315\.6° at 10KT/);
    check(labels(dallas), {"13L": "#ff3434", "13R": "#ff3434", "31L": "#91e98d", "31R": "#91e98d"});
  } finally {
    weather.windDirection = original;
    if (originalCssLoader) require.extensions[".css"] = originalCssLoader;
    else delete require.extensions[".css"];
  }
});
