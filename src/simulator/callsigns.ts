import type {Exercise} from "./model";

export const CALLSIGN_OPERATORS = ["Speedbird", "Easy", "Ryanair", "Shamrock", "Lufthansa", "Airfrans", "KLM", "Swiss", "United", "Delta", "Emirates", "Qatar", "American", "JetBlue", "Southwest", "Turkish", "Virgin"] as const;
const key = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const callsignNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : undefined;
};
export const exerciseCallsigns = (exercise: Exercise) => [...exercise.aircraft, ...(exercise.callsignReservations ?? [])].map(a => a.callsign);
export function reserveCallsigns(exercise: Exercise, entries: {id: string; callsign: string}[]) {
  const reservations = new Map((exercise.callsignReservations ?? []).map(a => [`${a.id}:${key(a.callsign)}`, a]));
  for (const a of entries) reservations.set(`${a.id}:${key(a.callsign)}`, {id: a.id, callsign: a.callsign});
  exercise.callsignReservations = [...reservations.values()];
}
export function callsignConflict(callsign: string, existing: readonly string[]): string | undefined {
  if (existing.some(value => key(value) === key(callsign))) return "This callsign is already reserved for another aircraft.";
  const number = callsignNumber(callsign);
  if (number !== undefined && existing.some(value => callsignNumber(value) === number)) return "This callsign number is already reserved for another aircraft.";
}
/** Pick from unused numbers directly, so even a repeated random value cannot loop or collide. */
export function randomCallsign(existing: readonly string[], random = Math.random): string {
  const used = new Set(existing.map(callsignNumber));
  const available = Array.from({length: 9999}, (_, i) => i + 1).filter(number => !used.has(number));
  if (!available.length) throw new Error("No unused callsign numbers remain. Start a new exercise.");
  const index = (length: number) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
  return `${CALLSIGN_OPERATORS[index(CALLSIGN_OPERATORS.length)]} ${available[index(available.length)]}`;
}
