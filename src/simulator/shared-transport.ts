import type {ScenarioStaffView} from "./scenarios";
import {initialExercise} from "./engine";
import {exerciseSchema, motionSchema} from "./protocol";
import type {Action, Envelope, Exercise} from "./model";
import type {SessionRole, SessionSummary} from "./sessions";

export interface SharedSessionView {scenario?: ScenarioStaffView; exercise: Exercise; connected: boolean; owner: boolean; error: string | null; status: string; session: SessionSummary | null; fatal: string | null; code: string | null}
const INITIAL: SharedSessionView = {exercise: initialExercise(), connected: false, owner: false, error: null, status: "Joining session…", session: null, fatal: null, code: null};
export async function sessionJson(response: Response) {
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error ?? "Sessions are unavailable. Try again."), {code: value.code, status: response.status});
  return value;
}
/** Both roles receive the same ordered server frames and use Scope's smooth prediction. */
export class SharedSession {
  private view = INITIAL;
  private authoritativeExercise = INITIAL.exercise;
  private pendingTagAngles = new Map<string, {angle: number; revision?: number}>();
  private listeners = new Set<() => void>();
  private manageEvent: ((eventId: string, decision: "run" | "retry" | "skip") => void) | null = null;
  scenarioEvent = (eventId: string, decision: "run" | "retry" | "skip") => this.manageEvent?.(eventId, decision);
  private send: ((action: Action) => Promise<boolean>) | null = null;
  constructor(private role: SessionRole, private id: string, private csrf: string) {}
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  getSnapshot = () => this.view;
  getServerSnapshot = () => INITIAL;
  private update(patch: Partial<SharedSessionView>) {
    if (patch.exercise) this.authoritativeExercise = patch.exercise;
    const saved = this.authoritativeExercise;
    for (const [id, pending] of this.pendingTagAngles) {
      if (!saved.aircraft.some(a => a.id === id && a.active) || pending.revision !== undefined && saved.revision >= pending.revision)
        this.pendingTagAngles.delete(id);
    }
    // Keep dropped tags in place through stale stream frames until the accepted revision arrives.
    const exercise = this.pendingTagAngles.size ? {...saved, aircraft: saved.aircraft.map(a => {
      const pending = this.pendingTagAngles.get(a.id);
      return pending ? {...a, tagAngle: pending.angle} : a;
    })} : saved;
    this.view = {...this.view, ...patch, exercise}; this.listeners.forEach(listener => listener());
  }
  clearError = () => this.update({error: null});
  dispatch = (action: Action) => {
    if (!this.view.connected || !this.send) {this.update({error: "Wait for the session to reconnect before sending."}); return Promise.resolve(false);}
    return this.send(action);
  };
  start(): () => void {
    let stopped = false, claimed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const token = crypto.randomUUID(), controller = new AbortController();
    const base = `/api/simulator/sessions/${this.id}`;
    const headers = {"content-type": "application/json", "x-csrf-token": this.csrf};
    const post = (operation: string, extra: object = {}, keepalive = false) => fetch(`${base}/${operation}`, {
      method: "POST", headers, credentials: "same-origin", keepalive, body: JSON.stringify({role: this.role, token, ...extra}),
      ...(!keepalive ? {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])} : {}),
    }).then(sessionJson);
    const release = () => {if (claimed) {claimed = false; void post("leave", {}, true).catch(() => {});}};
    const fatal = (reason: unknown) => {
      const failure = reason as Error & {code?: string; status?: number};
      this.update({connected: false, owner: false, fatal: failure.message, code: failure.code ?? "unavailable"});
    };
    let commands = Promise.resolve();
    this.send = action => {
      const envelope: Envelope = {id: crypto.randomUUID(), time: Date.now(), action};
      const tagId = action.kind === "edit" && Object.keys(action.patch).length === 1 && typeof action.patch.tagAngle === "number" ? action.aircraftId : undefined;
      const pending: {angle: number; revision?: number} | undefined = tagId && action.kind === "edit" ? {angle: action.patch.tagAngle!} : undefined;
      if (tagId && pending) {this.pendingTagAngles.set(tagId, pending); this.update({});}
      let sent = false;
      commands = commands.then(async () => {
        for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
          try {
            const result = await post("commands", {envelope}); sent = true;
            if (pending) pending.revision = result.revision;
            this.update({}); return;
          }
          catch (reason) {
            const error = reason as Error & {status?: number};
            if (error.status && error.status < 500 || attempt === 2) {
              if (!stopped) this.update({error: error.message}); return;
            }
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      });
      return commands.then(() => {
        if (!sent && tagId && this.pendingTagAngles.get(tagId) === pending) {this.pendingTagAngles.delete(tagId); this.update({});}
        return sent;
      });
    };
    this.manageEvent = (eventId, decision) => {
      if (!this.view.connected || this.role !== "staff") return;
      commands = commands.then(async () => {try {await post("events", {eventId, decision});} catch (reason) {if (!stopped) this.update({error: (reason as Error).message});}});
    };
    const frame = (data: string) => {
      const value = JSON.parse(data);
      if (value.type === "failure") throw Object.assign(new Error(value.error), {code: value.code, status: value.status});
      if (value.type === "snapshot") {
        const exercise = exerciseSchema.parse(value.exercise);
        if (exercise.id !== this.id) throw new Error("Received a frame for another session.");
        this.update({exercise, scenario: value.scenario, connected: true, owner: this.role === "staff", session: value.session, status: "Session connected", fatal: null});
      } else if (value.type === "motion") {
        const motion = motionSchema.parse(value.state);
        if (motion.id === this.id && motion.revision >= this.view.exercise.revision)
          this.update({exercise: {...this.view.exercise, ...motion}, session: value.session, connected: true, owner: this.role === "staff", status: "Session connected"});
      } else if (value.type === "presence") this.update({session: value.session});
    };
    const connect = async () => {
      try {
        await post("join"); claimed = true;
        if (stopped) {release(); return;}
        const response = await fetch(`${base}/stream`, {headers: {"x-simulator-role": this.role, "x-simulator-seat": token}, cache: "no-store", signal: controller.signal});
        if (!response.ok) await sessionJson(response);
        if (!response.body) throw new Error("This browser cannot receive the session stream.");
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
        try {while (!stopped) {
          const {done, value} = await reader.read();
          if (done) throw new Error("Session connection interrupted.");
          buffer += decoder.decode(value, {stream: true});
          let index: number;
          while ((index = buffer.indexOf("\n\n")) !== -1) {const packet = buffer.slice(0, index); buffer = buffer.slice(index + 2); if (packet.startsWith("data: ")) frame(packet.slice(6));}
        }} finally {await reader.cancel().catch(() => {});}
      } catch (reason) {
        if (stopped) return;
        const failure = reason as Error & {status?: number};
        if (failure.status && failure.status < 500) {fatal(reason); return;}
        this.update({connected: false, owner: false, status: "Reconnecting to saved session…"});
        timer = setTimeout(() => void connect(), 1500);
      }
    };
    // Defer the claim so React StrictMode's discarded effect never occupies a seat.
    timer = setTimeout(() => void connect(), 0);
    const pageHide = () => {stopped = true; controller.abort(); release();};
    const pageShow = (event: PageTransitionEvent) => {if (event.persisted) window.location.reload();};
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {stopped = true; clearTimeout(timer); controller.abort(); release(); this.send = null; this.manageEvent = null; window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", pageShow);};
  }
}
