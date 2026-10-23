import assert from "node:assert/strict";
import test from "node:test";
import {aircraftGlyphs, aircraftSymbol, type AircraftSymbol} from "./aircraft-symbol";

test("scope aircraft choose original glyph categories, including formatted and free-text types", () => {
  const types: Record<AircraftSymbol, string[]> = {
    ga: ["C172", "PA28", "SR22", "custom aircraft", ""],
    jumbo: ["A380", "B748", "Boeing 747-400"],
    heavy: ["A359", "B77W", "Boeing 777-300ER", "MD-11", "C17"],
    medium: ["B788", "B763", "A310", "Airbus A300-600"],
    jet: ["A318", "A319", "A320", "Airbus A321-200", "B738", "Boeing 737-800", "B712"],
    regional: ["CRJ9", "E175", "E190", "ERJ145", "C25B", "Citation X"],
    turboprop: ["DH8D", "Dash 8 Q400", "Q400", "ATR72", "AT76", "King Air 350"],
    military: ["C130", "C-130J", "A400M"],
    fighter: ["F22", "F-16", "F/A-18", "F35", "Typhoon"],
    warbird: ["Spitfire", "P-51", "P38"],
    "single-turboprop": ["TBM930", "PC12", "C208", "Caravan"],
  };
  for (const [symbol, equipment] of Object.entries(types)) {
    for (const type of equipment) assert.equal(aircraftSymbol(type), symbol, type);
  }
  assert.equal(new Set(Object.values(aircraftGlyphs)).size, Object.keys(types).length);
});
