import type {Aircraft, Exercise, Frequency} from "./model";

/** Message sequence breaks ties when several transmissions share a timestamp. */
export function flightStrips(exercise: Pick<Exercise, "aircraft" | "messages">, frequency: Frequency): Aircraft[] {
  const latest = new Map<string, number>();
  exercise.messages.forEach((message, index) => {
    if (message.frequency === frequency) latest.set(message.aircraftId, index);
  });
  return exercise.aircraft.filter(a => a.frequency === frequency)
    .sort((a, b) => (latest.get(b.id) ?? -1) - (latest.get(a.id) ?? -1));
}
