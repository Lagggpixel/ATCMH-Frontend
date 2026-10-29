import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {engineFor} from "./engine";

const require = createRequire(import.meta.url);

test("250-knot speed menu shows Send in the command row", () => {
  const original = require.extensions[".css"];
  require.extensions[".css"] = module => {module.exports = {};};
  try {
    const MessagePanel = require("./MessagePanel").default;
    const engine = engineFor({trainingStation: "EGPH:approach"});
    const exercise = engine.initialExercise();
    const aircraft = engine.newAircraft("speed-test", true);
    exercise.aircraft = [aircraft];
    const html = renderToStaticMarkup(createElement(MessagePanel, {
      aircraft, exercise, frequency: "approach", connected: true, dispatch() {}, onClose() {},
      initialPath: ["Request Speed", "Maintain Speed", "<= 250 kts", "250kts"],
    }));
    assert.match(html, /aria-label="Send command"[^>]*><span>2<\/span><div>Send<\/div>/);
    assert.match(html, /<div>Or Greater<\/div>/);
    assert.match(html, /<div>Or Below<\/div>/);
  } finally {
    if (original) require.extensions[".css"] = original;
    else delete require.extensions[".css"];
  }
});
