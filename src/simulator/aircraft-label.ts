import {aircraftCatalogEntry} from "./aircraft-catalog";
import {controllerStripText} from "./controller-strip";
import {environmentWithDestinations} from "./aviation";
import {radarEnvironmentFor, radarFlightLabel} from "./radar";
import {terrainCoordinates} from "./terrain";
import type {Aircraft, Airport, Frequency, Message, RadarEnvironment} from "./model";

/** IF 26.4 MapControl.RenderAircraftTextATC. Station is the viewing
 * controller's facility, independent of the aircraft's tuned frequency. */
export function aircraftLabel(a: Aircraft, airport: Airport, station: Frequency, environment?: RadarEnvironment, messages: readonly Message[] = []) {
  const flight = radarFlightLabel(a, airport).flight;
  const radarStation = ["approach", "departure", "center"].includes(station);
  const strip = radarStation ? controllerStripText(a, airport, environmentWithDestinations(airport, environment ?? radarEnvironmentFor(airport), [a]), messages) : undefined;
  return {
    flight: flight + (station === "tower" ? ` ${towerDistance(a, airport)}NM` : ""),
    additional: strip && strip.additionalInfo !== "----" ? `${strip.additionalInfo} ${strip.runway}` : undefined,
    holding: strip ? /(?:^| - )HOLD(?:$| )/.test(strip.additionalInfo) : a.atcManeuver?.kind === "hold",
    vertical: Math.abs(a.verticalSpeed ?? 0) > 250 ? a.verticalSpeed! > 0 ? "climb" as const : "descent" as const : undefined,
  };
}

/** Native Geodesy.Distance(Ellipsoid.Default): atan2(|cross|, dot),
 * with the 6,371,000m mean radius. Convert the scope's NM coordinates first. */
export function towerDistance(a: Pick<Aircraft, "position">, airport: Airport) {
  const location = terrainCoordinates(airport, a.position);
  const normal = (lat: number, lon: number) => {
    lat *= Math.PI / 180; lon *= Math.PI / 180;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  };
  const u = normal(airport.origin.lat, airport.origin.lon), v = normal(location.latitude, location.longitude);
  const cross = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const metres = Math.fround(Math.atan2(cross, dot) * 6371000);
  return Math.trunc(Math.fround(Math.fround(metres * Math.fround(.5399568)) / 1000));
}

/** Native type occupies the first second of each three-second cycle.
 * Keep native padding and the 17-character + ellipsis callsign limit. */
export function aircraftLabelIdentity(type: string, callsign: string, seconds: number) {
  if (Math.trunc(seconds) % 3 === 0) return (aircraftCatalogEntry(type)?.id ?? "UNK").padEnd(20);
  return callsign.length > 20 ? `${callsign.slice(0, 17)}...` : callsign.padEnd(18);
}
