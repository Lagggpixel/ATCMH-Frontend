import source from "./data/high-terrain.json";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {courseTo} from "./command-navigation";
import {approachGeometry} from "./radar";
import type {Point} from "./model";
import {blankScenario, seedFromAircraft, type ScenarioDefinition} from "./scenarios";
import {prepareScenarioImport} from "./scenario-import";

export const HIGH_TERRAIN_AIRPORTS = ["KASE", "VNLK"] as const;
export type HighTerrainAirport = typeof HIGH_TERRAIN_AIRPORTS[number];
type Slot = {origin: string; departure: string; type: "TBM9" | "C208"; speed: number; altitude: number; at: number; first: string};
const slots: Record<HighTerrainAirport, Slot[]> = {
  KASE: [
    {origin: "KEGE", departure: "25", type: "C208", speed: 130, altitude: 16000, at: 0, first: "GPS (RNV-F, DBL transition)"},
    {origin: "0CO2", departure: "12", type: "TBM9", speed: 140, altitude: 17000, at: 180, first: "Visual"},
    {origin: "KRIL", departure: "08", type: "C208", speed: 130, altitude: 16000, at: 0, first: "RV"},
    {origin: "CO11", departure: "34", type: "C208", speed: 130, altitude: 17000, at: 360, first: "Visual"},
    {origin: "KLXV", departure: "16", type: "TBM9", speed: 140, altitude: 17000, at: 540, first: "RV"},
    {origin: "7V2", departure: "02", type: "C208", speed: 130, altitude: 16000, at: 720, first: "RV"},
    {origin: "20V", departure: "27", type: "C208", speed: 130, altitude: 17000, at: 900, first: "Visual"},
    {origin: "KASE", departure: "33", type: "TBM9", speed: 140, altitude: 12000, at: 1080, first: "Visual"},
  ],
  VNLK: [
    {origin: "VNPL", departure: "south", type: "C208", speed: 110, altitude: 14000, at: 0, first: "Visual"},
    {origin: "VNRT", departure: "unspecified", type: "C208", speed: 120, altitude: 14000, at: 180, first: "RV"},
    {origin: "VNLD", departure: "unspecified", type: "C208", speed: 110, altitude: 14000, at: 360, first: "Visual"},
    {origin: "VNTR", departure: "unspecified", type: "C208", speed: 120, altitude: 16000, at: 540, first: "RV"},
    {origin: "VNJI", departure: "south", type: "C208", speed: 110, altitude: 15000, at: 720, first: "Visual"},
    {origin: "VNKG", departure: "unspecified", type: "C208", speed: 120, altitude: 14000, at: 900, first: "RV"},
  ],
};

