
import type {Action} from "../model";
import {SessionError, type SessionMode} from "../sessions";
import type {EndlessRuntime} from "../endless/runtime";
import type {Actor, SessionRecord} from "./session-service";

export function assertEndlessAccess(record: Pick<SessionRecord, "ownerId" | "endless">, actor: Actor, role: SessionMode, allowEnded = false) {
  if (!record.endless) return;
  if (!actor.staff || actor.accountId !== record.ownerId || role !== "staff" || record.endless.ended && !allowEnded)
    throw new SessionError("not-found", "This Endless run is unavailable.", 404);
}

export function restrictEndlessAction(record: SessionRecord, action: Action) {
  if (action.kind === "edit" && Object.keys(action.patch).every(key => key === "tagAngle" || key === "tag" || key === "color")) return;
  if (action.kind === "command" || action.kind === "maneuver") {
    const track = record.endless?.traffic[action.aircraftId];
    if (!track || track.transfer || track.completedAt !== undefined)
      throw new SessionError("endless-handoff", "This aircraft is with the adjacent position.", 409);
    const mode = record.endless!.scenario.definition.mode;
    const command = action.command;
    if (command.type === "frequency" && mode !== "local") {
      const neighbour = record.endless!.scenario.neighbours.find(facility => facility.id === command.facilityId && facility.type === command.frequency);
      if (!neighbour) throw new SessionError("endless-handoff", "Choose one of the adjacent positions in the briefing.", 409);
    }
    return;
  }
  if (["play", "pause", "read", "atis", "publish-atis", "report-position"].includes(action.kind)) return;
  throw new SessionError("endless-run", "This control is unavailable during a scored Endless run.", 409);
}

export function readEndlessSnapshot(snapshot: string): {endless?: EndlessRuntime} {
  const state = JSON.parse(snapshot) as {endlessRun?: EndlessRuntime};
  return state.endlessRun?.version === 1 ? {endless: state.endlessRun} : {};
}

export function writeSessionSnapshot(record: SessionRecord) {
  return JSON.stringify(record.endless ? {...record.exercise, endlessRun: record.endless} : record.exercise);
}
