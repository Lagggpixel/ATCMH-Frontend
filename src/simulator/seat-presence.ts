import type {Exercise} from "./model";
import type {SessionSummary} from "./sessions";

/**
 * Tells the trainee when the trainer drops out of a single-trainee session with automatic readbacks off.
 * Staff pages use `seatNoticeUpdate` instead, which also covers joins and paused sessions.
 */
export function seatPresenceNotice(layout: "staff" | "mentee" | "spectator", session: Pick<SessionSummary, "staffOccupied" | "menteeOccupied" | "menteeName" | "staffName"> | null | undefined,
  exercise: Pick<Exercise, "running" | "autoReadback" | "positions">, seen: {trainee: boolean; trainer: boolean}): string | null {
  if (!session || exercise.positions?.length || !exercise.running) return null;
  if (layout !== "mentee" && seen.trainee && !session.menteeOccupied)
    return `${session.menteeName ?? "Your mentee"} has disconnected. Traffic is still moving and pilots keep calling; pause if you want to wait for them.`;
  if (layout === "mentee" && seen.trainer && !session.staffOccupied && !exercise.autoReadback)
    return "Your mentor has disconnected. Pilots will not read back until they return.";
  return null;
}

/** One trainee seat as a staff page sees it: the whole session, or one controller position. */
export interface TraineeSeat {key: string; name?: string; place?: string; occupied: boolean}
export interface SeatNotice {id: string; seat: string; kind: "joined" | "rejoined" | "left"; text: string}
/** What this page has seen of each seat, so it can tell a first join from a rejoin. */
export interface SeatMemory {occupied: Record<string, boolean>; joined: Record<string, boolean>; leftAt: Record<string, number>}
export const EMPTY_SEAT_MEMORY: SeatMemory = {occupied: {}, joined: {}, leftAt: {}};

/** The trainee seats of a session: each position when it is split, otherwise the one mentee seat. */
export function traineeSeats(session: Pick<SessionSummary, "menteeOccupied" | "menteeName"> & {positions?: readonly {id: string; name: string; occupied: boolean; traineeName?: string}[]} | null | undefined): TraineeSeat[] {
  if (!session) return [];
  if (session.positions?.length) return session.positions.map(p => ({key: p.id, name: p.traineeName, place: p.name, occupied: p.occupied}));
  return [{key: "main", name: session.menteeName, occupied: !!session.menteeOccupied}];
}

export const awayFor = (milliseconds: number) => {
  const seconds = Math.max(1, Math.round(milliseconds / 1000)), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  if (hours) return `${hours} h ${minutes % 60} min`;
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
};

/**
 * Compares the seats with what this page last saw and returns a notice for each change: a first join, a
 * rejoin with the time away, or a disconnect, while running or paused. The first look only records who is
 * already there. Each notice replaces any older one for the same seat; the trainer closes them.
 */
export function seatNoticeUpdate(memory: SeatMemory, seats: readonly TraineeSeat[], now: number, running: boolean, initial: boolean): {memory: SeatMemory; notices: SeatNotice[]} {
  const next: SeatMemory = {occupied: {...memory.occupied}, joined: {...memory.joined}, leftAt: {...memory.leftAt}};
  const notices: SeatNotice[] = [];
  for (const seat of seats) {
    const was = memory.occupied[seat.key];
    next.occupied[seat.key] = seat.occupied;
    if (seat.occupied) next.joined[seat.key] = true;
    // The first look, a seat that just appeared, or no change: nothing to report.
    if (initial || was === seat.occupied || was === undefined && !seat.occupied) continue;
    const who = seat.name ?? "Your mentee", on = seat.place ? ` on ${seat.place}` : "", from = seat.place ? ` from ${seat.place}` : "";
    const id = `${seat.key}:${now}`;
    if (seat.occupied) {
      const away = memory.leftAt[seat.key];
      const rejoin = memory.joined[seat.key] && away !== undefined;
      delete next.leftAt[seat.key];
      const after = running ? " Their controls show on your radar again." : " The session is paused; resume when you’re ready.";
      notices.push(rejoin
        ? {id, seat: seat.key, kind: "rejoined", text: `${who} rejoined${on} after ${awayFor(now - away)} away.${after}`}
        : {id, seat: seat.key, kind: "joined", text: `${who} joined${on}.${running ? "" : " The session is paused; resume when you’re ready."}`});
    } else {
      next.leftAt[seat.key] = now;
      notices.push({id, seat: seat.key, kind: "left", text: running
        ? `${who} has disconnected${from}. Traffic is still moving and pilots keep calling; pause if you want to wait for them.`
        : `${who} has disconnected${from}. The session stays paused until you resume.`});
    }
  }
  return {memory: next, notices};
}

/** Adds new notices, newest first, each replacing an older one for the same seat. */
export const mergeSeatNotices = (current: readonly SeatNotice[], added: readonly SeatNotice[]) =>
  [...[...added].reverse(), ...current.filter(notice => !added.some(n => n.seat === notice.seat))];
