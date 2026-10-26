import type {Aircraft, Exercise} from "./model";

/** A training position has a stable identity; its channel and occupant can change. */
export interface ControllerPosition {
  id: string; name: string; service: "approach"; facilityId: string; mhz: string; briefing?: string;
}
export interface PositionPresence extends ControllerPosition {
  occupied: boolean; traineeId?: string; traineeName?: string; assignedId?: string; assignedName?: string;
}
export const aircraftPosition = (exercise: Pick<Exercise, "positions">, aircraft: Pick<Aircraft, "positionId" | "frequency">) =>
  aircraft.positionId ?? (aircraft.frequency === "approach" ? exercise.positions?.[0]?.id : undefined);
export const ownsAircraft = (exercise: Pick<Exercise, "positions">, aircraft: Pick<Aircraft, "positionId" | "frequency">, positionId?: string) =>
  !exercise.positions?.length || !!positionId && aircraftPosition(exercise, aircraft) === positionId;
export function positionLabel(exercise: Pick<Exercise, "positions">, aircraft: Pick<Aircraft, "positionId" | "frequency">) {
  const position = exercise.positions?.find(p => p.id === aircraftPosition(exercise, aircraft));
  return position ? `${position.name} · ${position.mhz}` : undefined;
}
/** One colour per position, in layout order, so a position looks the same on every page. */
export const POSITION_COLORS = ["#b94025", "#0f7a72", "#3d5a99", "#8a6100", "#7a3f8f", "#2f6f3a"] as const;
export const positionColor = (index: number) => POSITION_COLORS[index % POSITION_COLORS.length];
