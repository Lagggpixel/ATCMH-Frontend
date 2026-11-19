
import {z} from "zod/v3";

export const endlessModes = ["local", "approach", "center"] as const;
export const endlessKinds = ["arrival", "departure", "pattern", "intra-sector"] as const;
export const endlessIssues = ["High profile", "No flight plan", "Unsuitable route or STAR"] as const;
export const maxEndlessStreams = 48;
const icao = z.string().regex(/^[A-Z]{4}$/, "Enter a four-letter airport code.");
const runway = z.string().regex(/^(0[1-9]|[12][0-9]|3[0-6])[LRC]?$/, "Enter a runway end such as 27L.");
const short = z.string().trim().max(100);
export const endlessDefinition = z.object({
  title: short.min(1).max(80),
  briefing: z.string().trim().min(1).max(4000),
  airport: icao,
  mode: z.enum(endlessModes),
  sector: short.optional(),
  issuePercent: z.number().int().min(0).max(100),
  streams: z.array(z.object({
    name: short.min(1),
    kind: z.enum(endlessKinds),
    rate: z.number().min(0).max(120),
    origin: icao,
    destination: icao,
    runway,
    departureRunway: runway.optional(),
    arrivalRunway: runway.optional(),
    sid: short.optional(),
    via: z.string().trim().max(400).optional(),
    star: short.optional(),
  }).strict()).min(1).max(maxEndlessStreams),
}).strict();
export type EndlessDefinition = z.infer<typeof endlessDefinition>;
export type EndlessStream = EndlessDefinition["streams"][number];
export type EndlessIssue = typeof endlessIssues[number];

export function radarStreamRunways(stream: EndlessStream) {
  return {
    departure: stream.departureRunway ?? (stream.kind === "arrival" ? undefined : stream.runway),
    arrival: stream.arrivalRunway ?? (stream.kind === "arrival" ? stream.runway : undefined),
  };
}

export const londonCenter = "9113b47a-2bfe-82eb-ceec-fda5022a8cfa";
const stream = (name: string, kind: EndlessStream["kind"], rate: number, origin: string, destination: string, runway: string): EndlessStream =>
  ({name, kind, rate, origin, destination, runway});

type ArrivalRoute = readonly [origin: string, star: string, departureRunway?: string];

const heathrowRoutes: readonly ArrivalRoute[] = [
  ["EIDW", "NUGR1H"], ["EBBR", "BARM1H"], ["EGPH", "HON1H"], ["LFMN", "ROXO1H", "22R"],
  ["EIDW", "FITB1H"], ["EDDL", "LOGA2H", "23R"], ["EGPH", "TOBI1X"], ["EDDS", "ALES1H"],
  ["EIDW", "BEDE1H"], ["LIME", "TANE1Z"], ["EGPH", "LAM1Y"], ["LFMN", "OTME1H", "22R"],
  ["EIDW", "HAZE1H"], ["EDDS", "BIG1Z"], ["EGPH", "OCK1Z"], ["LIME", "ALES1H"],
  ["EIDW", "TOBI1X"], ["EBBR", "LOGA2H"], ["EIDW", "LAM1Z"], ["LGAV", "BIG1Z"],
  ["EIDW", "OCK1Z"], ["LQSA", "TANE1Z"], ["EGPH", "BEDE1Z"], ["EDDL", "LAM1X", "23R"],
  ["EIDW", "OTME1H"], ["LBSF", "ALES1H"], ["EGPH", "FITB1H"], ["EBBR", "TANE1Z"],
  ["EIDW", "HON1H"], ["LFMN", "ALES1H", "22R"],
];

const stanstedRoutes: readonly ArrivalRoute[] = [
  ["EBBR", "XAMA1A"], ["EGPH", "LIST1L"], ["EIDW", "BEDE1L"], ["LFMN", "BANV1L", "22R"],
  ["EDDL", "RINI1A", "23R"], ["EDDS", "TOSV1A"], ["LIME", "LOGA2A"], ["LGAV", "BARM2A"],
];

function arrivalStream([origin, star, departureRunway]: ArrivalRoute, destination: string, runway: string, rate: number): EndlessStream {
  return {
    ...stream(`${origin} via ${star}`, "arrival", rate, origin, destination, runway),
    star,
    ...(departureRunway ? {departureRunway} : {}),
  };
}

const approach = (dual: boolean): EndlessDefinition => ({
  title: dual ? "Heathrow dual-runway Approach" : "Heathrow single-runway Approach",
  briefing: dual ? "Sequence 30 arrival streams split between Heathrow 27L and 27R. Departures start disabled."
    : "Sequence 30 arrival streams to Heathrow 27L. To practise mixed operations, enable departures from 27R before starting.",
  airport: "EGLL", mode: "approach", issuePercent: 20,
  streams: [
    ...heathrowRoutes.map((route, index) => arrivalStream(route, "EGLL", dual && index % 2 === 1 ? "27R" : "27L", dual ? 4 : 2)),
    stream("27R departures", "departure", 0, "EGLL", "EIDW", "27R"),
  ],
});

export const endlessPresets: Record<string, EndlessDefinition> = {
  edinburgh: {
    title: "Edinburgh Ground & Tower", airport: "EGPH", mode: "local", issuePercent: 0,
    briefing: "Work both Ground and Tower on runway 24. Coordinate gate departures, inbound full stops and circuit traffic requesting touch-and-goes.",
    streams: [
      stream("Gate departures", "departure", 12, "EGPH", "EIDW", "24"),
      stream("Inbound arrivals", "arrival", 10, "EIDW", "EGPH", "24"),
      stream("Circuit work", "pattern", 6, "EGPH", "EGPH", "24"),
    ],
  },
  "heathrow-single": approach(false),
  "heathrow-dual": approach(true),
  london: {
    title: "London Center", airport: "EGLL", mode: "center", sector: londonCenter, issuePercent: 20,
    briefing: "Work London Center with Heathrow and Stansted. Sequence external arrivals, hand outbound flights to neighbouring Center, and coordinate traffic between the two airports.",
    streams: [
      ...stanstedRoutes.flatMap((route, index) => [
        arrivalStream(heathrowRoutes[index], "EGLL", "27L", 1),
        arrivalStream(route, "EGSS", "22", 1),
      ]),
      ...["EIDW", "EGPH", "EBBR", "LIME"].map(destination => stream(`EGLL → ${destination}`, "departure", 1, "EGLL", destination, "27R")),
      ...["EBBR", "EDDS", "EGPH", "EIDW"].map(destination => stream(`EGSS → ${destination}`, "departure", 1, "EGSS", destination, "22")),
      {...stream("Heathrow to Stansted", "intra-sector", 3, "EGLL", "EGSS", "27R"), arrivalRunway: "22"},
      {...stream("Stansted to Heathrow", "intra-sector", 3, "EGSS", "EGLL", "22"), arrivalRunway: "27L"},
    ],
  },
};

export const separationFor = (mode: EndlessDefinition["mode"]) =>
  mode === "local" ? undefined : {nm: mode === "approach" ? 3 : 5, feet: 1000};

export function endlessOperations(definition: EndlessDefinition) {
  return definition.streams.filter(stream => stream.rate > 0).map(stream =>
    `${stream.name} · ${stream.origin} → ${stream.destination} · RWY ${stream.runway} · ${stream.rate}/hour`);
}
