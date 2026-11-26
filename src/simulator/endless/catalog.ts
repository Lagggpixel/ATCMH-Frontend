import {localPoint} from "../aviation";
import aviation from "../data/aviation.json";
import pointMergeRoutes from "../data/point-merge-routes.json";
import type {Airport, PERFORMANCE_PROFILE_IDS, RadarApproach} from "../model";
import type {NavigationSource} from "../server/navigation-api";
import type {EndlessStream} from "./definition";

type Waypoint = {identifier: string; lat: number; lon: number};
type Procedure = NavigationSource["procedures"][number];
type ProcedurePoint = Procedure["routes"][number]["points"][number];
type RunwayEnd = Waypoint & {heading: number; lengthFeet: number};
type Origin = {name: string; elevation: number; runways: [RunwayEnd, RunwayEnd][]; sids: Procedure[]; outboundFixes: Waypoint[]};

const tmaEntries = {
  LTFM: [
    ["RIXEN", 42.082222, 28.766111], ["ATPIX", 41.753333, 30.623611],
    ["ERSEN", 40.865556, 30.666111], ["SISPI", 39.914722, 29.870000],
    ["INBET", 40.186389, 27.275000], ["AYTEK", 41.808056, 26.361667],
    ["RILEX", 41.971111, 26.766389], ["TOKER", 40.313333, 30.772222],
    ["EMGIM", 39.909444, 29.542222], ["KANQO", 41.225000, 30.760000],
    ["NUGBA", 41.591111, 30.674167], ["DRAMO", 41.034444, 26.611111],
    ["NABJA", 41.057806, 30.716222], ["VUTZO", 40.199167, 27.511944],
  ],
  RJTT: [
    ["SPENS", 34.714833, 139.001528], ["SELNO", 34.284333, 139.124639],
    ["DOLBA", 34.700833, 141.435306], ["TEDIX", 36.631056, 140.327056],
    ["LALID", 35.944083, 141.764472], ["TOPIT", 34.194833, 139.995056],
    ["GULBO", 35.442472, 141.752667], ["LESPO", 35.776667, 141.760500],
    ["GURIP", 36.554556, 140.626806],
  ],
} as const;

const pointMergeEntries = Object.values(pointMergeRoutes).flatMap(({routes}) =>
  routes.map(route => route.points[0]));

export const ENDLESS_WAYPOINTS: readonly Waypoint[] = [
  ...Object.values(tmaEntries).flatMap(entries => [...entries]).map(([identifier, lat, lon]) => ({identifier, lat, lon})),
  ...new Map(pointMergeEntries.map(point => [point.identifier, point])).values(),
].filter((point, index, points) => points.findIndex(other => other.identifier === point.identifier) === index);

type Threshold = readonly [identifier: string, lat: number, lon: number];
type RunwayPair = readonly [lengthFeet: number, first: Threshold, opposite: Threshold];
type RegionalAirport = readonly [name: string, elevation: number, ...runways: RunwayPair[]];

