import {arrivalNumber} from "./engine";
import type {Aircraft, Exercise} from "./model";

/** Mentor-only observation of transmitted replies; never gates or suggests mentee commands. */
export function arrivalWorkflow(exercise: Exercise, aircraft: Aircraft) {
  const messages = exercise.messages.filter(m => m.aircraftId === aircraft.id);
  const requestIndex = messages.findLastIndex(m => m.sender === "pilot" && !!m.request);
  const request = messages[requestIndex];
  if (!request?.request || !["inbound-land", "inbound-option"].includes(request.request.id)
    || request.requestCircuit !== (aircraft.circuit ?? 0) || aircraft.frequency !== "tower"
    || aircraft.leavingCircuit || !["pattern", "heading", "go-around"].includes(aircraft.mode)) return null;
  const runway = request.request.runway, option = request.request.id === "inbound-option";
  const commands = messages.slice(requestIndex + 1).filter(m => m.sender === "controller" && !m.retractedBy
    && !messages.some(reply => reply.commandId === m.id && /^Unable\b/i.test(reply.text)));
  const entryIndex = commands.findIndex(m => m.instruction?.type === "pattern" && m.instruction.runway === runway
    && ["downwind", "base", "final"].includes(m.instruction.leg));
  const entry = commands[entryIndex]?.instruction;
  const combinedSequence = entry?.type === "pattern" && (entry.sequence?.number ?? 0) > 1;
  const sequenceIndex = combinedSequence ? entryIndex : commands.findIndex((m, i) => i > entryIndex && entryIndex >= 0
    && m.instruction?.type === "sequence" && !m.instruction.departure && m.instruction.number > 1);
  const sequenceRequired = arrivalNumber(aircraft, exercise.aircraft, runway) > 1 || sequenceIndex >= 0;
  const clearanceIndex = commands.findLastIndex(m => m.instruction?.type === "land"
    && (m.instruction.runway ?? aircraft.runway) === runway && !!m.instruction.option === option);
  const cancellationIndex = commands.findLastIndex(m => m.instruction?.type === "cancel-landing");
  const cleared = entryIndex >= 0 && clearanceIndex > entryIndex && clearanceIndex > cancellationIndex
    && (!sequenceRequired || sequenceIndex >= entryIndex && clearanceIndex > sequenceIndex);
  return {runway, option, entry: entryIndex >= 0, sequenceRequired, sequence: sequenceIndex >= 0, clearance: cleared};
}
