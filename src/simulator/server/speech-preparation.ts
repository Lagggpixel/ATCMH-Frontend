import {aviationSpeech} from "../radio-speech";
import {createHmac} from "node:crypto";
import type {SessionRecord} from "./session-service";
import type {ScenarioDefinition} from "../scenarios";

export function scenarioSpeechTexts(definition: ScenarioDefinition): string[] {
  const names = new Map(definition.aircraft.map(a => [a.key, a.seed.callsign]));
  const texts = definition.events.flatMap(event => event.actions.flatMap(action => action.type === "transmission" && names.has(action.aircraftKey)
    ? [aviationSpeech(`${names.get(action.aircraftKey)}, ${action.text}`, [...names.values()])] : []));
  return [...new Set(texts)].slice(0, 4);
}

/** Prepare exact authored text only; never guess a later clearance or aircraft state. */
export function sessionSpeechTexts(record: SessionRecord): string[] {
  const texts: string[] = [];
  const callsigns = record.exercise.aircraft.map(aircraft => aircraft.callsign);
  const scenario = record.scenario;
  if (scenario) {
    const names = new Map(scenario.definition.aircraft.map(aircraft => [aircraft.key,
      record.exercise.aircraft.find(current => current.id === scenario.aircraftIds[aircraft.key])?.callsign ?? aircraft.seed.callsign]));
    callsigns.push(...names.values());
    const events = scenario.definition.events.filter(event => ["scheduled", "waiting"].includes(scenario.events[event.id]?.status ?? ""))
      .sort((a, b) => (a.trigger.type === "time" ? a.trigger.at : Infinity) - (b.trigger.type === "time" ? b.trigger.at : Infinity));
    for (const event of events) for (const action of event.actions) {
      if (action.type !== "transmission") continue;
      const callsign = names.get(action.aircraftKey);
      if (callsign) texts.push(aviationSpeech(`${callsign}, ${action.text}`, callsigns));
    }
  }
  // Bound speculative CPU work; drafts and live/queued calls keep foreground priority.
  return [...new Set(texts)].slice(0, 4);
}

const preparing = new Set<string>();
export function prepareSharedSpeech(sessionId: string, texts: readonly string[]): void {
  prepareSessionSpeech(`session:${sessionId}`, texts, process.env.PUBLIC_ORIGIN ?? "sweatbox", sessionId);
}

export function prepareSessionSpeech(accountId: string, texts: readonly string[], namespace = process.env.PUBLIC_ORIGIN ?? "sweatbox", sessionId?: string): void {
  const url = process.env.SPEECH_SERVICE_URL, token = process.env.SPEECH_SERVICE_TOKEN;
  if (!texts.length || !url || !token || token.length < 32) return;
  void (async () => {
    const endpoint = new URL(url);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return;
    const anonymousId = createHmac("sha256", token).update(JSON.stringify([namespace, accountId])).digest("hex");
    const scopeId = sessionId ? createHmac("sha256", token).update(JSON.stringify([namespace, "session", sessionId])).digest("hex") : undefined;
    for (const text of texts) {
      const key = createHmac("sha256", token).update(JSON.stringify([scopeId ?? anonymousId, text])).digest("hex");
      if (preparing.has(key) || preparing.size >= 16) continue;
      preparing.add(key);
      try {
        const response = await fetch(new URL("speech", url.endsWith("/") ? url : `${url}/`), {method: "POST", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
          body: JSON.stringify({accountId: anonymousId, ...(scopeId ? {scopeId} : {}), text, voice: "george", priority: "prepare"}), signal: AbortSignal.timeout(120_000), redirect: "error", cache: "no-store"});
        if (!response.ok || response.headers.get("content-type") !== "application/vnd.atcmh.pcm-stream" || !response.body) {await response.body?.cancel(); continue;}
        const reader = response.body.getReader(); let size = 0;
        try {for (;;) {const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > 17 * 1024 * 1024) {await reader.cancel(); break;}}}
        catch {await reader.cancel().catch(() => {});}
        } finally {preparing.delete(key);}
    }
  })().catch(() => { /* Speculation must never delay joining, change a session or prevent live audio. */ });
}
