import {randomUUID} from "node:crypto";
import {AIRCRAFT_PERFORMANCE} from "../../src/simulator/aircraft-performance";
import {airportList, airportRunways, getAirport} from "../../src/simulator/airports";
import {engineFor} from "../../src/simulator/engine";
import {EXERCISE_WEATHER, type Aircraft, type Instruction} from "../../src/simulator/model";

export interface LabInput {
  airport: string; runway: string; profile: string; mode: "visual" | "rv";
  east: number; north: number; heading: number; altitude: number; speed: number;
  windDirection: number; windSpeed: number; tower: boolean; minutes: number;
}
export interface LabPoint {
  x: number; y: number; time: number; altitude: number; speed: number; groundSpeed: number; heading: number; stage: string;
}

export const catalog = () => ({
  airports: airportList.map(airport => ({icao: airport.icao, name: airport.name, elevation: airport.elevation,
    runways: airportRunways(airport).flatMap(pair => pair.ends.map(end => ({id: end.id, threshold: end.point,
      departure: pair.ends.find(other => other.id !== end.id)!.point})))})),
  profiles: AIRCRAFT_PERFORMANCE.map(({id, name, inbound}) => ({id, name, inbound})),
});

function checkedNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

export function simulate(input: LabInput) {
  const airport = getAirport({airport: input.airport});
  const runway = airportRunways(airport).flatMap(pair => pair.ends).find(end => end.id === input.runway);
  if (!runway) throw new Error("Choose a runway at the selected airport.");
  const profile = AIRCRAFT_PERFORMANCE.find(item => item.id === input.profile);
  if (!profile) throw new Error("Choose an available aircraft profile.");
  if (input.mode !== "visual" && input.mode !== "rv") throw new Error("Choose visual or radar vectors.");
  const east = checkedNumber(input.east, "East offset", -100, 100), north = checkedNumber(input.north, "North offset", -100, 100);
  const heading = checkedNumber(input.heading, "Heading", 0, 360) % 360;
  const altitude = checkedNumber(input.altitude, "Altitude", airport.elevation + 1, 60000);
  const speed = checkedNumber(input.speed, "Airspeed", 40, 600);
  const weather = {...EXERCISE_WEATHER, windDirection: checkedNumber(input.windDirection, "Wind direction", 0, 360) % 360,
    windSpeed: checkedNumber(input.windSpeed, "Wind speed", 0, 100)};
  const duration = checkedNumber(input.minutes, "Duration", 1, 40) * 60;
  const engine = engineFor({airport: airport.icao, trainingStation: `${airport.icao}:approach`, weather});
  let state = engine.initialExercise();
  state.running = true; state.autoReadback = true;
  const a = state.aircraft[0]; state.aircraft = [a];
  Object.assign(a, {callsign: "TEST 1", type: profile.id, performanceProfile: profile.id, runway: runway.id,
    position: {x: runway.point.x + east, y: runway.point.y + north}, heading, targetHeading: heading,
    altitude, speed, targetSpeed: speed, speedMode: "auto", frequency: "approach", flightPlan: [], bankAngle: 0});
  delete a.radar!.report; delete a.track; delete a.groundSpeed; delete a.radar!.targetAltitude;
  const env = state.radarEnvironment!;
  const approach = env.approaches.find(item => item.type === "visual" && item.runway === runway.id && (!item.airportIcao || item.airportIcao === airport.icao));
  if (input.mode === "visual" && !approach) throw new Error("This runway has no visual approach in the simulator.");
  const expect: Instruction = input.mode === "visual" ? {type: "expect-approach", approachId: approach!.id}
    : {type: "expect-approach", approachId: null, vectors: true, runway: runway.id};
  let result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command: expect}});
  if (result.error) throw new Error(result.error);
  state = result.state;
  const command: Instruction = input.mode === "visual" ? {type: "vector", approachId: approach!.id} : {type: "frequency", frequency: "unicom"};
  const text = input.mode === "visual" ? `TEST 1, cleared visual runway ${runway.id} approach` : "TEST 1, contact Traffic on 122.80";
  result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "approach", text, command}});
  if (result.error) throw new Error(result.error);
  state = engine.autoReadbacks(engine.advance(result.state, 2), 2000, randomUUID);
  const messages = state.messages.map(message => ({text: message.text, reason: message.unableReason}));
  const reply = messages.find(message => /^Unable\b/i.test(message.text));
  const points: LabPoint[] = [];
  const events: {time: number; label: string}[] = [];
  let outcome = reply ? "Unable" : "In progress", reason = reply?.reason ?? "", lastStage = "";
  function sample(aircraft: Aircraft, time: number) {
    const r = aircraft.radar;
    const stage = r?.navigation === "missed" ? "Missed approach" : r?.arrival ? "Touchdown"
      : r?.patternJoin?.status === "unable" ? "Unable to join"
        : r?.approachIntercept?.visualRecovery ? "Making room for final"
          : r?.patternJoin ? `${r.patternJoin.status === "joining" ? "Joining" : "Flying"} ${aircraft.leg}`
            : r?.captured ? "Established on final" : r?.navigation === "approach" ? "Joining final" : "Heading";
    points.push({x: aircraft.position.x, y: aircraft.position.y, time, altitude: aircraft.altitude, speed: aircraft.speed,
      groundSpeed: aircraft.groundSpeed ?? aircraft.speed, heading: aircraft.heading, stage});
    if (stage !== lastStage) {events.push({time, label: stage}); lastStage = stage;}
  }
  sample(a, 0);
  let current = state.aircraft[0];
  if (!reply && input.mode === "visual" && input.tower) {
    result = engine.applyEnvelope(state, {id: randomUUID(), time: 2, action: {kind: "maneuver", aircraftId: a.id, command: {type: "frequency", frequency: "tower"}}});
    if (result.error) throw new Error(result.error);
    state = result.state; current = state.aircraft[0];
  }
  sample(current, 2);
  if (!reply && current.radar?.patternJoin?.status === "unable") {outcome = "Unable"; reason = current.radar.patternJoin.reason ?? "Unable to join the pattern.";}
  for (let seconds = 2; !reply && outcome === "In progress" && seconds < duration; ) {
    const step = Math.min(5, duration - seconds);
    state = engine.advance(state, step); seconds += step;
    current = state.aircraft.find(item => item.id === a.id)!;
    if (!current) {outcome = "Aircraft removed"; break;}
    sample(current, seconds);
    if (current.radar?.arrival || current.mode === "rollout") outcome = "Landed";
    else if (current.radar?.navigation === "missed" || current.mode === "go-around") {outcome = "Missed approach"; reason = current.radar?.missedReason ?? "Go-around";}
    else if (current.radar?.patternJoin?.status === "unable") {outcome = "Unable"; reason = current.radar.patternJoin.reason ?? "Unable to join the pattern.";}
  }
  return {outcome, reason, points, events, messages, elapsed: points.at(-1)?.time ?? 0};
}
