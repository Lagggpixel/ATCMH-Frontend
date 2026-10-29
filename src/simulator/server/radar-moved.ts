import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly} from "../../lib/simulator-db";
import {SessionError} from "../sessions";
export const isRadarStation = (station: unknown) => typeof station === "string" && /:(approach|center)$/.test(station);
export function rejectMovedRadar(selection: {trainingStation?: string}) {
  if (isRadarStation(selection.trainingStation)) throw new SessionError("radar-moved", "Radar training has moved to simulator.lagggpixel.com.", 410);
}
export async function requireLocalSession(id: string) {
  const rows = await queryReadOnly<(RowDataPacket & {station: string | null})[]>("SELECT JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.trainingStation')) AS station FROM simulator_sessions WHERE id=?", [id]);
  rejectMovedRadar({trainingStation: rows[0]?.station ?? undefined});
}
