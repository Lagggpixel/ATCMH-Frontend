import type {Exercise} from "../model";
import type {PositionPresence} from "../positions";

export interface PositionAssignment {accountId?: string; discordId?: string; name?: string; assignedAt: number; assignedBy: string; assignedByName?: string}
export interface PositionSeat {token: string; accountId: string; displayName?: string; discordId?: string; expiresAt: number}
export interface PositionState {assignment?: PositionAssignment; seat?: PositionSeat | null; feedback?: string}
export interface PositionedSession {exercise: Exercise; positionState?: Record<string, PositionState>}
export function assignmentMatches(assignment: PositionAssignment | undefined, actor: {accountId: string; discordId?: string}) {
  return !!assignment && (assignment.discordId ? !!actor.discordId && assignment.discordId === actor.discordId : assignment.accountId === actor.accountId);
}
export const hasPositionAssignment = (record: PositionedSession, actor: {accountId: string; discordId?: string}) =>
  Object.values(record.positionState ?? {}).some(p => assignmentMatches(p.assignment, actor));
/** Every position this seat holds, in layout order; more than one means the holder is bandboxing. */
export const positionsForToken = (record: PositionedSession, token: string) =>
  (record.exercise.positions ?? []).filter(p => record.positionState?.[p.id]?.seat?.token === token).map(p => p.id);
/** The seat's primary position: the first it holds, whose frequency a bandbox uses. */
export const positionForToken = (record: PositionedSession, token: string): string | undefined => positionsForToken(record, token)[0];
/** The positions held together with this one, by the same seat, in layout order. */
export function heldWith(record: PositionedSession, positionId: string) {
  const token = record.positionState?.[positionId]?.seat?.token;
  return token ? positionsForToken(record, token) : [positionId];
}
export const allPositionSeats = (record: PositionedSession) => Object.values(record.positionState ?? {}).flatMap(p => p.seat ? [p.seat] : []);
/** Who covers a position: the open seat, otherwise the assignment. Positions sharing a holder form a bandbox. */
function holder(state: PositionState | undefined, now: number) {
  if (state?.seat && state.seat.expiresAt > now) return `seat:${state.seat.token}`;
  const assigned = state?.assignment?.discordId ?? state?.assignment?.accountId;
  return assigned ? `assignment:${assigned}` : undefined;
}
export function positionPresence(record: PositionedSession, now: number): PositionPresence[] {
  const positions = record.exercise.positions ?? [];
  const holders = positions.map(p => holder(record.positionState?.[p.id], now));
  return positions.map((p, index) => {
    const state = record.positionState?.[p.id], seat = state?.seat;
    const occupied = !!seat && seat.expiresAt > now, key = holders[index];
    const first = key ? holders.indexOf(key) : -1, shared = !!key && holders.filter(h => h === key).length > 1;
    return {...p, occupied, ...(occupied ? {traineeId: seat.accountId, traineeName: seat.displayName} : {}),
      ...(state?.assignment ? {assignedId: state.assignment.accountId ?? state.assignment.discordId, assignedName: state.assignment.name} : {}),
      ...(shared ? {bandboxId: positions[first].id} : {})};
  });
}
