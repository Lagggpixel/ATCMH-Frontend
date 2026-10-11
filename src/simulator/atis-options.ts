import type {Atis} from "./model";

/** Adapt old labels for editing/publication; archived snapshots remain unchanged. */
export function currentAtisOptions(draft: Atis): Atis {
  const remarks = draft.remarks.filter(value => !["Separate ground and tower frequencies", "MULT. FREQ. IN USE"].includes(value)).map(value => value === "No circuit training" ? "No Pattern Work" : value === "Hold at stand" ? "Gate Hold" : value);
  const notams = draft.notams.filter(value => !["Training event", "Training Event", "EVENT"].includes(value)).map(value => ["Simulated low visibility", "LOW VISIBILITY"].includes(value) ? "Low Visibility" : value);
  return {...draft, remarks: [...new Set(remarks)], notams: [...new Set(notams)]};
}
