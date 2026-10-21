import type {ScenarioRecord} from "./scenarios";
import type {SessionSummary} from "./sessions";
import {sessionJson} from "./shared-transport";

export const launchableScenarios = (scenarios: ScenarioRecord[]) => scenarios.filter(s => s.publishedRevision > 0 && !("isTemplate" in s && s.isTemplate) && !("canEdit" in s && s.canEdit === false));

/** One refresh at a time; invalidating a request also prevents late responses replacing a mutation. */
export function sessionLibrary(onData: (sessions: SessionSummary[], scenarios: ScenarioRecord[]) => void, onError: (error: string) => void,
  fetcher = fetch, interval = 5000) {
  let stopped = false, generation = 0, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {generation++; controller?.abort(); clearTimeout(timer);};
  const refresh = async () => {
    if (stopped) return;
    invalidate(); const current = generation;
    const active = new AbortController(); controller = active;
    try {
      const signal = AbortSignal.any([active.signal, AbortSignal.timeout(12_000)]);
      const [sessions, library] = await Promise.all(["/api/simulator/sessions", "/api/simulator/training/scenarios"].map(path => fetcher(path, {cache: "no-store", signal}).then(sessionJson)));
      if (!stopped && generation === current) {onData(sessions.sessions, launchableScenarios(library.scenarios)); onError("");}
    } catch (reason) {active.abort(); if (!stopped && generation === current) onError((reason as Error).message);}
    finally {if (!stopped && generation === current) timer = setTimeout(() => void refresh(), interval);}
  };
  return {refresh, invalidate, stop: () => {stopped = true; invalidate();}};
}
