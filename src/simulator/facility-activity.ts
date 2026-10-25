import type {RadarEnvironment} from "./model";

/** Missing defaults retain historical snapshots; fresh exercises opt into offline. */
export function facilityActive(facility: {id: string; type: string; active: boolean}, environment?: Pick<RadarEnvironment, "facilityActivity" | "facilityDefaultActive">, legacyActive = facility.active): boolean {
  return environment?.facilityActivity?.[facility.id] ?? (facility.type === "unicom" ? legacyActive : environment?.facilityDefaultActive ?? legacyActive);
}

