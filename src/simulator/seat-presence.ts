import type {Exercise} from "./model";
import type {SessionSummary} from "./sessions";

/**
 * Warns the people still connected when the other seat drops out of a single-trainee session.
 * Split-position sessions already pause on their own when a position loses its seat, so they get no warning here.
 * The session keeps running either way: the trainer decides whether to pause.
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
