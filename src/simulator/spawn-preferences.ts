import {z} from "zod";
import {defaultRunway, getAirport, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {radarEnvironmentFor} from "./radar";
import type {Exercise} from "./model";

const preferencesSchema = z.object({
  airborne: z.boolean(), runway: z.string(),
  heading: z.number().min(0).max(360), altitude: z.number().positive().max(65000), speed: z.number().min(80).max(600),
  landing: z.enum(["full-stop", "touch-and-go"]), flight: z.enum(["return", "departure"]),
  requestedApproach: z.string().optional(), departureDirection: z.enum(["north", "east", "south", "west"]).optional(),
});
export type SpawnPreferences = z.infer<typeof preferencesSchema>;
const preferenceKey = (accountId: string, exercise: Exercise) => `simulator:spawn:v1:${accountId}:${getAirport(exercise).icao}`;

export function readSpawnPreferences(accountId: string, exercise: Exercise): SpawnPreferences {
  const airport = getAirport(exercise), environment = exercise.radarEnvironment ?? radarEnvironmentFor(airport);
  const approach = runwayEnds(airport).map(end => environment.approaches.find(p => p.runway === end.id && p.type === "ils")).find(Boolean)
    ?? environment.approaches[0];
  const defaults: SpawnPreferences = {
    airborne: true, runway: defaultRunway(airport), heading: 360,
    altitude: Math.max(7000, Math.ceil((airport.elevation + 1000) / 1000) * 1000),
    speed: engineFor(exercise).newAircraft("preview", true).speed,
    landing: "full-stop", flight: approach ? "return" : "departure", requestedApproach: approach?.id, departureDirection: "north",
  };
  try {
    const result = preferencesSchema.safeParse(JSON.parse(window.localStorage.getItem(preferenceKey(accountId, exercise)) ?? "null"));
    if (!result.success) return defaults;
    const saved = result.data;
    return {...saved,
      runway: runwayEnds(airport).some(end => end.id === saved.runway) ? saved.runway : defaults.runway,
      altitude: saved.altitude > airport.elevation ? saved.altitude : defaults.altitude,
      flight: saved.flight === "return" && !approach ? "departure" : saved.flight,
      requestedApproach: environment.approaches.some(p => p.id === saved.requestedApproach) ? saved.requestedApproach : approach?.id,
    };
  } catch {return defaults;}
}

/** Save only accepted form settings, never aircraft identity, position or runtime clearances. */
export function saveSpawnPreferences(accountId: string, exercise: Exercise, preferences: SpawnPreferences) {
  try {window.localStorage.setItem(preferenceKey(accountId, exercise), JSON.stringify(preferencesSchema.parse(preferences)));}
  catch { /* Spawning remains available when browser storage is blocked. */ }
}
