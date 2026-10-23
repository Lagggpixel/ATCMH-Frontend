import routes from "./data/point-merge-routes.json";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {courseTo} from "./command-navigation";
import type {RoutePoint} from "./model";
import {blankScenario, seedFromAircraft, type ScenarioDefinition} from "./scenarios";
import {prepareScenarioImport} from "./scenario-import";
import {POINT_MERGE_PRESETS, type PointMergePresetId} from "./point-merge-presets";

const source = "https://www.eurocontrol.int/point-merge";
const exerciseNotes = `Training geometry: named STAR and ILS positions are pinned from InfiniteHorizon, with ILS legs checked on 18 October 2026. Only consecutive identical provider positions were collapsed. Aircraft start upstream of the sequencing arcs; START denotes their current position. Routes retain the source order and continue along the named ILS transition to the runway, excluding missed-approach legs. Exercise levels, speeds, timing and spacing targets below are instructor choices, not published restrictions or operational separation minima. No approach, runway or landing clearance is preassigned.

Vertical profile: follow flight-plan altitudes by default. Descend to the outer arc's lower level or inner arc's higher level before merging; each paired arc has 1,000 ft vertical separation. The filed tail descends toward an ILS intercept level, with a 2,500 ft floor until an approach is explicitly cleared. Controller altitude/vector assignments override the filed descent. Filed ILS geometry is a training intention, not an approach or landing clearance.

Technique: use Vectoring Instructions → Direct To → the merge fix → Send. To combine a level change, use Assign Altitude → band → altitude; selecting the altitude transmits immediately. Readback and movement are separate when Automatic is off: the mentor must accept/assign the instruction. Direct To rejoins the remaining filed route after the fix. It does not clear an approach. Leave an aircraft on its sequencing leg to absorb delay, monitor its remaining arc, and use speed control after release rather than chasing a gap with repeated headings.

Exercise target: plan 5 NM in-trail at the common merge and on final, with 1,000 ft vertical protection while converging until lateral spacing is established. Increase the target for the heavy. Before descent consider the crossing stream and the reduced distance after a shortcut. Assign the intended approach explicitly, vector/intercept where needed, clear it only when achievable and hand over to Tower. These are practice targets, not certification criteria.

Debrief: explain the sequence before releasing traffic; compare the planned and actual merge spacing; identify unused arc capacity, late releases, excessive speed changes and descents issued before conflicts were resolved. Replay the closest convergence. Success means a stable sequence, no loss of the exercise separation target and deliberate recovery when the initial plan stops working.

Concept source: ${source}`;

