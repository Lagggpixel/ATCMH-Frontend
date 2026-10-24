import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {aircraftGlyphCenters, aircraftGlyphs, aircraftSymbol, type AircraftSymbol} from "./aircraft-symbol";

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

test("aircraft centring metrics match the actual ink bounds in the shipped font", async () => {
  const font = await readFile(new URL("../../public/simulator/fonts/InfiniteFlight.ttf", import.meta.url));
  const tables = new Map<string, number>();
  for (let i = 0; i < font.readUInt16BE(4); i++) {const row = 12 + i * 16; tables.set(font.toString("ascii", row, row + 4), font.readUInt32BE(row + 8));}
  const head = tables.get("head")!, cmap = tables.get("cmap")!;
  assert.equal(font.readUInt16BE(head + 18), 1000);
  let format4 = 0;
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {const offset = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4); if (font.readUInt16BE(offset) === 4) format4 = offset;}
  assert.ok(format4, "BMP aircraft glyph mapping exists");
  const segments = font.readUInt16BE(format4 + 6) / 2, end = format4 + 14, start = end + segments * 2 + 2, delta = start + segments * 2, ranges = delta + segments * 2;
  for (const [symbol, glyph] of Object.entries(aircraftGlyphs)) {
    const code = glyph.charCodeAt(0); let index = 0;
    for (let i = 0; i < segments; i++) if (code >= font.readUInt16BE(start + i * 2) && code <= font.readUInt16BE(end + i * 2)) {
      const range = font.readUInt16BE(ranges + i * 2);
      index = range ? font.readUInt16BE(ranges + i * 2 + range + (code - font.readUInt16BE(start + i * 2)) * 2) : code;
      if (index) index = (index + font.readInt16BE(delta + i * 2)) & 65535;
      break;
    }
    assert.ok(index, symbol);
    const long = font.readInt16BE(head + 50) === 1, loca = tables.get("loca")!;
    const offset = tables.get("glyf")! + (long ? font.readUInt32BE(loca + index * 4) : font.readUInt16BE(loca + index * 2) * 2);
    const center = [(font.readInt16BE(offset + 2) + font.readInt16BE(offset + 6)) / 2, (font.readInt16BE(offset + 4) + font.readInt16BE(offset + 8)) / 2];
    assert.deepEqual(aircraftGlyphCenters[symbol as AircraftSymbol], center, symbol);
  }
});