// Threshold coordinates and published lengths for airports outside the simulator's aviation snapshot.
const regionalAirports: Record<string, RegionalAirport> = {
  RJCC: ["New Chitose Airport", 82,
    [9843, ["01L", 42.7616, 141.692993], ["19R", 42.788399, 141.688004]],
    [9843, ["01R", 42.762001, 141.695999], ["19L", 42.788799, 141.692001]],
  ],
  RJFF: ["Fukuoka Airport", 32,
    [9186, ["16L", 33.596901, 130.442993], ["34R", 33.575001, 130.457993]],
    [8202, ["16R", 33.59597, 130.441223], ["34L", 33.576405, 130.45459]],
  ],
  RJBB: ["Kansai International Airport", 26,
    [13123, ["06L", 34.428501, 135.206161], ["24R", 34.451332, 135.240005]],
    [11483, ["06R", 34.4174, 135.229004], ["24L", 34.437199, 135.259003]],
  ],
  RJOO: ["Osaka International Airport", 50,
    [5997, ["14L", 34.7953, 135.429001], ["32R", 34.7836, 135.442993]],
    [9840, ["14R", 34.791302, 135.429001], ["32L", 34.772202, 135.451996]],
  ],
  RJGG: ["Chubu Centrair International Airport", 15,
    [11483, ["18", 34.873901, 136.802002], ["36", 34.842899, 136.809006]],
  ],
  RKSI: ["Incheon International Airport", 23,
    [12303, ["15L", 37.483898, 126.440002], ["33R", 37.456402, 126.464996]],
    [12303, ["15R", 37.4818, 126.435997], ["33L", 37.454201, 126.460999]],
    [13123, ["16L", 37.47274, 126.415631], ["34R", 37.443432, 126.441697]],
    [12303, ["16R", 37.468746, 126.413446], ["34L", 37.441272, 126.437882]],
  ],
  RCTP: ["Taiwan Taoyuan International Airport", 106,
    [12008, ["05L", 25.072901, 121.216003], ["23R", 25.094475, 121.243378]],
    [10991, ["05R", 25.060843, 121.223488], ["23L", 25.0833, 121.251999]],
  ],
  ZSPD: ["Shanghai Pudong International Airport", 13,
    [12467, ["16L", 31.160175, 121.816162], ["34R", 31.127575, 121.828461]],
    [12467, ["16R", 31.159, 121.811996], ["34L", 31.1264, 121.823997]],
    [13123, ["17L", 31.161301, 121.786003], ["35R", 31.127001, 121.799004]],
    [11154, ["17R", 31.154833, 121.783165], ["35L", 31.125666, 121.794167]],
  ],
  VHHH: ["Hong Kong International Airport", 28,
    [12467, ["07C", 22.311267, 113.899067], ["25C", 22.320236, 113.926883]],
    [12467, ["07L", 22.321589, 113.882294], ["25R", 22.331792, 113.913956]],
    [12467, ["07R", 22.296675, 113.899442], ["25L", 22.307431, 113.932819]],
  ],
  LTAC: ["Ankara Esenboğa Airport", 3158,
    [12303, ["03C", 40.114058, 32.983178], ["21C", 40.141331, 33.009164]],
    [11125, ["03L", 40.117802, 32.9837], ["21R", 40.142399, 33.007198]],
    [12303, ["03R", 40.100353, 32.989739], ["21L", 40.127611, 33.015714]],
  ],
  LTAI: ["Antalya Airport", 177,
    [11155, ["18C", 36.915501, 30.794701], ["36C", 36.885101, 30.7906]],
    [11155, ["18L", 36.9114, 30.811399], ["36R", 36.880901, 30.807199]],
    [9811, ["18R", 36.915699, 30.7924], ["36L", 36.889, 30.7887]],
  ],
  LLBG: ["Ben Gurion Airport", 135,
    [9094, ["03", 31.996216, 34.886082], ["21", 32.018124, 34.900227]],
    [13327, ["08", 32.013, 34.860401], ["26", 32.018902, 34.898602]],
    [10209, ["12", 32.014702, 34.865799], ["30", 31.999901, 34.894199]],
  ],
  HECA: ["Cairo International Airport", 382,
    [13123, ["05C", 30.099701, 31.398199], ["23C", 30.123301, 31.4296]],
    [10827, ["05L", 30.119699, 31.380199], ["23R", 30.139099, 31.4063]],
    [13124, ["05R", 30.097166, 31.419001], ["23L", 30.120667, 31.4505]],
  ],
  OMDB: ["Dubai International Airport", 62,
    [14275, ["12L", 25.264628, 55.350422], ["30R", 25.247708, 55.380931]],
    [14590, ["12R", 25.252836, 55.364375], ["30L", 25.235919, 55.394881]],
  ],
  OTHH: ["Hamad International Airport", 13,
    [15912, ["16L", 25.296101, 51.608799], ["34R", 25.2554, 51.626801]],
    [13944, ["16R", 25.291, 51.589699], ["34L", 25.255301, 51.6054]],
  ],
  LROP: ["Henri Coandă International Airport", 314,
    [11484, ["08L", 44.5765, 26.0839], ["26R", 44.5798, 26.1278]],
    [11484, ["08R", 44.564499, 26.076599], ["26L", 44.567799, 26.120399]],
  ],
  UUEE: ["Sheremetyevo International Airport", 622,
    [11647, ["06C", 55.969799, 37.3867], ["24C", 55.978001, 37.4417]],
    [10499, ["06L", 55.980999, 37.328899], ["24R", 55.9884, 37.378502]],
    [12139, ["06R", 55.967098, 37.386299], ["24L", 55.9757, 37.443699]],
  ],
};

