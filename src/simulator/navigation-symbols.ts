/** IF 26.4 MapTilesManager.MapTile glyphs, rendered with the bundled original font. */
export type NavigationKind = "fix" | "ndb" | "vor" | "tacan";
export interface NavigationMetadata {waypointType?: string; vorType?: string; slavedVariation?: number}

export function navigationKind({waypointType, vorType}: NavigationMetadata): NavigationKind {
  const type = waypointType?.toUpperCase().replace(/[\s_/-]/g, "");
  if (type === "NDB") return "ndb";
  if (type === "TACAN") return "tacan";
  if (type === "VOR" || type === "VORTAC" || type === "VORDME") {
    // IF's VORType enum: VOR=0, TACAN=1, VORTAC=2. VORTAC shares the VOR glyph.
    return vorType?.toUpperCase() === "TACAN" || vorType === "1" ? "tacan" : "vor";
  }
  // Old saved routes and untyped provider coordinates remain ordinary fixes.
  return "fix";
}

export const navigationGlyphs: Record<NavigationKind, string> = {fix: "\ue871", ndb: "\ue870", vor: "\ue8e7", tacan: "\ue907"};
export const navigationColors: Record<NavigationKind, string> = {fix: "#5be0ef", ndb: "#b9b8d0", vor: "#b9b8d0", tacan: "#b9b8d0"};
export const navigationSizes: Record<NavigationKind, number> = {fix: 10, ndb: 10, vor: 15, tacan: 15};

export function drawNavigationSymbol(context: CanvasRenderingContext2D, symbol: {x: number; y: number; kind: NavigationKind; background: boolean; route: boolean}) {
  const draw = (kind: NavigationKind, size: number) => {
    context.font = `${size}px "Simulator Aircraft"`;
    context.fillStyle = navigationColors[kind];
    const glyph = navigationGlyphs[kind], metrics = context.measureText(glyph);
    // Centre the actual glyph bounds, matching IF's centred icon rectangle.
    context.fillText(glyph, symbol.x, symbol.y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  };
  context.textAlign = "center"; context.textBaseline = "alphabetic";
  if (symbol.background) draw(symbol.kind, navigationSizes[symbol.kind]);
  // ATCFlightPlanWaypoint carries a position/identifier, and IF always draws it as FixTriangle.
  if (symbol.route) draw("fix", 10);
}
