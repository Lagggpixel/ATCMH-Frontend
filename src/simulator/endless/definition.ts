
import {z} from "zod/v3";

export const endlessModes = ["local", "approach", "center"] as const;
export const endlessKinds = ["arrival", "departure", "pattern", "intra-sector"] as const;
export const endlessIssues = ["High profile", "No flight plan", "Unsuitable route or STAR"] as const;
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
  }).strict()).min(1).max(24),
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
const approach = (dual: boolean): EndlessDefinition => ({
  title: dual ? "Heathrow dual-runway Approach" : "Heathrow single-runway Approach",
  briefing: dual ? "Sequence arrivals to Heathrow 27L and 27R. Each runway generates its own arrival stream. Departures start disabled."
    : "Sequence arrivals to Heathrow 27L. To practise mixed operations, enable departures from 27R before starting.",
  airport: "EGLL", mode: "approach", issuePercent: 20,
  streams: [
    stream("27L arrivals", "arrival", 60, "EIDW", "EGLL", "27L"),
    ...(dual ? [stream("27R arrivals", "arrival", 60, "EBBR", "EGLL", "27R")] : []),
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
      stream("Heathrow external arrivals", "arrival", 8, "EIDW", "EGLL", "27L"),
      stream("Stansted external arrivals", "arrival", 8, "EBBR", "EGSS", "22"),
      stream("Heathrow outbound", "departure", 4, "EGLL", "EIDW", "27R"),
      stream("Stansted outbound", "departure", 4, "EGSS", "EBBR", "22"),
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
