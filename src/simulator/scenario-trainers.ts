import type {ScenarioRecord} from "./scenarios";

export function scenariosByTrainer(scenarios: ScenarioRecord[]) {
  const groups = new Map<string, {id: string; name: string; scenarios: ScenarioRecord[]}>();
  for (const scenario of scenarios) {
    let group = groups.get(scenario.ownerId);
    if (!group) {group = {id: scenario.ownerId, name: scenario.ownerName || scenario.ownerId, scenarios: []}; groups.set(group.id, group);}
    group.scenarios.push(scenario);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
