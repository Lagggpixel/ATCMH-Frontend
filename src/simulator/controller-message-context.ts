import type {Aircraft, Frequency, Instruction, Message, RadarEnvironment} from "./model";
import {controllerAircraft} from "./controller-state";
import {standaloneApproachClearance} from "./radar";

/** A diversion reply uses the destination that the pilot actually requested. */
export function diversionRequestDestination(a: Aircraft, request?: Message, frequency = a.frequency) {
  if (!request || request.sender !== "pilot" || request.commandId || request.aircraftId !== a.id || request.frequency !== frequency) return undefined;
  if (request.request && request.request.id !== "diversion") return undefined;
  const target = request.request?.destination ?? a.diversionDestination;
  if (!target?.name.trim() || !Number.isFinite(target.point.x) || !Number.isFinite(target.point.y)) return undefined;
  // Legacy records have no destination snapshot: accept only a matching named request.
  const namedDestination = /\brequesting (?:diversion|to divert) to (.+?)[.!]?$/i.exec(request.text)?.[1].trim();
  if (!request.request?.destination && namedDestination?.toLowerCase() !== target.name.trim().toLowerCase()) return undefined;
  return target;
}

/** Re-resolve context at dispatch so a delayed menu cannot send obsolete details. */
export function controllerInstruction(a: Aircraft, command: Instruction, environment: RadarEnvironment, request?: Message, frequency?: Frequency): Instruction {
  if (command.type === "vector" && command.approachId) {
    const current = controllerAircraft(a), expected = current.radar?.expected ?? current.radar?.cleared;
    if (expected && environment.approaches.some(p => p.id === expected)) return command.standalone
      ? standaloneApproachClearance(current, expected) : {...command, approachId: expected};
  }
  if (command.type === "atc" && command.action === "diversion") {
    const target = diversionRequestDestination(a, request, frequency);
    if (target) return {...command, name: target.name, point: {...target.point}};
  }
  if (command.type === "atc" && (command.action === "star-descent" || command.action === "star-response" && command.variant === "approve")) return {...command, name: a.arrivalProcedure};
  return command;
}
