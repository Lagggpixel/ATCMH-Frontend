// Infinite Flight 26.4 MapControl.GetAircraftColor and customColors (XNA colors).
export const IF_COLORS = {aircraft: "#87cefa", text: "#d3d3d3", cleared: "#90ee90", offFrequency: "#808080", selected: "#ffffff", warning: "#ffa500", alert: "#ff0000", movingLabel: "#ff00ff"} as const;
// Theme.Colors uses a different orange from the radar's XNA Color.Orange.
export const IF_MAP_COLORS = {fix: "#5be0ef", runway: "#d9d9d9", taxiway: "#ffa500", flightPlan: "#c0c0c0", labelLeader: "#f5f5f5", ilsCenter: "#b46464", ilsEdge: "#dc6464"} as const;

/** IF assigns each flight strip a pastel with RGB channels in 127–254.
 * Derive it from the aircraft ID so rendering, reconnects and replays agree. */
export function pilotMessageColor(aircraftId: string): string {
  let hash = 2166136261;
  for (const character of aircraftId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `rgb(${127 + (hash & 127)}, ${127 + ((hash >>> 8) & 127)}, ${127 + ((hash >>> 16) & 127)})`;
}
export const IF_TAG_COLORS = [
  {label: "Yellow", value: "#f3f5b8"}, {label: "Red", value: "#fc473a"},
  {label: "Blue", value: "#5593d0"}, {label: "Green", value: "#4bae4f"},
] as const;
