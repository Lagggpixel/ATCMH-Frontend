import {readFile, readdir, writeFile} from "node:fs/promises";
import geomagnetism from "geomagnetism";

// Pin the exercise model to a date, never to the browser/server clock.
const date = "2026-10-22";
const model = geomagnetism.model(new Date(`${date}T00:00:00Z`));
const directory = new URL("../src/simulator/data/", import.meta.url);
const airports = {};
for (const file of (await readdir(directory)).filter(file => file.endsWith(".json")).sort()) {
  const airport = JSON.parse(await readFile(new URL(file, directory), "utf8"));
  if (!airport.icao || !airport.origin) continue;
  const {lat, lon} = airport.origin;
  const declination = model.point([lat, lon, airport.elevation * .0003048]).decl;
  if (!Number.isFinite(declination)) throw new Error(`No magnetic variation for ${airport.icao}`);
  airports[airport.icao] = Number(declination.toFixed(4));
}
const result = {model: "WMM-2025", date, convention: "degrees east positive; true = magnetic + variation", airports};
const json = JSON.stringify(result, null, 2) + "\n";
const destination = new URL("../src/simulator/data/magnetic-variation.json", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")).replaceAll("\r\n", "\n") !== json) throw new Error("Regenerate the pinned magnetic variation data.");
} else await writeFile(destination, json);
