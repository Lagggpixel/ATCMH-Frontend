import type {Aircraft, Airport, RoutePoint} from "./model";
import {frequenciesFor} from "./airports";
import {magneticHeadingLabel} from "./magnetic-headings";
import {flightPlanItems} from "./scenario-flight-plan";

const thousands = (value: number) => Math.round(value).toLocaleString("en-US");
const fixLabel = (point: RoutePoint, index: number) => point.name || point.fixId || `WPT${index + 1}`;
const altitudeOf = (point: RoutePoint) => point.altitude !== undefined && point.altitude > 0 ? thousands(point.altitude) : "";

/** Infinite Flight 26.4 Information panel route: identifiers joined by ", ", procedures as NAME(FIX@ALT, FIX). */
export function flightPlanText(points: readonly RoutePoint[]): string {
  return flightPlanItems([...points]).map(item => {
    if (!item.procedure) {
      const altitude = altitudeOf(points[item.start]);
      return `${fixLabel(points[item.start], item.start)}${altitude ? `(${altitude})` : ""}`;
    }
    const fixes = points.slice(item.start, item.end + 1).map((point, offset) => {
      const altitude = altitudeOf(point);
      return `${fixLabel(point, item.start + offset)}${altitude ? `@${altitude}` : ""}`;
    });
    return `${item.procedure.name}(${fixes.join(", ")})`;
  }).join(", ");
}

/** One "TYPE      : NAME" line per procedure item, type padded to ten columns. */
export function procedureLines(points: readonly RoutePoint[]): string[] {
  return flightPlanItems([...points]).flatMap(item => item.procedure ? [`${item.procedure.type.toUpperCase().padEnd(10)}: ${item.procedure.name}`] : []);
}

/** Approximate Mach from IAS (ISA, no compressibility correction); enough for a readout. */
export function machNumber(ias: number, altitude: number): number {
  const feet = Math.max(0, altitude);
  const tas = ias * (1 + .02 * feet / 1000);
  const kelvin = Math.max(216.65, 288.15 - .0019812 * feet);
  return tas / (661.47 * Math.sqrt(kelvin / 288.15));
}

export interface SimulatedPilot {
  username: string; organization: string; identifier: string; xp: number; grade: number;
  flightTime: string; landings: number; violations: number; onlineFlights: number;
}

const usernames = ["SkyHawkSam", "Canyon_Ace", "jetstream_kai", "NorthernLights", "BlueRidgeFlyer", "MetroMike", "Cirrus_Clara", "HeavyRaj", "TailwindTom", "Ayla.Flies", "VectorVic", "Runway_Rosa", "Pacific_Pete", "Delta_Dee", "ColdFront", "QNH_Quinn"];
const organizations = ["None", "None", "IFVARB [IFVARB]", "Delta Virtual Airlines [DVA]", "Southwest Virtual [SWAV]", "Qantas Virtual [QVA]", "Emirates Virtual [EKV]", "IFATC [IFATC]"];
const hash = (text: string) => {let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0; return value;};

/** Sweatbox pilots are simulated, so the User section shows made-up values that stay fixed for each aircraft. */
export function simulatedPilot(aircraft: Pick<Aircraft, "id" | "callsign">): SimulatedPilot {
  const seed = hash(`${aircraft.id}:${aircraft.callsign}`);
  const pick = (shift: number, range: number) => ((seed >>> shift ^ Math.imul(seed, shift + 7)) >>> 0) % range;
  const grade = 1 + pick(3, 5);
  const onlineFlights = 20 + pick(5, 900 * grade);
  const hours = Math.round(onlineFlights * (1.2 + pick(7, 20) / 10));
  return {
    username: usernames[pick(0, usernames.length)],
    organization: organizations[pick(9, organizations.length)],
    identifier: hash(`${aircraft.callsign}:${aircraft.id}`).toString(16).toUpperCase().padStart(8, "0"),
    xp: 25000 * grade * grade + pick(11, 400000 * grade),
    grade,
    flightTime: `${hours}hr${String(pick(13, 60)).padStart(2, "0")}mn`,
    landings: Math.round(onlineFlights * (.7 + pick(15, 6) / 10)),
    violations: pick(17, 12 * grade),
    onlineFlights,
  };
}

export function aircraftSummary(aircraft: Aircraft, airport: Airport) {
  const trueHeading = Math.round(aircraft.heading) % 360 || 360;
  const groundSpeed = Math.round(aircraft.groundSpeed ?? aircraft.speed);
  const ias = Math.round(aircraft.speed);
  return {
    position: `${thousands(Math.max(0, aircraft.altitude))}ft ${magneticHeadingLabel(aircraft.heading, airport)}°M ${trueHeading}°T`,
    speeds: `GS: ${groundSpeed} IAS: ${ias} Mach: ${machNumber(ias, aircraft.altitude).toFixed(2)} ${aircraft.active ? "Active" : "Inactive"}`,
  };
}

export function tunedFrequency(aircraft: Pick<Aircraft, "frequency">, airport: Airport): string | null {
  if (!aircraft.frequency) return null;
  const station = frequenciesFor(airport)[aircraft.frequency];
  return station ? `${station.name} ${station.value}` : aircraft.frequency.toUpperCase();
}