const mappedAirports = [
  "ROAH", "EIDW", "EBBR", "EDDL", "EDDS", "LFMN", "LIME", "LGAV", "LQSA",
  "LBSF", "EGPH", "EGLL", "EGSS", "LTFM", "RJTT",
];
const radians = Math.PI / 180;
const reciprocal = (heading: number) => (heading + 180) % 360;
const eastNm = (from: Waypoint, to: Waypoint) =>
  (to.lon - from.lon) * 60 * Math.cos((from.lat + to.lat) / 2 * radians);
const distance = (from: Waypoint, to: Waypoint) => Math.hypot(eastNm(from, to), (to.lat - from.lat) * 60);
const bearing = (from: Waypoint, to: Waypoint) =>
  (Math.atan2(eastNm(from, to), (to.lat - from.lat) * 60) / radians + 360) % 360;

function offset(point: Waypoint, identifier: string, heading: number, nm: number): Waypoint {
  const lat = point.lat + nm * Math.cos(heading * radians) / 60;
  const lon = point.lon + nm * Math.sin(heading * radians) / (60 * Math.cos((point.lat + lat) / 2 * radians));
  return {identifier, lat, lon};
}

function runwayEnds(first: Threshold, opposite: Threshold, length?: number): [RunwayEnd, RunwayEnd] {
  const [a, b] = [first, opposite].map(([identifier, lat, lon]) => ({
    identifier: identifier.replace(/^(\d)([LRC]?)$/, "0$1$2"), lat, lon,
  }));
  const lengthFeet = length ?? Math.round(distance(a, b) * 6076.12);
  const heading = bearing(a, b);
  return [{...a, lengthFeet, heading}, {...b, lengthFeet, heading: reciprocal(heading)}];
}

function procedure(icao: string, type: Procedure["type"], identifier: string, runway: string, points: ProcedurePoint[]): Procedure {
  const id = `endless:${icao}:${type}:${identifier}`;
  const transition = `RW${runway}`;
  return {id, type, identifier, routes: [{id: `${id}:${transition}`, transition, points}]};
}

