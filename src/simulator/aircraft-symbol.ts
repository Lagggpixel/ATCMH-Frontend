/** Category order follows Theme.Glyphs.Aircraft.FromTags in IF 26.4.
 * Glyphs come from the original IF 26.4 InfiniteFlight.ttf font.
 * Aircraft types are editable, so unrecognised equipment uses the GA fallback.
 */
export type AircraftSymbol = "ga" | "jumbo" | "heavy" | "medium" | "jet" | "regional" | "turboprop" | "military" | "fighter" | "warbird" | "single-turboprop";
export function aircraftSymbol(type: string): AircraftSymbol {
  const equipment = type.toUpperCase().replace(/^BOEING\s*B?/, "B").replace(/^AIRBUS\s*A?/, "A").replace(/[^A-Z0-9]/g, "");
  if (/^(A38|B74)/.test(equipment)) return "jumbo";
  if (/^(A33|A34|A35|B77|MD11|DC10|C17(?:[A-Z]|$))/.test(equipment)) return "heavy";
  if (/^(A30|A310|B75|B76|B78)/.test(equipment)) return "medium";
  if (/^(A21|A22|A31[89]|A32|B70|B72|B73|B712|MD8|MD9|DC9)/.test(equipment)) return "jet";
  if (/^(CRJ|E1[4579]|E[279][05]|ERJ|EJET|CITATION|C25|C5[156]|C68|C700|LJ|GLF|GLEX|CL[36])/.test(equipment)) return "regional";
  if (/^(C130|A400|HERCULES)/.test(equipment)) return "military";
  if (/^(F[123][24568]|FA18|F18|F35|F4|F5|F86|EUROFIGHTER|TYPHOON|RAFALE|SU[235]|MIG)/.test(equipment)) return "fighter";
  if (/^(SPITFIRE|P51|P38|P40|CORSAIR)/.test(equipment)) return "warbird";
  if (/^(DH[8C]|DASH8|Q[234]|ATR|AT[47]|SF34|SAAB340|B190|BE[123]|KINGAIR)/.test(equipment)) return "turboprop";
  if (/^(TBM|PC12|PC6|C208|C2T|CARAVAN|KODIAK)/.test(equipment)) return "single-turboprop";
  return "ga";
}

/** Exact IF 26.4 Theme.Glyphs.Aircraft codepoints in the bundled original font. */
export const aircraftGlyphs: Record<AircraftSymbol, string> = {
  ga: "\ue8c8", jumbo: "\ue8c7", heavy: "\ue874", medium: "\ue8cb",
  jet: "\ue866", regional: "\ue873", turboprop: "\ue8cc", military: "\ue867",
  fighter: "\ue868", warbird: "\ue869", "single-turboprop": "\ue86a",
};
