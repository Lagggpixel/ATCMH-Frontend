import {getAirport} from "./airports";
import {createLocalAircraft, type LocalAircraftOptions} from "./local-aircraft";
import {blankScenario, gatesFor, normalizeScenario, scenarioSchema, seedFromAircraft, standPlacement, type ScenarioDefinition} from "./scenarios";

/** Authored training demand, independent of live airline schedules or published capacity. */
export function egllRushScenario(): ScenarioDefinition {
  const selection = {airport: "EGLL", trainingStation: "EGLL:local"}, airport = getAirport(selection);
  const definition = blankScenario(selection);
  definition.title = "EGLL — Heathrow Overload: 20 Departures / 40 Arrivals";
  definition.weather = {windDirection: 270, windSpeed: 8, visibilityKm: 10, qnh: 1013, temperature: 12, dewpoint: 7, reference: "Authored westerly training weather; not live METAR"};
  definition.instructorNotes = `INTENSE GROUND & TOWER — 60 aircraft, 25-minute traffic feed.

Plan arrivals on 27L and departures on 27R. Publish an ATIS before the first call. Suggested exercise weather is 270/8, visibility 10 km, QNH 1013; new sessions may load live METAR, so review and restore the exercise wind before Start if necessary.

DEPARTURES: exactly 20 aircraft request pushback at distinct mapped stands, every 60 seconds from 01:00 through 20:00. Work pushback, taxi routing, crossing protection, Tower handoff, runway occupancy and departure release. All start without taxi or takeoff clearance. Aircraft enter the departure workload at these times; taxi time and safe release decisions determine actual takeoff times.

ARRIVALS: exactly 40 full-stop arrivals call Tower on the 27L final, every 37.5 seconds from 00:37.5 through 25:00. They enter 10 NM from the threshold on an approximate three-degree profile, with automatic aircraft-type speeds and mixed narrowbody/heavy traffic. Each has one structured landing request and no landing clearance. This is Tower traffic, so calls request landing, not an Approach-frequency check-in.

The arrival feed represents deliberate overload demand (96 arrivals/hour), not a safe single-runway landing target or a real Heathrow schedule. Protect separation and wake spacing; use delayed departure releases, speed coordination and go-arounds when necessary. Never issue a landing or takeoff clearance solely to keep up with the feed. Do not send all 40 arrivals to an occupied runway just to meet the count. The 25-minute mark ends new traffic; continue until the remaining queue is safely resolved.

Suggested setup: Automatic pilots/readbacks on; trainee works Ground and Tower, trainer monitors final spacing and runway occupancy. Start paused to brief runway allocation and recovery. There are no automatic clearances, removals, forced landings, failures or scripted collisions. Mentor notes at 05:00, 10:00, 15:00, 20:00 and 25:00 are workload/debrief prompts only.

Debrief: compare feed versus actual movements, longest departure delay, runway-exit decisions, heavy-aircraft spacing, go-around timing and the decision to stop accepting an unsafe sequence. Training geometry and workload choices are authored for Sweatbox, not operational instructions.`;
  const options: LocalAircraftOptions = {placement: "final", callsign: "", type: "A320", runway: "27L", distance: 10, leg: "final", hand: "left", height: Math.round(10 * 6076 * Math.tan(3 * Math.PI / 180)), speed: "auto", heading: 270, landing: "full-stop", flight: "pattern", frequency: "tower"};
  const arrivals = [
    ["Speedbird", "A320"], ["Lufthansa", "A321"], ["Virgin", "B789"], ["Air France", "A320"],
    ["Emirates", "B77W"], ["Shamrock", "A320"], ["Swiss", "A320"], ["Qatar", "A359"],
    ["Speedbird", "A321"], ["KLM", "B738"],
  ];
  const departures = [["Speedbird", "A320"], ["Virgin", "B789"], ["Speedbird", "A321"], ["United", "B772"], ["Lufthansa", "A320"]];
  const stands: ReturnType<typeof gatesFor> = [];
  for (const gate of gatesFor(airport)) {
    const point = standPlacement(gate.id, false, airport)!.position;
    if (stands.every(other => {
      const p = standPlacement(other.id, false, airport)!.position;
      return Math.hypot(p.x - point.x, p.y - point.y) >= .08;
    })) stands.push(gate);
    if (stands.length === 20) break;
  }
  if (stands.length !== 20) throw new Error("EGLL requires 20 distinct connected stands.");
  for (let i = 0; i < 40; i++) {
    const [airline, type] = arrivals[i % arrivals.length], key = `arrival-${i + 1}`;
    const a = createLocalAircraft(selection, key, {...options, type, callsign: `${airline} ${401 + i}${["B789", "B77W", "A359"].includes(type) ? " Heavy" : ""}`});
    definition.aircraft.push({key, initial: false, seed: seedFromAircraft(a)});
    definition.events.push({id: key, title: `Arrival ${i + 1}: ${a.callsign}`, trigger: {type: "time", at: (i + 1) * 37.5}, actions: [{type: "spawn", aircraftKey: key}, {type: "request", aircraftKey: key, requestId: "inbound-land", runway: "27L", inbound: "ils"}]});
  }
  for (let i = 0; i < 20; i++) {
    const [airline, type] = departures[i % departures.length], key = `departure-${i + 1}`, gate = stands[i];
    const a = createLocalAircraft(selection, key, {...options, placement: "gate", gateId: gate.id, runway: "27R", type, callsign: `${airline} ${801 + i}${["B789", "B772"].includes(type) ? " Heavy" : ""}`, flight: "departure", frequency: "ground"});
    definition.aircraft.push({key, initial: false, gateId: gate.id, seed: seedFromAircraft(a)});
    definition.events.push({id: key, title: `Departure ${i + 1}: ${a.callsign}`, trigger: {type: "time", at: (i + 1) * 60}, actions: [{type: "spawn", aircraftKey: key}, {type: "request", aircraftKey: key, requestId: "pushback", runway: "27R"}]});
  }
  for (const minute of [5, 10, 15, 20, 25]) definition.events.push({id: `brief-${minute}`, title: minute === 25 ? "Traffic feed complete — resolve remaining traffic" : `Workload review: ${minute} minutes`, trigger: {type: "time", at: minute * 60}, actions: [{type: "note", text: minute === 25 ? "All 20 departure and 40 arrival entries are complete. Continue safely; debrief accepted demand versus completed movements." : "Review final spacing, heavy wake gaps, runway occupancy and the departure queue. Pause if the sequence is no longer safe."}]});
  definition.events.sort((a, b) => (a.trigger.type === "time" ? a.trigger.at : 0) - (b.trigger.type === "time" ? b.trigger.at : 0));
  return normalizeScenario(scenarioSchema.parse(definition));
}