/** Reusable assignments, independent of the Discord participants in the original briefing. */
export function highTerrainScenario(code: HighTerrainAirport): ScenarioDefinition {
  const airport = getAirport({airport: code}), definition = blankScenario({airport: code, trainingStation: `${code}:approach`});
  const engine = engineFor(definition), project = (p: {lat: number; lon: number}): Point => ({x: (p.lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (p.lat - airport.origin.lat) * 60});
  const origins: Record<string, Point & {name: string}> = {};
  definition.title = code === "KASE" ? "Aspen — GA sequencing in high terrain" : "Lukla — GA arrivals in high terrain";
  definition.aircraft = slots[code].map((slot, index) => {
    const key = `ga-${index + 1}`, origin = source.origins.find(p => p.code === slot.origin)!;
    let position = project(origin), heading = courseTo(position, {x: 0, y: 0});
    // A remote airport has no ground engine. Local GA also starts after climbout,
    // avoiding the generic 140 kt rotation / 220 kt departure model.
    if (slot.origin === code) {
      const g = approachGeometry(airport, "33");
      position = {x: g.threshold.x + g.vector.x * 5, y: g.threshold.y + g.vector.y * 5}; heading = g.heading;
    } else if (slot.departure === "south") heading = 180;
    else if (slot.departure !== "unspecified" && !(code === "KASE" && index === 0)) heading = Number(slot.departure) * 10;
    origins[key] = {...project(origin), name: slot.origin};
    const flightPlan = code === "KASE" && index === 0 ? source.aspenRoute.map(p => ({...project(p), name: p.fix})) : [];
    if (flightPlan.length) heading = courseTo(position, flightPlan[0]);
    const callsign = `November ${code === "KASE" ? "1" : "2"}${String(index + 1).padStart(2, "0")}`;
    const seed = seedFromAircraft({...engine.newAircraft(key, true), callsign, type: slot.type, position, heading, targetHeading: heading,
      altitude: slot.altitude, speed: slot.speed, targetSpeed: slot.speed, speedMode: "manual", flightPlan,
      arrivalProcedure: flightPlan.length ? "RNV-F / DBL" : undefined, destination: {name: code, point: {x: 0, y: 0}},
      runway: null, landing: "full-stop", radar: {station: "approach", navigation: "heading", routeIndex: 0},
    });
    definition.events.push({id: `check-in-${index + 1}`, title: `${callsign} from ${slot.origin}`, trigger: {type: "time", at: slot.at}, actions: [
      ...(slot.at ? [{type: "spawn" as const, aircraftKey: key}] : []),
      {type: "transmission", aircraftKey: key, text: `from ${slot.origin}, ${slot.altitude.toLocaleString("en-US")} feet, inbound ${code}, request ${slot.first}, full stop.`},
    ]});
    return {key, initial: slot.at === 0, seed};
  });
  const assignments = slots[code].map((slot, i) => `${i + 1}. ${definition.aircraft[i].seed.callsign} · ${slot.origin} ${/^\d/.test(slot.departure) ? `RW${slot.departure}` : slot.departure === "south" ? "depart south" : "departure unspecified"} · ${slot.type} · ${slot.first} → full stop · ${slot.altitude} ft / ${slot.speed} kt · check-in ${Math.floor(slot.at / 60)}:${String(slot.at % 60).padStart(2, "0")}`).join("\n");
  const common = `Approach training · IFATC briefing adapted for Sweatbox · all altitudes MSL.
Set ATIS before Start. All runway/approach assignments and clearances start empty. RV means radar vectors to a visual final, not an instrument approach. Non-filed traffic holds its initial heading until instructed; monitor new arrivals immediately. Pause to reduce workload; event times use simulation time.

Terrain technique: identify a terrain-checked path before each turn/descent, keep escape space, and sequence outside the valley. Terrain readouts sample individual points, not an obstacle-protected corridor. Check the whole proposed path and use the map/terrain alerts; if data is unavailable, pause descent and review. Starting altitudes are exercise choices, not minimum vectoring altitudes. Use an exercise target of 5 NM / 1,000 ft while converging; do not call this a published separation minimum.

Model limits: remote traffic starts airborne over its source airport, after an assumed climb. Runway numbers supply approximate departure headings, not magnetic-to-true conversion. GA types do not have certified performance; the engine uses 2,000 ft/min climb and 1,500 ft/min descent and one speed in knots (no IAS/GS distinction, density-altitude or wind correction). Manual GA speeds prevent automatic airliner speeds on final; manage/reduce speed explicitly. Original minimum climb and inbound-speed advice is a discussion point, not a constraint on landing speed. No ground departure or mountain-performance assessment is implied.

Debrief: replay the first terrain-sensitive descent, closest convergence and arrival handoff. Ask what terrain was checked, where delay could safely be absorbed, and when the approach should have been discontinued. Success: deliberate terrain/separation decisions, stable final and full-stop completion.`;
  const specific = code === "KASE" ? `Advanced · 8 aircraft · allow 30–45 minutes · arrivals RW15.
Full stop on the FIRST approach for all eight aircraft. Preserve each assignment’s first approach type below; no planned repeat approaches or touch and goes. If an arrival becomes unstable, pause and review a terrain-checked escape or reposition before continuing. Never use the generic runway-heading missed path as a terrain clearance.
KEGE files KEGE–DBL–HEPEB–ALLIX–MAFMU from the verified RNV-F DBL source. CEYAG is a separate reference fix, not a fabricated RNV-F leg. The source's non-coordinate missed leg and later LINDZ/GLENO missed legs are excluded. Hold the initial level until the learner provides descent; at the final segment, transition to the simulator's schematic GPS/visual final only when terrain and alignment permit. This is not a reproduction of published RNAV-F vertical/offset guidance.
CO11 uses Infinite Flight's Breckenridge identity, not today's reused CO11 identifier. Slot 8 begins 5 NM beyond KASE RW33, already airborne at 12,000 ft. TBMs retain the requested slots 2, 5 and 8. Slots 6–7 start at 130 kt (>120); the original 20–24 minute estimate is not a timer or success criterion. Plan the arrival sequence and full stops explicitly.` : `Intermediate/advanced · 6 aircraft · allow 30–45 minutes · land RW06.
Visual/RV ONLY; full stop on the FIRST approach for every aircraft. C208 throughout; alternate visual and RV intentions are instructor choices because the original briefing did not allocate them individually. VNPL and VNJI begin heading south as requested. VNKG is Infinite Flight's Khotang airfield, not Kangel Danda.
Establish and space traffic south/west of Lukla before joining the southwest final. Do not vector aircraft northeast of the runway into rising terrain. Check the actual terrain before each descent and do not assume the schematic 3-degree line is protected. Slow to about 100 simulated kt before the short final; do not carry the en-route minimum onto the runway. If an arrival is not stable, stop the exercise and reposition outside the valley rather than practicing a late generic go-around. The flat-runway model does not reproduce Lukla's slope, aircraft restrictions or real-world escape limitations.`;
  definition.instructorNotes = `${specific}\n\nAssignments\n${assignments}\n\n${common}`;
  definition.radarEnvironment!.fixes = [
    ...slots[code].filter(slot => slot.origin !== code).map(slot => ({id: slot.origin, point: project(source.origins.find(p => p.code === slot.origin)!)})),
    ...(code === "KASE" ? [...source.aspenRoute.map(p => ({id: p.fix, point: project(p)})), {id: "CEYAG", point: project(source.ceyag)}] : []),
  ];
  definition.events.push({id: "terrain-review", title: "Pause and explain the terrain plan", trigger: {type: "manual"}, actions: [{type: "note", text: "Pause the exercise. Ask the learner to identify the highest terrain on the proposed path, explain the next descent/turn, name an escape option, and state which arrival must wait. Resume only after reviewing the plan."}]});
  return prepareScenarioImport(definition, origins);
}