type Arrival = {route: number; start: string; callsign: string; type: string; altitude: number; speed: number; at: number};
const tasks: Record<PointMergePresetId, {runways: string; brief: string; arrivals: Arrival[]}> = {
  "eidw-point-merge": {
    runways: "28L",
    brief: "LAPMO foundations: ABLI2L (RW28L) enters from SIVNA and BAGS2L (RW28L) from KOGAX. Four arrivals are present at Start; two more check in at 02:30 and 04:30. All begin at 220 kt, upstream at 9,000/10,000 ft, descending to the outer southern arc at 7,000 ft and inner northern arc at 8,000 ft. First name a leader; release it direct LAPMO, then time the opposing lane behind it. Do not descend both lanes together. After the merge, the filed I28L tail continues via MAXEV toward runway 28L. Pause before the fifth arrival and ask the learner to predict its place in the sequence. Optional manual recovery event: deliberately delay one release and have the learner explain a safe new order without forcing the original order.",
    arrivals: [
      {route: 0, start: "SIVNA", callsign: "Shamrock 152", type: "A320", altitude: 9000, speed: 220, at: 0},
      {route: 1, start: "KOGAX", callsign: "Ryanair 7VK", type: "B738", altitude: 10000, speed: 220, at: 0},
      {route: 0, start: "LIPGO", callsign: "Shamrock 339", type: "A320", altitude: 9000, speed: 220, at: 0},
      {route: 1, start: "ADSIS", callsign: "Ryanair 4RP", type: "B738", altitude: 10000, speed: 220, at: 0},
      {route: 0, start: "LIPGO", callsign: "Speedbird 826", type: "A320", altitude: 9000, speed: 220, at: 150},
      {route: 1, start: "ADSIS", callsign: "Shamrock 487", type: "A320", altitude: 10000, speed: 220, at: 270},
    ],
  },
  "ltfm-point-merge": {
    runways: "35R / 34L",
    brief: "East and west mixed-speed sequencing: ATPI1A/ERSE1A merge at VASTE for I35RY (35R); DRAM1A/RILE1A merge at EVBIR for I34LY (34L). Four arrivals start, one in each lane, then one joins every 90 seconds from 02:00. Both sides descend from 11,000/12,000 ft to outer arcs at 9,000 ft and inner arcs at 10,000 ft. A 250 kt B77W and following narrowbodies require an explicit speed/spacing plan; brief an increased gap behind the heavy. Release direct to the aircraft's own merge only when the projected convergence is protected. Direct-to shortcuts reduce descent distance: check the other lane before descending. Both filed tails join their named ILS transitions; explicitly assign and clear the intended approach. Optional manual workload event: ask the learner to accommodate a priority arrival already in the exercise, retaining separation.",
    arrivals: [
      {route: 0, start: "FM408", callsign: "Turkish 1952", type: "B77W", altitude: 11000, speed: 250, at: 0},
      {route: 1, start: "FM507", callsign: "Aegean 992", type: "A320", altitude: 12000, speed: 220, at: 0},
      {route: 2, start: "FM706", callsign: "Turkish 2439", type: "A321", altitude: 11000, speed: 230, at: 0},
      {route: 3, start: "FM808", callsign: "Turkish 2527", type: "B738", altitude: 12000, speed: 240, at: 0},
      {route: 0, start: "FM408", callsign: "Turkish 2321", type: "A320", altitude: 11000, speed: 250, at: 120},
      {route: 2, start: "FM706", callsign: "Lufthansa 1304", type: "A321", altitude: 11000, speed: 220, at: 210},
      {route: 1, start: "FM507", callsign: "Speedbird 676", type: "A320", altitude: 12000, speed: 240, at: 300},
      {route: 3, start: "FM808", callsign: "Turkish 2187", type: "B738", altitude: 12000, speed: 230, at: 390},
    ],
  },
  "rjtt-point-merge": {
    runways: "16L / 16R",
    brief: "Sustained two-stream workload: 24 arrivals, six on each of four lanes, with 12 intended for each runway. XACL and AROSAL converge at SHAFT for the intended 16L stream, then retain their filed tail via SNARE toward SANDY. XACR and GODINR converge at NEURO for intended 16R, then NIGEL/NATTY. Four arrivals start; 20 reinforcements enter every 45 seconds from 02:00 through 16:15, rotating lanes so the same lane receives another aircraft every three minutes. Mixed 220–250 kt traffic and repeated widebodies require sustained speed, wake and release planning across both merges. SHAFT lanes descend from 14,000/13,000 ft to inner XACL at 12,000 ft and outer AROSAL at 11,000 ft; NEURO lanes descend from 12,000/11,000 ft to inner XACR at 10,000 ft and outer GODINR at 9,000 ft. The filed tails continue through I16L and I16R respectively. The two streams have different merge locations and travel distances: use distance/time to each merge rather than a single visual queue. Do not shortcut a 16L aircraft direct NEURO or interchange runway streams to hide a spacing problem. The 16L tail remains long after SHAFT; plan descent along it and monitor interaction with the northern stream. Optional manual recovery: delay one direct-to near its arc end; let the learner use a new order or safe vectors instead of an aggressive descent or late approach clearance. End with both streams stable and explicit runway/approach assignments, followed by a replay of the late release.",
    arrivals: [
      {route: 0, start: "SOLAR", callsign: "All Nippon 686", type: "B788", altitude: 14000, speed: 230, at: 0},
      {route: 1, start: "ALDEN", callsign: "Japan Air 514", type: "B738", altitude: 13000, speed: 230, at: 0},
      {route: 2, start: "NUMAN", callsign: "All Nippon 842", type: "A320", altitude: 12000, speed: 220, at: 0},
      {route: 3, start: "NAMCO", callsign: "Japan Air 326", type: "B788", altitude: 11000, speed: 240, at: 0},
      {route: 0, start: "SOLAR", callsign: "Skymark 716", type: "B738", altitude: 14000, speed: 250, at: 120},
      {route: 3, start: "NAMCO", callsign: "All Nippon 592", type: "A321", altitude: 11000, speed: 220, at: 165},
      {route: 1, start: "ALDEN", callsign: "Japan Air 478", type: "B738", altitude: 13000, speed: 230, at: 210},
      {route: 2, start: "NUMAN", callsign: "Skymark 192", type: "B738", altitude: 12000, speed: 240, at: 255},
      {route: 0, start: "SOLAR", callsign: "All Nippon 864 Heavy", type: "B789", altitude: 14000, speed: 230, at: 300},
      {route: 3, start: "NAMCO", callsign: "Japan Air 128 Heavy", type: "A359", altitude: 11000, speed: 240, at: 345},
      {route: 1, start: "ALDEN", callsign: "Solaseed 54", type: "B738", altitude: 13000, speed: 250, at: 390},
      {route: 2, start: "NUMAN", callsign: "Air Do 26", type: "B738", altitude: 12000, speed: 220, at: 435},
      {route: 0, start: "SOLAR", callsign: "Japan Air 906 Heavy", type: "B763", altitude: 14000, speed: 240, at: 480},
      {route: 3, start: "NAMCO", callsign: "All Nippon 248 Heavy", type: "B788", altitude: 11000, speed: 250, at: 525},
      {route: 1, start: "ALDEN", callsign: "Starflyer 82", type: "A320", altitude: 13000, speed: 220, at: 570},
      {route: 2, start: "NUMAN", callsign: "Japan Air 640 Heavy", type: "B772", altitude: 12000, speed: 230, at: 615},
      {route: 0, start: "SOLAR", callsign: "All Nippon 462", type: "A321", altitude: 14000, speed: 250, at: 660},
      {route: 3, start: "NAMCO", callsign: "Skymark 518", type: "B738", altitude: 11000, speed: 220, at: 705},
      {route: 1, start: "ALDEN", callsign: "Japan Air 304 Heavy", type: "A359", altitude: 13000, speed: 230, at: 750},
      {route: 2, start: "NUMAN", callsign: "All Nippon 756 Heavy", type: "B789", altitude: 12000, speed: 240, at: 795},
      {route: 0, start: "SOLAR", callsign: "Japan Air 612", type: "B738", altitude: 14000, speed: 220, at: 840},
      {route: 3, start: "NAMCO", callsign: "All Nippon 384 Heavy", type: "B772", altitude: 11000, speed: 230, at: 885},
      {route: 1, start: "ALDEN", callsign: "All Nippon 936 Heavy", type: "B788", altitude: 13000, speed: 240, at: 930},
      {route: 2, start: "NUMAN", callsign: "Japan Air 722", type: "B738", altitude: 12000, speed: 250, at: 975},
    ],
  },
};

