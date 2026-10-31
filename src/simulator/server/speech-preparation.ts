import {aviationSpeech} from "../radio-speech";
import {createHmac} from "node:crypto";
import type {SessionRecord} from "./session-service";

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

export function prepareSessionSpeech(accountId: string, texts: readonly string[], namespace = process.env.PUBLIC_ORIGIN ?? "sweatbox"): void {
  const url = process.env.SPEECH_SERVICE_URL, token = process.env.SPEECH_SERVICE_TOKEN;
  if (!texts.length || !url || !token || token.length < 32) return;
  void (async () => {
    const endpoint = new URL(url);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return;
    const anonymousId = createHmac("sha256", token).update(JSON.stringify([namespace, accountId])).digest("hex");
    for (const text of texts) {
      const response = await fetch(new URL("speech", url.endsWith("/") ? url : `${url}/`), {method: "POST", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
        body: JSON.stringify({accountId: anonymousId, text, voice: "george", priority: "prepare"}), signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store"});
      if (!response.ok || response.headers.get("content-type") !== "application/vnd.atcmh.pcm-stream" || !response.body) {await response.body?.cancel(); continue;}
      const reader = response.body.getReader(); let size = 0;
      try {for (;;) {const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > 17 * 1024 * 1024) {await reader.cancel(); break;}}}
      catch {await reader.cancel().catch(() => {});}
    }
  })().catch(() => { /* Speculation must never delay joining, change a session or prevent live audio. */ });
}
