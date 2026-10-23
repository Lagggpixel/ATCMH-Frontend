/** Small catalogue shared with the library; route geometry stays on the server. */
export const POINT_MERGE_PRESETS = [
  {id: "eidw-point-merge", airport: "EIDW", title: "Dublin — Point merge foundations", level: "Foundation", aircraft: 6, duration: "15–20 min", description: "Build one arrival sequence at LAPMO. Learn when to shorten the sequencing legs and when to keep aircraft on the arc."},
  {id: "ltfm-point-merge", airport: "LTFM", title: "Istanbul — Mixed-speed point merge", level: "Intermediate", aircraft: 8, duration: "20–25 min", description: "Work east and west streams at VASTE and EVBIR toward ILS 35R and 34L, managing mixed speeds and layered arcs."},
  {id: "rjtt-point-merge", airport: "RJTT", title: "Haneda — Two-stream point merge", level: "Advanced", aircraft: 24, duration: "25–30 min", description: "Sequence 24 arrivals through SHAFT and NEURO, manage sustained 45-second entries and recover from a late direct-to instruction."},
] as const;
export type PointMergePresetId = typeof POINT_MERGE_PRESETS[number]["id"];
