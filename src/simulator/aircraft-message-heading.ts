import type {Aircraft, Airport, ExerciseWeather} from "./model";
import {flightVelocity, trueAirspeed} from "./aircraft-performance";
import {machKnots} from "./radar-speed";
import {trueToMagnetic} from "./magnetic-headings";

/** Aircraft IDs are randomly generated. Deriving the handle keeps it stable on reopen/replay. */
export function simulatedPilotUsername(aircraftId: string): string {
  let hash = 2166136261;
  for (const character of aircraftId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const value = hash >>> 0;
  return `${["skyroute", "cloudpilot", "flightdeck", "vectorflyer"][value % 4]}${Math.floor(value / 4) % 10000}`;
}

export function aircraftMessageHeading(a: Aircraft, airport: Airport, weather?: ExerciseWeather) {
  const ground = ["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode);
  const velocity = flightVelocity(a, weather);
  const groundSpeed = a.groundSpeed ?? (ground ? a.speed : Math.hypot(velocity.x, velocity.y));
  const tas = !ground ? trueAirspeed(a.speed, a.altitude, weather) : a.speed;
  const mach = Math.max(0, tas / machKnots(1, a.altitude, weather));
  const trueHeading = Math.round((a.heading % 360 + 360) % 360);
  const magneticHeading = Math.round(trueToMagnetic(a.heading, airport));
  return {
    username: simulatedPilotUsername(a.id),
    position: `${(Math.trunc(a.altitude / 100) * 100).toLocaleString("en-US")}ft ${magneticHeading}\u00b0M ${trueHeading}\u00b0T`,
    speed: `GS: ${Math.round(groundSpeed)} IAS: ${Math.round(a.speed)} M${mach.toFixed(2)} ${a.active ? "Active" : "Away"}`,
  };
}