const directions = [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const;

function makeOrigin(icao: string, name: string, elevation: number, runways: Origin["runways"]): Origin {
  // Local training routes use runway geometry and directional outbound fixes.
  const departures = runways.flatMap(pair => pair.map((end, index) => {
    const runway = end.identifier;
    const climb = offset(pair[1 - index], `${icao}-RW${runway}-OUT`, end.heading, 5);
    return directions.map(([direction, course]) => {
      const exit = offset(climb, `${icao}-RW${runway}-${direction}`, course, 20);
      return {exit, sid: procedure(icao, "SID", `RW${runway}-${direction}`, runway, [climb, exit])};
    });
  })).flat();
  return {name, elevation, runways, sids: departures.map(d => d.sid), outboundFixes: departures.map(d => d.exit)};
}

function mappedOrigin(icao: string): Origin {
  const rows = aviation.rows.filter(row => row.icao === icao);
  const airport = rows.find(row => row.kind === "airport");
  const runways = rows.flatMap(row => {
    if (row.kind !== "runway" || row.endIndex !== 0 || !row.id || row.lat == null || row.lon == null) return [];
    const opposite = rows.find(end => end.kind === "runway" && end.runwayIndex === row.runwayIndex && end.endIndex === 1);
    if (!opposite?.id || opposite.lat == null || opposite.lon == null) return [];
    return [runwayEnds([row.id, row.lat, row.lon], [opposite.id, opposite.lat, opposite.lon])];
  });
  return makeOrigin(icao, airport?.name ?? icao, Math.round(airport?.elevation ?? 0), runways);
}

export const ENDLESS_ORIGINS: Readonly<Partial<Record<string, Origin>>> = Object.fromEntries([
  ...mappedAirports.map(icao => [icao, mappedOrigin(icao)] as const),
  ...Object.entries(regionalAirports).map(([icao, [name, elevation, ...pairs]]) => [
    icao, makeOrigin(icao, name, elevation, pairs.map(([length, first, opposite]) => runwayEnds(first, opposite, length))),
  ] as const),
]);

export function endlessOriginApproaches(scopeAirport: Airport, icao: string): RadarApproach[] {
  icao = icao.toUpperCase();
  const origin = ENDLESS_ORIGINS[icao];
  return origin?.runways.flatMap(pair => pair.map((end, index): RadarApproach => {
    const opposite = pair[1 - index];
    return {
      id: `${icao === scopeAirport.icao ? "" : icao + ":"}visual-${end.identifier}`,
      type: "visual", runway: end.identifier, finalDistance: 15, captureWidth: .5, glideAngle: 3,
      missedHeading: end.heading, airportIcao: icao, airportName: origin.name, elevation: origin.elevation,
      threshold: localPoint(scopeAirport, end.lat, end.lon), departure: localPoint(scopeAirport, opposite.lat, opposite.lon),
    };
  })) ?? [];
}

function atAltitude(point: Waypoint, altitude: number): ProcedurePoint {
  return {...point, altitudeConstraint: {min: altitude, max: altitude}};
}

function pointMergeProcedures(icao: string, data: (typeof pointMergeRoutes)[keyof typeof pointMergeRoutes], elevation: number) {
  const approaches = new Map<string, Procedure>();
  const stars = data.routes.map(route => {
    const runway = route.approachRunway;
    const mergeIndex = route.points.findIndex(p => p.identifier === route.merge);
    const arcIndex = route.points.findIndex(p => p.identifier === route.arcStart);
    const initialApproach = route.approachPoints[0];
    const threshold = route.approachPoints.at(-1)!;
    const faf = route.approachPoints[route.approachPoints.length - 2];
    const fafAgl = icao === "RJTT" ? 3000 : 2500;
    const initialAgl = Math.max(fafAgl, Math.min(6000, Math.round(distance(initialApproach, threshold) * 318 / 500) * 500));
    const initialAltitude = elevation + initialAgl;
    if (!approaches.has(route.approach)) {
      let previousAgl = initialAgl;
      const points = route.approachPoints.map(point => {
        if (point === threshold) return point;
        const glideAltitude = Math.round(distance(point, threshold) * 318 / 500) * 500;
        const agl = point === faf ? fafAgl : Math.max(fafAgl, Math.min(previousAgl, glideAltitude));
        previousAgl = agl;
        return atAltitude(point, elevation + agl);
      });
      approaches.set(route.approach, {
        ...procedure(icao, "Approach", route.approach, runway, points), approachType: "ILS",
      });
    }
    const tail = route.points.length - 1 - mergeIndex;
    const points = route.points.map((point, index) => {
      if (index < mergeIndex) return atAltitude(point, index < arcIndex ? route.arcAltitude + 2000 : route.arcAltitude);
      const progress = tail === 0 ? 1 : (index - mergeIndex) / tail;
      return atAltitude(point, Math.round(route.arcAltitude + (initialAltitude - route.arcAltitude) * progress));
    });
    return procedure(icao, "STAR", route.procedure, runway, points);
  });
  return [...stars, ...approaches.values()];
}

function visualArrival(icao: string, end: RunwayEnd): Procedure {
  const runway = end.identifier;
  const heading = reciprocal(end.heading);
  const entry = offset(end, `${icao}-RW${runway}-IN`, heading, 25);
  const final = offset(end, `${icao}-RW${runway}-FINAL`, heading, 9);
  return procedure(icao, "STAR", `RW${runway}-IN`, runway, [entry, final]);
}

export function endlessFallbackNavigation(icao: string): NavigationSource | undefined {
  icao = icao.toUpperCase();
  if (!Object.hasOwn(ENDLESS_ORIGINS, icao)) return undefined;
  const origin = ENDLESS_ORIGINS[icao]!;
  const data = Object.hasOwn(pointMergeRoutes, icao) ? pointMergeRoutes[icao as keyof typeof pointMergeRoutes] : undefined;
  const arrivals = data ? pointMergeProcedures(icao, data, origin.elevation)
    : origin.runways.flatMap(pair => pair.map(end => visualArrival(icao, end)));
  const procedures = [...origin.sids, ...arrivals];
  const points = [...ENDLESS_WAYPOINTS, ...origin.outboundFixes,
    ...procedures.flatMap(p => p.routes.flatMap(route => route.points))];
  const waypoints = [...new Map(points.map(({identifier, lat, lon}) =>
    [identifier, {identifier, lat, lon, id: `endless:${icao}:${identifier}`}])).values()];
  return {version: 1, icao, revision: data ? `endless-v1:${data.revision}` : "endless-v1", procedures, waypoints};
}

type AircraftType = typeof PERFORMANCE_PROFILE_IDS[number];
type Carrier = readonly [telephony: string, weight: number, fleet: readonly [AircraftType, ...AircraftType[]]];

const istanbulCarriers: readonly Carrier[] = [
  ["Turkish", 12, ["A321", "A21N", "B738", "B739", "A333", "A359", "B77W", "B789"]],
  ["Sunturk", 3, ["B738", "B739"]], ["Anatolia", 3, ["B738", "A21N"]], ["Aegean", 2, ["A320", "A20N"]],
  ["Lufthansa", 2, ["A320", "A321"]], ["Speedbird", 2, ["A320", "A321"]], ["Air France", 2, ["A223", "A320"]],
  ["KLM", 2, ["B738", "B739"]], ["Tarom", 1, ["B737", "B738"]], ["Aeroflot", 2, ["A321", "A333"]],
  ["Emirates", 2, ["B77W", "A388"]], ["Qatari", 2, ["A333", "B77W"]], ["Egyptair", 1, ["B738", "A20N"]],
  ["El Al", 1, ["B738", "B789"]],
];
const hanedaCarriers: readonly Carrier[] = [
  ["All Nippon", 6, ["A321", "B738", "B772", "B788", "B789", "B78X"]],
  ["Japan Air", 6, ["B738", "B763", "B788", "A359"]],
  ["Skymark", 3, ["B738"]], ["Air Do", 2, ["B737", "B763"]], ["Starflyer", 2, ["A320", "A20N"]],
  ["Solaseed", 2, ["B738"]], ["Korean Air", 2, ["A333", "B77W"]], ["Dynasty", 1, ["A333", "A359"]],
  ["EVA", 1, ["A321", "B78X"]], ["China Eastern", 1, ["A320", "A333"]], ["Cathay", 1, ["A333", "A359"]],
];
const heathrowCarriers: readonly Carrier[] = [
  ["Speedbird", 10, ["A319", "A320", "A321", "A20N", "A21N", "B772", "B77W", "B788", "B789", "B78X", "A359", "A388"]],
  ["Virgin", 5, ["A333", "A339", "A35K", "B789"]], ["Shamrock", 2, ["A320", "A20N"]],
  ["KLM", 2, ["B738", "E190"]], ["Lufthansa", 2, ["A320", "A321"]], ["Air France", 2, ["A223", "A320"]],
  ["Swiss", 2, ["A223", "A320"]], ["Brussels", 1, ["A319", "A320"]], ["Aegean", 1, ["A320", "A21N"]],
];
const stanstedCarriers: readonly Carrier[] = [
  ["Ryanair", 9, ["B738"]], ["Easy", 3, ["A319", "A320", "A20N"]], ["Channex", 2, ["B738", "A321"]],
  ["Aegean", 1, ["A320", "A20N"]],
];
const edinburghCarriers: readonly Carrier[] = [
  ["Easy", 6, ["A319", "A320", "A20N"]], ["Ryanair", 5, ["B738"]], ["Speedbird", 3, ["A319", "A320", "A321"]],
  ["Shamrock", 2, ["A320", "A20N"]], ["KLM", 2, ["B738", "E190"]], ["Lufthansa", 2, ["A319", "A320"]],
  ["Air France", 2, ["A223", "A320"]], ["Swiss", 1, ["A223", "A320"]], ["Brussels", 1, ["A319", "A320"]],
];
const scopeCarriers: Readonly<Partial<Record<string, readonly Carrier[]>>> = {
  LTFM: istanbulCarriers, RJTT: hanedaCarriers,
  EGLL: heathrowCarriers, EGSS: stanstedCarriers, EGPH: edinburghCarriers,
};
const routeCarriers: Readonly<Partial<Record<string, readonly Carrier[]>>> = {
  RKSI: [["Korean Air", 6, ["B739", "A333", "B77W", "B789", "B748"]]],
  RCTP: [["Dynasty", 4, ["A21N", "A333", "A359"]], ["EVA", 4, ["A321", "B77W", "B78X"]]],
  ZSPD: [["China Eastern", 6, ["A320", "A21N", "A333", "B77W"]]],
  VHHH: [["Cathay", 6, ["A333", "A359", "B77W"]]],
  LLBG: [["El Al", 5, ["B738", "B739", "B788", "B789"]]],
  HECA: [["Egyptair", 5, ["A223", "B738", "A20N", "B789"]]],
  OMDB: [["Emirates", 6, ["B77W", "A388"]], ["Sky Dubai", 3, ["B738", "B739"]]],
  OTHH: [["Qatari", 6, ["A320", "A333", "A359", "B77W", "B788", "B789"]]],
  LROP: [["Tarom", 6, ["B737", "B738"]]],
  UUEE: [["Aeroflot", 6, ["A320", "A321", "A333", "A359", "B77W"]]],
  EIDW: [["Shamrock", 7, ["A320", "A20N"]]],
  EBBR: [["Brussels", 5, ["A319", "A320", "A20N"]]],
  EDDL: [["Eurowings", 6, ["A319", "A320", "A20N"]]],
  EDDS: [["Eurowings", 6, ["A319", "A320", "A20N"]]],
  LFMN: [["Air France", 5, ["A223", "A319", "A320", "E190"]]],
  LIME: [["Ryanair", 7, ["B738"]]],
  LGAV: [["Aegean", 6, ["A320", "A20N", "A21N"]]],
  LQSA: [["Swiss", 4, ["A223", "A320"]]],
  LBSF: [["Bulgaria Air", 5, ["A223", "A319", "A320", "E190"]]],
};
const heavyTypes = new Set<AircraftType>(["A333", "A359", "B744", "B748", "B763", "B772", "B77W", "B788", "B789", "B78X"]);
const defaultCarriers: readonly Carrier[] = [["Airliner", 1, ["A320", "B738", "E190"]]];

export function pickEndlessCarrier(
  scopeAirport: string,
  stream: Pick<EndlessStream, "origin" | "destination" | "kind">,
  entropy: number,
  serial: number,
): {callsign: string; type: typeof PERFORMANCE_PROFILE_IDS[number]} {
  const scope = scopeAirport.toUpperCase();
  const origin = stream.origin.toUpperCase();
  const destination = stream.destination.toUpperCase();
  const other = stream.kind === "departure" || origin === scope ? destination : origin;
  const regional = scopeCarriers[scope] ?? defaultCarriers;
  const partner = other === scope ? [] : routeCarriers[other] ?? scopeCarriers[other] ?? [];
  const carriers = [...regional, ...partner];
  let roll = (entropy >>> 0) % carriers.reduce((sum, [, weight]) => sum + weight, 0);
  const [telephony, , fleet] = carriers.find(([, weight]) => {
    roll -= weight;
    return roll < 0;
  })!;
  const type = fleet[((entropy ^ Math.imul(serial, 0x9e3779b1)) >>> 0) % fleet.length];
  const suffix = type === "A388" ? " Super" : heavyTypes.has(type) ? " Heavy" : "";
  const flightNumber = 300 + serial;
  return {callsign: `${telephony} ${flightNumber}${suffix}`, type};
}

const istanbulEntries = new Set<string>(tmaEntries.LTFM.map(([identifier]) => identifier));
const hanedaSpeeds: Readonly<Partial<Record<string, number>>> = {
  SOLAR: 230, SCOUT: 230, TT250: 230, ALDEN: 230, SALLY: 230, TT256: 230,
  NUMAN: 210, NORIK: 210, NAMCO: 210, TT680: 210, SHAFT: 210, NEURO: 210,
  SANDY: 185, NATTY: 185,
};

export function endlessFixSpeed(airport: string, fixName: string | undefined): number | undefined {
  const fix = fixName?.trim().toUpperCase();
  if (!fix) return undefined;
  switch (airport.toUpperCase()) {
    case "LTFM":
      if (istanbulEntries.has(fix)) return 250;
      if (/^FM[4578]\d{2}$/.test(fix)) return 230;
      return fix === "VASTE" || fix === "EVBIR" ? 220 : undefined;
    case "RJTT":
      return hanedaSpeeds[fix];
    default:
      return undefined;
  }
}
