import {aviationSpeech} from "../radio-speech";
import {SessionError} from "../sessions";
import {menteeAccess, type Actor, type SessionRecord} from "./session-service";
import {assignmentMatches} from "./position-state";

/** Read-only authorization; fetching speech never ticks a session or renews a seat. */
export function messageSpeech(record: SessionRecord, actor: Actor, messageId: string, now = Date.now()): string {
  const trainer = !!actor.superAdmin || !!(record.staff?.accountId === actor.accountId && record.staff.expiresAt > now);
  if (!trainer) menteeAccess(record, actor);
  const held = Object.entries(record.positionState ?? {}).filter(([, state]) => state.seat?.accountId === actor.accountId && state.seat.expiresAt > now && (!state.assignment || assignmentMatches(state.assignment, actor))).map(([id]) => id);
  if (!trainer && !held.length && !(record.mentee?.accountId === actor.accountId && record.mentee.expiresAt > now))
    throw new SessionError("forbidden", "Join the session before requesting audio.", 403);
  if (messageId === "published-atis" && record.exercise.publishedAtis !== "ATIS UNAVAILABLE") return aviationSpeech(record.exercise.publishedAtis);
  const message = record.exercise.messages.find(item => item.id === messageId);
  if (!message || !trainer && record.exercise.positions?.length && message.frequency !== "atis" && (!message.positionId || !held.includes(message.positionId)))
    throw new SessionError("not-found", "This radio message is unavailable.", 404);
  return aviationSpeech(message.text, record.exercise.aircraft.map(a => a.callsign));
}
