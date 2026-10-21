import type {ScenarioDefinition} from "./scenarios";

/** Includes downstream dependants so a valid reference cannot conceal a broken chain. */
export function brokenScenarioEvents(definition: ScenarioDefinition): Map<string, string> {
  const events = new Map(definition.events.map(event => [event.id, event]));
  const aircraft = new Set(definition.aircraft.map(plane => plane.key));
  const errors = new Map<string, string>();
  const visiting = new Set<string>(), checked = new Set<string>();
  const visit = (id: string): string | undefined => {
    if (errors.has(id)) return errors.get(id);
    if (checked.has(id)) return;
    if (visiting.has(id)) return "Event dependencies contain a cycle.";
    visiting.add(id);
    const event = events.get(id)!;
    const condition = event.trigger.type === "condition" ? event.trigger.condition : undefined;
    let error = condition && "aircraftKey" in condition && !aircraft.has(condition.aircraftKey) ? "The condition aircraft has been removed." : undefined;
    if (condition?.type === "event") {
      error = !events.has(condition.eventId) ? "The event this depends on has been removed. Choose another event or trigger." : visit(condition.eventId) ? "This event depends on a broken event or dependency cycle." : error;
    }
    if (event.actions.some(action => "aircraftKey" in action && !aircraft.has(action.aircraftKey))) error ??= "An action references an aircraft that has been removed.";
    visiting.delete(id); checked.add(id);
    if (error) errors.set(id, error);
    return error;
  };
  for (const event of definition.events) visit(event.id);
  return errors;
}
