import type {Point} from "./model";
import {normalizeScenario, scenarioSchema, type ScenarioDefinition} from "./scenarios";

/** Import briefing routes without turning planned approaches into ATC assignments. */
export function prepareScenarioImport(definition: ScenarioDefinition, origins: Record<string, Point & {name: string}> = {}): ScenarioDefinition {
  const draft = structuredClone(definition);
  for (const spec of draft.aircraft) {
    const a = spec.seed, r = a.radar;
    if (!r) continue;
    delete r.expected; delete r.requestedApproach; delete r.cleared; delete r.guidance;
    delete r.approachIntercept;
    r.captured = false; r.localizer = false; r.glideslope = false; r.clearanceAltitudeChecked = false;
    r.navigation = "heading"; r.routeIndex = 0;
    a.clearedToLand = false; a.clearedForOption = false;
    if (!r.departure) a.runway = null;
    if (a.flightPlan.length) {
      const origin = origins[spec.key] ?? {...a.position, name: "START"};
      const first = a.flightPlan[0];
      if (first.name !== origin.name || Math.hypot(first.x - origin.x, first.y - origin.y) > .000001) a.flightPlan.unshift({...origin});
      r.routeIndex = 0;
      r.navigation = "route";
    }
  }
  return normalizeScenario(scenarioSchema.parse(draft));
}
