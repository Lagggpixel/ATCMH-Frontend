import {trainingMode} from "./airports";
import type {SessionSummary} from "./sessions";

export type SessionTone = "live" | "wait" | "idle";
export type SessionFilter = "all" | "mine" | "live" | "assigned" | "idle";

/** Never throws, so a list still renders a session whose airport has since been withdrawn. */
export function modeLabel(selection: Parameters<typeof trainingMode>[0]) {
  let mode: ReturnType<typeof trainingMode>;
  try {mode = trainingMode(selection);}
  catch {mode = /:approach$/.test(selection.trainingStation ?? "") ? "approach" : /:center$/.test(selection.trainingStation ?? "") ? "center" : "local";}
  return ({local: "Ground & Tower", approach: "Approach", center: "Center"})[mode];
}
export const initials = (name: string) => name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?";
export const mentorName = (session: SessionSummary) => session.staffName?.trim() || session.staffId || "Connected";
export const menteeName = (session: SessionSummary) => session.assignedMenteeName?.trim() || session.menteeName?.trim() || session.assignedMenteeId || session.menteeId || "";
/** Either seat is held right now. */
export const isActive = (session: SessionSummary) => session.staffOccupied || session.menteeOccupied;

export function sessionStatus(session: SessionSummary): {label: string; tone: SessionTone} {
  if (session.staffOccupied && session.menteeOccupied) return {label: "Live", tone: "live"};
  if (session.menteeOccupied) return {label: "Mentee waiting", tone: "wait"};
  if (session.staffOccupied) return {label: "Waiting for Mentee", tone: "wait"};
  return {label: session.assignedMenteeId ? "Assigned" : "Idle", tone: "idle"};
}
export function menteeState(session: SessionSummary) {
  if (session.menteeOccupied) return session.staffOccupied ? "In session" : "Waiting for Mentor";
  return session.assignedMenteeId ? "Assigned, not joined" : "Assign a Mentee";
}
export const isMine = (session: SessionSummary, accountId: string) => session.ownerId === accountId || session.staffId === accountId;
export function matchesFilter(session: SessionSummary, filter: SessionFilter, accountId: string) {
  switch (filter) {
    case "mine": return isMine(session, accountId);
    case "live": return isActive(session);
    case "assigned": return !!session.assignedMenteeId;
    case "idle": return !isActive(session);
    default: return true;
  }
}
export const sessionFilters = [["all", "All"], ["mine", "Mine"], ["live", "Live"], ["assigned", "Assigned"], ["idle", "Idle"]] as const;

const shortDate = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"});
const clock = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"});
/** "Now" for anything in the last minute, minutes and hours today, then a UTC date. */
export function lastActive(time: number, now: number) {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 12 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${shortDate.format(time)}, ${clock.format(time)} UTC`;
}
export function greeting(hour: number) {
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** First name for greetings: the staff username, else a linked account's display name. */
export function viewerName(auth: {adminUser?: {username?: string}; session: {identities?: {displayName?: string | null}[]} | null}) {
  const name = auth.adminUser?.username?.trim() || auth.session?.identities?.find(identity => identity.displayName?.trim())?.displayName?.trim() || "";
  return name.split(/\s+/)[0] ?? "";
}
