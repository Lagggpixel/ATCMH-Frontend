import type {ScenarioRecord} from "./scenarios";
import type {SessionSummary} from "./sessions";
import {sessionJson} from "./shared-transport";

export const launchableScenarios = (scenarios: ScenarioRecord[]) => scenarios.filter(s => s.publishedRevision > 0 && !("isTemplate" in s && s.isTemplate) && !("canEdit" in s && s.canEdit === false));

/** One refresh at a time; invalidating a request also prevents late responses replacing a mutation. */
export function sessionLibrary(onData: (sessions: SessionSummary[], scenarios: ScenarioRecord[]) => void, onError: (error: string) => void,
  fetcher = fetch, interval = 5000) {
  let stopped = false, generation = 0, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let savedScenarios: ScenarioRecord[] = [];
  const invalidate = () => {generation++; controller?.abort(); clearTimeout(timer);};
  const refresh = async () => {
    if (stopped) return;
    invalidate(); const current = generation;
    const active = new AbortController(); controller = active;
    let sessions: SessionSummary[] | undefined;
    try {
      const load = async (path: string) => {
        for (let attempt = 0; ; attempt++) {
          try {
            const signal = AbortSignal.any([active.signal, AbortSignal.timeout(12_000)]);
            return await fetcher(path, {cache: "no-store", signal}).then(sessionJson);
          } catch (reason) {
            const error = reason as Error & {status?: number};
            if (active.signal.aborted || attempt > 0 || error.status && error.status < 500) throw reason;
          }
        }
      };
      const results = await Promise.allSettled([
        load("/api/simulator/sessions").then(data => {
          if (!stopped && generation === current) {sessions = data.sessions; onData(sessions!, savedScenarios);}
        }),
        load("/api/simulator/training/scenarios").then(data => {
          if (!stopped && generation === current) {savedScenarios = launchableScenarios(data.scenarios); if (sessions) onData(sessions, savedScenarios);}
        }),
      ]);
      if (!stopped && generation === current) {
        const failure = results.find(result => result.status === "rejected");
        const reason = failure?.status === "rejected" ? failure.reason as Error : undefined;
        onError(reason?.name === "TimeoutError" ? "The server took too long to respond. Retrying automatically…" : reason?.message ?? "");
      }
    } finally {if (!stopped && generation === current) timer = setTimeout(() => void refresh(), interval);}
  };
  return {refresh, invalidate, stop: () => {stopped = true; invalidate();}};
}
