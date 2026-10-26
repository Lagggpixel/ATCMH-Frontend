export type SessionRole = "staff" | "mentee";
export type SessionMode = SessionRole | "spectator";
export interface SessionSummary {
  positions?: import("./positions").PositionPresence[];
  airport?: string; airportDataVersion?: string; trainingStation?: string;
  id: string; title: string; createdAt: number; updatedAt: number;
  ownerId?: string; ownerName?: string; staffId?: string; staffName?: string; menteeId?: string; menteeName?: string;
  staffOccupied: boolean; menteeOccupied: boolean;
  scenario?: {title: string; finished: boolean};
  assignedMenteeId?: string; assignedMenteeName?: string;
  /** Feedback was saved for the current attempt, so archiving needs no reminder. */
  hasFeedback?: boolean;
}
/** The mentee's view of a session assigned to them: no other participants' identities. */
export interface AssignedSession {
  positions?: import("./positions").PositionPresence[];
  positionId?: string; positionName?: string;
  id: string; title: string; airport: string; trainingStation?: string; trainerName?: string;
  assignedAt: number; trainerConnected: boolean; youConnected: boolean; paused: boolean;
}
export interface SessionPreview {id: string; title: string; airport: string; trainerName?: string; assignedToYou: boolean}
export const sessionCode = (id: string, airport = "EGPH") => `${airport}-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
export const SESSION_CODE_PATTERN = /^([A-Z0-9]{3,4})-([0-9A-F]{12})$/;
/** Accepts a typed code or a pasted mentee/join link and returns what to look up, or null. */
export function parseSessionEntry(input: string): {code: string} | {id: string} | null {
  const value = input.trim();
  const id = value.match(/\/(?:sweatbox|simulator)\/mentee\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)?.[1];
  if (id) return {id: id.toLowerCase()};
  const linked = value.match(/[?&]code=([A-Za-z0-9-]+)/)?.[1];
  const code = (linked ?? value).toUpperCase().replace(/\s+/g, "");
  return SESSION_CODE_PATTERN.test(code) ? {code} : null;
}
export const joinPath = (code: string) => `/sweatbox/join?code=${encodeURIComponent(code)}`;
export const sessionPath = (role: SessionMode, id: string) => `/sweatbox/${role}/${id}`;
export const SESSION_LEASE_MS = 15_000;
export const SESSION_FRAME_MS = 200;

export class SessionError extends Error {
  constructor(public code: string, message: string, public status = 409) {super(message);}
}
