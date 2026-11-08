import {ownsAircraft} from "./positions";
import {prepareQuickCommand, QuickCommandManager, type QuickCommand} from "./quick-commands";
import type {ScenarioStaffView} from "./scenarios";
import {initialExercise} from "./engine";
import {envelopeSchema, exerciseSchema, motionSchema} from "./protocol";
import {invalidRequestMessage} from "./request-validation";
import {recordControllerAssignment} from "./controller-state";
import type {Action, Envelope, Exercise} from "./model";
import type {SessionMode, SessionSummary} from "./sessions";
import type {DemoBatch, DemoController, DemoState} from "./demonstration";
import {BODY_BINARY_TYPE, encodeBody, STREAM_BINARY_TYPE, STREAM_FORMAT, STREAM_HEADER, StreamDecoder, type StreamMessage} from "./stream-codec";

/** A demonstration update from the trainer: the latest UI state and every batch since the last one. */
export interface DemoFrame {seq: number; state?: DemoState; batches: DemoBatch[]}

/** A trainee's own controller state, relayed to a staff page that asked for that position. */
export interface ShadowFrame extends DemoFrame {positionId: string}

export interface SharedSessionView {positionId?: string; positionIds?: string[]; detail?: Record<string, unknown>; queuedCommands: number; quickCommands: QuickCommand[]; scenario?: ScenarioStaffView; exercise: Exercise; connected: boolean; owner: boolean; error: string | null; status: string; session: SessionSummary | null; fatal: string | null; code: string | null}
const INITIAL: SharedSessionView = {queuedCommands: 0, quickCommands: [], exercise: initialExercise(), connected: false, owner: false, error: null, status: "Joining session…", session: null, fatal: null, code: null};
export async function sessionJson(response: Response) {
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error ?? "Sessions are unavailable. Try again."), {code: value.code, status: response.status, retryAt: value.retryAt, detail: value.detail});
  return value;
}
/** Both roles receive the same ordered server frames and use Scope's smooth prediction. */
export class SharedSession {
  private view = INITIAL;
  private quickCommands = new QuickCommandManager();
  private shortcutPaths = new Map<string, string[]>();
  private authoritativeExercise = INITIAL.exercise;
  private pendingTagAngles = new Map<string, {angle: number; revision?: number}>();
  private optimistic = new Map<string, {envelope: Envelope; revision?: number}>();
  private listeners = new Set<() => void>();
  private manageEvent: ((eventId: string, decision: "run" | "retry" | "skip") => void) | null = null;
  scenarioEvent = (eventId: string, decision: "run" | "retry" | "skip") => this.manageEvent?.(eventId, decision);
  private send: ((action: Action, path?: string[]) => Promise<boolean>) | null = null;
  private controlsEnabled = false;
  private demoListeners = new Set<(frame: DemoFrame) => void>();
  private seedListeners = new Set<(controller: DemoController) => void>();
  private postDemo: ((body: object) => Promise<unknown>) | null = null;
  private postShadow: ((body: object) => Promise<{watched?: boolean}>) | null = null;
  private shadowListeners = new Set<(frame: ShadowFrame) => void>();
  private shadowPosition: string | null = null;
  private restartStream: (() => void) | null = null;
  /** Staff and spectators: which trainee position's controller state the stream carries, or none. */
  setShadow = (positionId: string | null) => {
    if (this.role === "mentee" || positionId === this.shadowPosition) return;
    this.shadowPosition = positionId; this.restartStream?.();
  };
  onShadow = (listener: (frame: ShadowFrame) => void) => {this.shadowListeners.add(listener); return () => {this.shadowListeners.delete(listener);};};
  /** Trainee: posts this page's controller state; the reply says whether any staff page is reading it. */
  sendShadow = (batch: DemoBatch) => this.postShadow ? this.postShadow({batch, ...(this.view.positionId ? {positionId: this.view.positionId} : {})}) : Promise.reject(new Error("Not connected."));
  /** Mirror frames bypass React state: pointer samples arrive many times a second. */
  onDemo = (listener: (frame: DemoFrame) => void) => {this.demoListeners.add(listener); return () => {this.demoListeners.delete(listener);};};
  onDemoSeed = (listener: (controller: DemoController) => void) => {this.seedListeners.add(listener); return () => {this.seedListeners.delete(listener);};};
  sendDemo = (batch: DemoBatch) => this.postDemo ? this.postDemo({batch}) : Promise.reject(new Error("Not connected."));
  sendDemoSeed = (controller: DemoController) => this.postDemo ? this.postDemo({controller}) : Promise.reject(new Error("Not connected."));
  private queued = new Map<string, {cancelled: boolean; inFlight: boolean}>();
  cancelQueued = () => {
    for (const [id, job] of this.queued) if (!job.inFlight) {job.cancelled = true; this.optimistic.delete(id);}
    this.update({error: null});
  };
  /** `positionId` may list several positions (comma separated) a trainer bandboxes; `takeover` moves this account's seat from another page on the first join. */
  constructor(private role: SessionMode, private id: string, private csrf: string, private positionId?: string, private takeover = false) {}
  private joinBody() {
    const body = {...(this.positionId ? {positionId: this.positionId} : {}), ...(this.takeover ? {takeover: true} : {})};
    this.takeover = false; return body;
  }
  private canControl() {return this.role === "staff" || this.role === "spectator" && this.controlsEnabled;}
  setControlsEnabled = (enabled: boolean) => {
    if (this.role !== "spectator") return;
    this.controlsEnabled = enabled && this.view.connected;
    this.update({owner: this.canControl(), error: null});
  };
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  getSnapshot = () => this.view;
  getServerSnapshot = () => INITIAL;
  private update(patch: Partial<SharedSessionView>) {
    if (patch.connected === false && this.role === "spectator") this.controlsEnabled = false;
    if (patch.exercise) this.authoritativeExercise = patch.exercise;
    const saved = this.authoritativeExercise;
    for (const [id, pending] of this.pendingTagAngles) {
      if (!saved.aircraft.some(a => a.id === id && a.active) || pending.revision !== undefined && saved.revision >= pending.revision)
        this.pendingTagAngles.delete(id);
    }
    // Keep dropped tags in place through stale stream frames until the accepted revision arrives.
    let exercise = this.pendingTagAngles.size ? {...saved, aircraft: saved.aircraft.map(a => {
      const pending = this.pendingTagAngles.get(a.id);
      return pending ? {...a, tagAngle: pending.angle} : a;
    })} : saved;
    for (const [id, pending] of this.optimistic) {
      if (saved.processed.includes(id) || saved.messages.some(m => m.id === id)) {
        this.optimistic.delete(id); continue;
      }
      const {action, time} = pending.envelope;
      if (action.kind === "atis") exercise = {...exercise, atis: action.draft};
      if (action.kind === "command") {
        exercise = {...exercise, aircraft: exercise.aircraft.map(a => {
          if (a.id !== action.aircraftId) return a;
          const updated = {...a}; recordControllerAssignment(updated, action.command, saved.radarEnvironment); return updated;
        }), messages: [...exercise.messages, {id, aircraftId: action.aircraftId, frequency: action.frequency, time, sender: "controller", text: action.text, instruction: action.command, ...(action.replyTo ? {replyTo: action.replyTo} : {})}]};
      }
    }
    this.view = {...this.view, ...patch, exercise}; this.listeners.forEach(listener => listener());
  }
  clearError = () => this.update({error: null});
  dispatch = (action: Action, path?: string[]) => {
    if (this.role === "spectator" && !this.controlsEnabled) return Promise.resolve(false);
    if (this.role === "mentee" && this.view.exercise.positions?.length && "aircraftId" in action && action.kind !== "edit" && !ownsAircraft(this.view.exercise, this.view.exercise.aircraft.find(a => a.id === action.aircraftId) ?? {frequency: null}, this.view.positionIds ?? this.view.positionId)) return Promise.resolve(false);
    if (!this.send || this.view.fatal) {this.update({error: this.view.fatal ?? "Join the session before sending."}); return Promise.resolve(false);}
    // The trainer holds the controller seat; the trainee's page only watches.
    if (this.view.exercise.demonstration && this.role === "mentee" && (!this.view.exercise.demonstration.positionId || (this.view.positionIds ?? [this.view.positionId]).includes(this.view.exercise.demonstration.positionId))) return Promise.resolve(false);
    if (this.view.exercise.pausedByStaff && this.role === "mentee") {this.update({error: "Staff has paused this exercise."}); return Promise.resolve(false);}
    if (this.queued.size >= 100) {this.update({error: "The command queue is full. Wait for delivery or cancel unsent commands."}); return Promise.resolve(false);}
    return this.send(action, path);
  };
  start(): () => void {
    let stopped = false, claimed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const token = crypto.randomUUID(), controller = new AbortController();
    const base = `/api/simulator/sessions/${this.id}`;
    // Once the server has answered with a binary stream it also reads compact binary request bodies.
    let compact = false;
    const post = (operation: string, extra: object = {}, keepalive = false) => fetch(`${base}/${operation}`, {
      method: "POST", headers: {"content-type": compact ? BODY_BINARY_TYPE : "application/json", "x-csrf-token": this.csrf}, credentials: "same-origin", keepalive,
      body: compact ? encodeBody({role: this.role, token, ...extra}) as Uint8Array<ArrayBuffer> : JSON.stringify({role: this.role, token, ...extra}),
      ...(!keepalive ? {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])} : {}),
    }).then(sessionJson);
    // Spectators hold no seat; they only post leave to hand back a demonstration they may be giving.
    const release = () => {
      if (claimed || this.role === "spectator" && this.view.exercise.demonstration?.spectator) {claimed = false; void post("leave", {}, true).catch(() => {});}
    };
    const fatal = (reason: unknown) => {
      const failure = reason as Error & {code?: string; status?: number; detail?: Record<string, unknown>};
      this.update({connected: false, owner: false, fatal: failure.message, code: failure.code ?? "unavailable", detail: failure.detail});
    };
    let commands = Promise.resolve();
    this.postDemo = extra => post("demo", extra);
    this.postShadow = extra => post("shadow", extra);
    this.send = (action, path) => {
      const envelope: Envelope = {id: crypto.randomUUID(), time: Date.now(), action: structuredClone(action)};
      const validation = envelopeSchema.safeParse(envelope);
      if (!validation.success) {this.update({error: invalidRequestMessage(validation.error)}); return Promise.resolve(false);}
      const shortcutPath = path ?? (action.kind === "command" && action.resendOf ? this.shortcutPaths.get(action.resendOf) : undefined);
      const shortcut = action.kind === "command" ? prepareQuickCommand(action, this.view.exercise, shortcutPath) : null;
      const tagId = action.kind === "edit" && Object.keys(action.patch).length === 1 && typeof action.patch.tagAngle === "number" ? action.aircraftId : undefined;
      const pending: {angle: number; revision?: number} | undefined = tagId && action.kind === "edit" ? {angle: action.patch.tagAngle!} : undefined;
      if (tagId && pending) {this.pendingTagAngles.set(tagId, pending); this.update({});}
      const optimistic = action.kind === "command" || action.kind === "atis" ? {envelope} as {envelope: Envelope; revision?: number} : undefined;
      if (optimistic) this.optimistic.set(envelope.id, optimistic);
      let sent = false;
      const job = {cancelled: false, inFlight: false};
      this.queued.set(envelope.id, job);
      this.update({queuedCommands: this.queued.size});
      commands = commands.then(async () => {
        let attempt = 0;
        try {
          while (!stopped && !job.cancelled && !this.view.fatal) {
            if (this.role === "spectator" && !this.controlsEnabled) return;
            try {
              job.inFlight = true;
              const result = await post("commands", {envelope}); sent = true;
              if (shortcut) {this.quickCommands.add(shortcut); this.shortcutPaths.set(envelope.id, shortcut.path);}
              if (pending) pending.revision = result.revision;
              if (optimistic) optimistic.revision = result.revision;
              this.update({error: null, status: this.view.connected ? "Session connected" : this.view.status, quickCommands: this.quickCommands.ranked()}); return;
            } catch (reason) {
              const error = reason as Error & {status?: number; code?: string};
              if (stopped || job.cancelled) return;
              if (error.code === "seat-lost") {
                // Reclaim only this page's own seat. An occupied/revoked seat is a hard failure.
                try {const joined = await post("join", this.joinBody()); this.positionId ??= joined.positionId; this.update({positionId: joined.positionId, positionIds: joined.positionIds}); claimed = this.role !== "spectator";}
                catch (reason) {
                  const failure = reason as Error & {status?: number};
                  if (failure.status && failure.status < 500) {fatal(reason); return;}
                }
              } else if (error.status && error.status < 500 && error.status !== 408 && error.status !== 429) {
                this.update({error: error.message}); return;
              }
              this.update({status: "Connection interrupted · Commands queued"});
            } finally {job.inFlight = false;}
            // Preserve the envelope ID across uncertain replies; server processing is idempotent.
            await new Promise(resolve => setTimeout(resolve, Math.min(3000, 500 * ++attempt)));
          }
        } finally {
          this.queued.delete(envelope.id);
          if (!sent && tagId && this.pendingTagAngles.get(tagId) === pending) this.pendingTagAngles.delete(tagId);
          if (!sent) this.optimistic.delete(envelope.id);
          this.update({queuedCommands: this.queued.size});
        }
      }).catch(reason => {this.update({error: reason instanceof Error ? reason.message : "Command could not be sent."});});
      return commands.then(() => sent);
    };
    this.manageEvent = (eventId, decision) => {
      if (!this.view.connected || !this.canControl()) return;
      commands = commands.then(async () => {if (!this.canControl()) return; try {await post("events", {eventId, decision});} catch (reason) {if (!stopped) this.update({error: (reason as Error).message});}});
    };
    const frame = (message: StreamMessage) => {
      // Fields are validated by schema below, as they were when this was parsed JSON.
      const value: ReturnType<typeof JSON.parse> = message;
      if (value.type === "failure") throw Object.assign(new Error(value.error), {code: value.code, status: value.status});
      if (value.type === "snapshot") {
        const exercise = exerciseSchema.parse(value.exercise);
        if (exercise.id !== this.id) throw new Error("Received a frame for another session.");
        if (exercise.revision < this.authoritativeExercise.revision) return;
        this.update({positionId: value.positionId ?? this.view.positionId, positionIds: value.positionIds ?? this.view.positionIds, exercise, scenario: value.scenario, connected: true, owner: this.canControl(), session: value.session, status: "Session connected", fatal: null, code: null});
      } else if (value.type === "motion") {
        const motion = motionSchema.parse(value.state);
        if (motion.id === this.id && motion.revision >= this.authoritativeExercise.revision)
          this.update({exercise: {...this.authoritativeExercise, ...motion}, session: value.session, connected: true, owner: this.canControl(), status: "Session connected"});
      } else if (value.type === "presence") this.update({session: value.session});
      else if (value.type === "demo") for (const listener of this.demoListeners) listener(value as DemoFrame);
      else if (value.type === "demo-seed") for (const listener of this.seedListeners) listener(value.controller as DemoController);
      else if (value.type === "shadow" && value.positionId === this.shadowPosition) for (const listener of this.shadowListeners) listener(value as ShadowFrame);
    };
    const connect = async () => {
      if (stopped) return;
      // A replacement server may be an older JSON-only one, so each connection joins in JSON and renegotiates.
      compact = false;
      try {
        const joined = await post("join", this.joinBody()); this.positionId ??= joined.positionId; this.update({positionId: joined.positionId, positionIds: joined.positionIds}); claimed = this.role !== "spectator";
        if (stopped) {release(); return;}
        // Changing the watched trainee reopens only the stream; the seat and queued commands stay.
        const streamController = new AbortController();
        let restarted = false;
        this.restartStream = () => {restarted = true; streamController.abort();};
        const query = this.shadowPosition ? `?shadow=${encodeURIComponent(this.shadowPosition)}` : "";
        const response = await fetch(`${base}/stream${query}`, {headers: {"x-simulator-role": this.role, "x-simulator-seat": token, [STREAM_HEADER]: STREAM_FORMAT}, cache: "no-store", signal: AbortSignal.any([controller.signal, streamController.signal])}).catch(reason => {if (restarted) throw Object.assign(new Error("restart"), {restart: true}); throw reason;});
        if (!response.ok) await sessionJson(response);
        if (!response.body) throw new Error("This browser cannot receive the session stream.");
        // Servers without the compact stream answer with the JSON event stream.
        const binary = !!response.headers.get("content-type")?.startsWith(STREAM_BINARY_TYPE);
        compact = binary;
        const reader = response.body.getReader(), decoder = new TextDecoder(), packets = new StreamDecoder(); let buffer = "";
        try {while (!stopped) {
          const {done, value} = await reader.read().catch(reason => {if (restarted) throw Object.assign(new Error("restart"), {restart: true}); throw reason;});
          if (done) throw new Error("Session connection interrupted.");
          if (binary) {for (const message of packets.push(value)) frame(message); continue;}
          buffer += decoder.decode(value, {stream: true});
          let index: number;
          while ((index = buffer.indexOf("\n\n")) !== -1) {const packet = buffer.slice(0, index); buffer = buffer.slice(index + 2); if (packet.startsWith("data: ")) frame(JSON.parse(packet.slice(6)));}
        }} finally {compact = false; await reader.cancel().catch(() => {});}
      } catch (reason) {
        if (stopped) return;
        if ((reason as {restart?: boolean}).restart) {timer = setTimeout(() => void connect(), 0); return;}
        const failure = reason as Error & {code?: string; status?: number};
        if (failure.code === "seat-occupied" || failure.code === "seat-open-elsewhere") {
          this.update({connected: false, owner: false, fatal: `${failure.message} Retrying automatically every 5 seconds.`, code: failure.code, detail: (failure as {detail?: Record<string, unknown>}).detail});
          timer = setTimeout(() => void connect(), 5000);
          return;
        }
        if (failure.status && failure.status < 500) {fatal(reason); return;}
        this.update({connected: false, owner: false, status: "Reconnecting to saved session…"});
        timer = setTimeout(() => void connect(), 1500);
      }
    };
    // Defer the claim so React StrictMode's discarded effect never occupies a seat.
    timer = setTimeout(() => void connect(), 0);
    const pageHide = () => {stopped = true; clearTimeout(timer); controller.abort(); release();};
    const pageShow = (event: PageTransitionEvent) => {if (event.persisted) window.location.reload();};
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {stopped = true; clearTimeout(timer); controller.abort(); release(); this.send = null; this.manageEvent = null; this.postDemo = null; this.postShadow = null; this.restartStream = null; window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", pageShow);};
  }
}
