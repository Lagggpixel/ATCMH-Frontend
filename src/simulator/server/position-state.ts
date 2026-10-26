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
export const positionForToken = (record: PositionedSession, token: string) =>
  Object.keys(record.positionState ?? {}).find(id => record.positionState?.[id].seat?.token === token);
export const allPositionSeats = (record: PositionedSession) => Object.values(record.positionState ?? {}).flatMap(p => p.seat ? [p.seat] : []);
export function positionPresence(record: PositionedSession, now: number): PositionPresence[] {
  return (record.exercise.positions ?? []).map(p => {
    const state = record.positionState?.[p.id], seat = state?.seat;
    const occupied = !!seat && seat.expiresAt > now;
    return {...p, occupied, ...(occupied ? {traineeId: seat.accountId, traineeName: seat.displayName} : {}),
      ...(state?.assignment ? {assignedId: state.assignment.accountId ?? state.assignment.discordId, assignedName: state.assignment.name} : {})};
  });
}