/** Each click creates a fresh editable draft; no historical revision or session is rewritten. */
export function pointMergeScenario(id: PointMergePresetId): ScenarioDefinition {
  const preset = POINT_MERGE_PRESETS.find(preset => preset.id === id);
  if (!preset) throw new Error("Point merge exercise is unavailable.");
  const task = tasks[id], data = routes[preset.airport], airport = getAirport({airport: preset.airport});
  const draft = blankScenario({airport: preset.airport, trainingStation: `${preset.airport}:approach`}), engine = engineFor(draft);
  draft.title = preset.title;
  draft.instructorNotes = `${preset.level} · ${preset.duration} · ${preset.aircraft} aircraft · Intended runway ${task.runways}\n\n${task.brief}\n\n${exerciseNotes}`;
  const project = (point: {identifier: string; lat: number; lon: number}) => ({name: point.identifier, x: (point.lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (point.lat - airport.origin.lat) * 60});
  draft.aircraft = task.arrivals.map((arrival, index) => {
    const route = data.routes[arrival.route], start = route.points.findIndex(p => p.identifier === arrival.start);
    if (start < 0) throw new Error(`Missing start fix ${arrival.start}`);
    const merge = route.points.findIndex(p => p.identifier === route.merge);
    const threshold = project(route.approachPoints.at(-1)!);
    const interceptAltitude = (point: {x: number; y: number}) => Math.max(2500, Math.round((airport.elevation + Math.hypot(point.x - threshold.x, point.y - threshold.y) * 318) / 500) * 500);
    let altitude = route.arcAltitude;
    const flightPlan: RoutePoint[] = route.points.slice(start).map((point, index) => {
      if (start + index >= merge) altitude = Math.min(altitude, interceptAltitude(project(point)));
      return {...project(point), altitude};
    });
    const tailStart = route.approachPoints[0].identifier === route.points.at(-1)!.identifier ? 1 : 0;
    flightPlan.push(...route.approachPoints.slice(tailStart).map(point => {
      altitude = Math.min(altitude, interceptAltitude(project(point)));
      return {...project(point), altitude};
    }));
    const position = flightPlan[0], heading = courseTo(position, flightPlan[1]);
    return {key: `arrival-${index + 1}`, initial: arrival.at === 0, seed: seedFromAircraft({...engine.newAircraft(`arrival-${index + 1}`, true),
      callsign: arrival.callsign, type: arrival.type, position: {...position}, heading, targetHeading: heading,
      altitude: arrival.altitude, speed: arrival.speed, targetSpeed: arrival.speed, speedMode: "auto", flightPlan, followRouteAltitudes: true,
      destination: {name: preset.airport, point: {x: 0, y: 0}},
      arrivalProcedure: `${route.procedure} / ${route.approach}`, navigationSource: {revision: data.revision, procedureId: route.procedureId, routeId: route.routeId},
      runway: null, radar: {inboundSpeed: arrival.speed, station: "approach", navigation: "route", routeIndex: 0, report: "approach-request"},
    })};
  });
  draft.events = task.arrivals.flatMap((arrival, index) => arrival.at ? [{id: `spawn-${index + 1}`, title: `${arrival.callsign} joins`, trigger: {type: "time" as const, at: arrival.at}, actions: [{type: "spawn" as const, aircraftKey: `arrival-${index + 1}`}]}] : []);
  draft.events.push({id: "recovery", title: "Optional late-release recovery", trigger: {type: "manual"}, actions: [{type: "note", text: "Instructor: choose one aircraft still on its sequencing leg and delay its release. Ask the learner to state remaining delay capacity and a safe recovery plan. This cue does not change aircraft or separation automatically."}]});
  const fixes = new Map(data.routes.flatMap(route => [...route.points, ...route.approachPoints].map(p => [p.identifier, project(p)] as const)));
  draft.radarEnvironment = {...draft.radarEnvironment!, fixes: [...fixes].map(([id, point]) => ({id, point}))};
  return prepareScenarioImport(draft);
}
