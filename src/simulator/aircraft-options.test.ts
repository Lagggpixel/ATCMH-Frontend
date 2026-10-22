import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {engineFor} from "./engine";

const require = createRequire(import.meta.url);
test("Approach and Center quick menus expose aircraft utilities once and disable them offline", () => {
  const original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {};};
  try {
    const RadarQuickPopup = require("./RadarQuickPopup").default;
    for (const frequency of ["approach", "center"] as const) for (const connected of [false, true]) {
      const engine = engineFor({trainingStation: `EGPH:${frequency}`});
      const exercise = engine.initialExercise();
      const aircraft = engine.newAircraft("options", true); exercise.aircraft = [aircraft];
      const html = renderToStaticMarkup(React.createElement(RadarQuickPopup, {aircraft, exercise, frequency, connected, dispatch: () => {}, onMessages: () => {}, onAction: () => {}, onSent: () => {}}));
      for (const label of ["Set Reminder", "Show Information", "Set Color", "Tag Placement"]) {
        const buttons = [...html.matchAll(new RegExp(`<button([^>]*)>${label}</button>`, "g"))];
        assert.equal(buttons.length, 1, `${frequency}: ${label}`);
        assert.equal(buttons[0][1].includes("disabled"), !connected, `${frequency}: ${label} connection state`);
      }
      assert.equal([...html.matchAll(/>Other Message<\/button>/g)].length, 1);
      assert.ok(!html.includes("›"));
    }
  } finally {
    if (original) require.extensions[".css"] = original;
    else delete require.extensions[".css"];
  }
});
