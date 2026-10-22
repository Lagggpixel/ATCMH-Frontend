import variation from "./data/magnetic-variation.json";
import type {Airport} from "./model";

const normalize = (heading: number) => (heading % 360 + 360) % 360;
export function magneticVariation(airport: Pick<Airport, "icao">): number {
  const value = (variation.airports as Record<string, number>)[airport.icao];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`No pinned magnetic variation for ${airport.icao}.`);
  return value;
}
/** Aircraft/map/route geometry stays true; controller heading numbers are magnetic. */
export const magneticToTrue = (heading: number, airport: Pick<Airport, "icao">) => normalize(heading + magneticVariation(airport));
export const trueToMagnetic = (heading: number, airport: Pick<Airport, "icao">) => normalize(heading - magneticVariation(airport));
export const magneticHeadingLabel = (heading: number, airport: Pick<Airport, "icao">) => Math.round(trueToMagnetic(heading, airport)) % 360 || 360;
