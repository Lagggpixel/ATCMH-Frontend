import type {Point} from "./model";
import type {PathPredictionInput, PathPredictionRequest, PathPredictionResponse} from "./projected-path";

export type PredictionWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">;
export interface PredictionJob {input: PathPredictionInput; context: object}

/** One in flight plus the newest snapshot; a slow forecast cannot build a backlog. */
export function projectedPathClient(worker: PredictionWorker, onResult: (context: object, points: Point[]) => void, onError: () => void) {
  let serial = 0, stopped = false;
  let latest: PredictionJob | null = null, queued: PredictionJob | null = null;
  let flight: {id: number; job: PredictionJob} | null = null;
  const stop = () => {
    stopped = true; queued = latest = null; flight = null;
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
  };
  const fail = () => {if (!stopped) {stop(); onError();}};
  const send = () => {
    if (stopped || flight || !queued) return;
    flight = {id: ++serial, job: queued}; queued = null;
    const request: PathPredictionRequest = {id: flight.id, input: flight.job.input};
    try {worker.postMessage(request);} catch {fail();}
  };
  worker.onmessage = (event: MessageEvent<PathPredictionResponse>) => {
    const response = event.data;
    if (stopped || !flight || response.id !== flight.id) return;
    const completed = flight; flight = null;
    if ("error" in response) {fail(); return;}
    // Accept an older snapshot of the SAME selection while its refresh is pending.
    // Reject old selections/configurations, even if the worker finishes out of date.
    if (latest?.context === completed.job.context) onResult(completed.job.context, response.points);
    send();
  };
  worker.onerror = worker.onmessageerror = fail;
  return {
    update(job: PredictionJob | null) {if (!stopped) {latest = queued = job; send();}},
    stop,
  };
}
