import {radioInitialismSpeech} from "./radio-text";
import {AIRPORT_RADIO_NAMES} from "./radio-identifiers";

const DIGITS = "zero one two three four five six seven eight nine".split(" ");
const digits = (value: string) => [...value].map(n => DIGITS[Number(n)]).join(" ");
const PHONETIC = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu"];
const identifier = (value: string) => [...value.toUpperCase()].filter(c => /[A-Z0-9]/.test(c)).map(c => /\d/.test(c) ? DIGITS[Number(c)] : PHONETIC[c.charCodeAt(0) - 65]).join(" ");
function spokenCallsign(callsign: string): string {
  // Registrations are spelled; airline names remain words, including compact Speedbird104.
  if (/^(?:[a-z0-9]{1,2}-[a-z0-9]+|N\d[a-z0-9]*)$/i.test(callsign)) return identifier(callsign);
  return callsign.replace(/\b([a-z]*)(\d[a-z0-9]*)\b/gi, (_, prefix: string, flight: string) =>
    (prefix.length > 3 || /[a-z]{2}/.test(prefix) || prefix.toUpperCase() === "KLM") ? `${prefix} ${identifier(flight)}` : identifier(prefix + flight));
}
const SMALL = [...DIGITS, "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function cardinal(value: number): string {
  if (value < 20) return SMALL[value];
  if (value < 100) return TENS[Math.floor(value / 10)] + (value % 10 ? ` ${SMALL[value % 10]}` : "");
  const unit = value < 1000 ? 100 : 1000, label = unit === 100 ? "hundred" : "thousand";
  return `${cardinal(Math.floor(value / unit))} ${label}${value % unit ? ` ${cardinal(value % unit)}` : ""}`;
}
/** Speech-only formatting: logs/replays retain their original numeric values and ICAO codes. */
export function aviationSpeech(text: string, callsigns: readonly string[] = []): string {
  text = text.replace(/\b(via\s+)(.*?)(?=,\s*(?:hold|will hold|contact|cleared)\b|[.;]|$)/gi, (_, prefix: string, route: string) =>
    prefix + route.replace(/\b[A-Z]{1,3}\d{0,2}\b/g, identifier))
    .replace(/\b(taxiway\s+)([A-Z]{1,3}\d{0,2})\b/gi, (_, prefix: string, name: string) => prefix + identifier(name));
  const names = [...new Set(callsigns.map(c => c.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length) {
    const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    text = text.replace(new RegExp(`(?<![a-z0-9])(?:${escaped.join("|")})(?![a-z0-9])`, "gi"), spokenCallsign);
  }
  return radioInitialismSpeech(text)
    .replace(/\b(\d{1,3}(?:,\d{3})|\d{1,5})ft\b/gi, (_, value: string) => `${value} feet`)
    .replace(/\b(wind\s+\d{1,3}\s+at\s+)(\d{1,3})\b/gi, (_, prefix: string, speed: string) => `${prefix}${digits(speed)}`)
    .replace(/\b((?:heading|wind)\s+)(\d{1,3})\b/gi, (_, prefix: string, heading: string) => `${prefix}${digits(heading.padStart(3, "0"))}`)
    .replace(/\b(Q-N-H\s+)(\d{3,4})\b/gi, (_, prefix: string, pressure: string) => `${prefix}${digits(pressure)}`)
    .replace(/\b(\d{1,3})\s+(knots|kts|degrees)\b/gi, (_, value: string, unit: string) => `${digits(value)} ${unit}`)
    .replace(/\b(?:FL\s*|flight level\s+)(\d{2,3})\b/gi, (_, level: string) => `flight level ${digits(level)}`)
    .replace(/\b(\d{1,3}(?:,\d{3})|\d{1,5})\s+(feet|foot|ft)\b/gi, (_, number: string, unit: string) => `${cardinal(Number(number.replaceAll(",", "")))} ${unit}`)
    .replace(/\b(with you at|hold present position at|level at|at or above|at or below|(?:climb|descend)(?: and maintain| to)?|maintain|altitude(?: of)?)\s+(\d{1,3}(?:,\d{3})|\d{1,5})\b(?!\s*(?:knots|degrees))/gi, (_, prefix: string, number: string) => `${prefix} ${cardinal(Number(number.replaceAll(",", "")))}`)
    .replace(/\b(at|to|from)\s+([A-Z]{4})\b/gi, (original, prefix: string, code: string) => AIRPORT_RADIO_NAMES[code.toUpperCase()] ? `${prefix} ${AIRPORT_RADIO_NAMES[code.toUpperCase()]}` : original)
    .replace(/(\bon (?:left |right )?(?:final|base|downwind|crosswind|upwind) )(\d{2})([LRC])?\b/gi, (_, leg: string, number: string, side: string | undefined) => `${leg}${digits(number)}${side ? ` ${{L: "left", R: "right", C: "center"}[side.toUpperCase()]}` : ""}`)
    .replace(/\brunway (\d{2})([LRC])?\b/gi, (_, number: string, side: string | undefined) => `Runway ${digits(number)}${side ? ` ${{L: "left", R: "right", C: "center"}[side.toUpperCase()]}` : ""}`)
    .replace(/\b(\d{3})\.(\d{2,3})\b/g, (_, whole: string, fraction: string) => `${digits(whole)} decimal ${digits(fraction)}`);
}
