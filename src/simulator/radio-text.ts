// Keep display, browser speech and offline recordings on the same letter-name convention.
export const RADIO_INITIALISMS = ["ILS", "GPS", "QNH", "VFR", "IFR", "RNAV", "VOR", "NDB", "DME", "RVR", "UTC", "MSL", "AGL", "KLM"];
const writtenInitialisms = new RegExp(`\\b(?:${RADIO_INITIALISMS.join("|")})\\b`, "gi");
const spokenInitialisms = new RegExp(`\\b(?:${RADIO_INITIALISMS.map(word => word.split("").join("-")).join("|")})\\b`, "gi");

/** Older session/replay messages used speech punctuation in their displayed text. */
export function radioDisplayText(text: string): string {
  return text.replace(spokenInitialisms, acronym => acronym.replaceAll("-", "").toUpperCase());
}

export function radioInitialismSpeech(text: string, separator = "-"): string {
  return radioDisplayText(text).replace(writtenInitialisms, acronym => acronym.toUpperCase().split("").join(separator));
}
