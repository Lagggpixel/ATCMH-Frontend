export type SessionRole = "staff" | "mentee";
export interface SessionSummary {
  id: string; title: string; createdAt: number; updatedAt: number;
  ownerId?: string; ownerName?: string; staffId?: string; staffName?: string; menteeId?: string; menteeName?: string;
  staffOccupied: boolean; menteeOccupied: boolean;
  scenario?: {title: string; assignmentId?: string; finished: boolean};
}
export const sessionCode = (id: string) => `EGPH-${id.slice(0, 8).toUpperCase()}`;
export const sessionPath = (role: SessionRole, id: string) => `/simulator/${role}/${id}`;
export const SESSION_LEASE_MS = 15_000;
export const SESSION_FRAME_MS = 200;

export class SessionError extends Error {
  constructor(public code: string, message: string, public status = 409) {super(message);}
}
