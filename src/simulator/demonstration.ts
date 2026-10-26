import {z} from "zod/v3";
import type {ReplayDemoMark} from "./replays";
import type {MapCamera} from "./scope-camera";
import type {Exercise, Frequency, GroundRoute, GroundRouteDestination, Point} from "./model";
import type {VectorTarget} from "./vector-drag";

/** Mentor demonstration: the mentor holds the controller seat and the mentee watches a live mirror.
 * Control itself is `exercise.demonstration`; everything here is the ephemeral mirror channel. */
export const DEMO_BATCH_MS = 100;
/** The trainee renders the pointer this far behind the trainer to smooth over network jitter. */
export const DEMO_PLAYBACK_DELAY_MS = 120;
export const DEMO_SENT_VISIBLE_MS = 7000;

/** Whether this page holds the controller seat: the trainer's control page, or the spectator who took over. */
export function demoPresenter(demonstration: Exercise["demonstration"], role: "staff" | "mentee" | "spectator", accountId: string) {
  if (!demonstration) return false;
  return demonstration.spectator ? role === "spectator" && demonstration.byId === accountId : role === "staff";
}

export interface DemoGroundDraft {aircraftId: string; kind: GroundRoute["kind"]; controls: Point[]; destination: GroundRouteDestination; holds: Record<string, boolean>}
/** The controller state both screens share while demonstrating. */
export interface DemoController {
  frequency: Frequency; selectedId: string | null; messageId: string | null; menuPath: string[];
  dismissedStrips: Record<string, string | null>;
}
export interface DemoState extends DemoController {
  quickHidden: boolean; utility: string | null;
  vectorHeading?: number; vectorTarget?: VectorTarget; vectorAnchor?: Point;
  vectorDraft: {aircraftId: string; point: Point} | null;
  ground: DemoGroundDraft | null;
  camera: (MapCamera & {width: number; height: number}) | null;
  /** How far each scrolled list is scrolled, 0 to 1, keyed by `demoScrollKey`. */
  scroll?: Record<string, number>;
}
/** Where the pointer is: a map position on the scope, or a spot on a labelled control or screen region. */
export type DemoAnchor = {kind: "scope"; point: Point} | {kind: "ui"; region: string; label?: string; fx: number; fy: number};
export interface DemoPointer {t: number; at: DemoAnchor; down?: boolean}
export type DemoEvent =
  | {t: number; kind: "click"; at: DemoAnchor}
  | {t: number; kind: "sent"; id: string; aircraftId: string; callsign: string; text: string; path: string[]};
export interface DemoBatch {seq: number; sentAt: number; elapsed: number; state?: DemoState; pointer: DemoPointer[]; events: DemoEvent[]}

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
const id = z.string().min(1).max(100);
const label = z.string().max(120);
const point = z.object({x: finite(-1e5, 1e5), y: finite(-1e5, 1e5)}).strict();
const frequency = z.enum(["ground", "tower", "atis", "approach", "center", "departure", "unicom"]);
const anchor = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("scope"), point}).strict(),
  z.object({kind: z.literal("ui"), region: z.string().regex(/^[a-z-]{1,40}$/), label: label.optional(), fx: finite(-1, 2), fy: finite(-1, 2)}).strict(),
]);
const time = finite(-1e13, 1e13);
const controller = {
  frequency, selectedId: id.nullable(), messageId: id.nullable(), menuPath: z.array(label).max(12),
  dismissedStrips: z.record(z.string().max(220), id.nullable()).refine(value => Object.keys(value).length <= 300),
};
export const demoControllerSchema = z.object(controller).strict();
export const demoStateSchema = z.object({...controller,
  quickHidden: z.boolean(), utility: z.string().max(40).nullable(),
  vectorHeading: finite(0, 360).optional(), vectorAnchor: point.optional(),
  vectorTarget: z.object({index: finite(0, 500).int(), name: label, point}).strict().optional(),
  vectorDraft: z.object({aircraftId: id, point}).strict().nullable(),
  ground: z.object({aircraftId: id, kind: z.enum(["taxi", "pushback"]), controls: z.array(point).min(2).max(24),
    destination: z.object({type: z.enum(["point", "runway", "parking"]), id: id.optional()}).strict(),
    holds: z.record(z.string().max(80), z.boolean()).refine(value => Object.keys(value).length <= 200)}).strict().nullable(),
  camera: z.object({center: point, scale: finite(1e-6, 1e9), width: finite(0, 20000), height: finite(0, 20000)}).strict().nullable(),
  scroll: z.record(z.string().regex(/^[a-z-]{1,40}:[0-9.]{0,120}$/), finite(0, 1)).refine(value => Object.keys(value).length <= 24).optional(),
}).strict();
export const demoBatchSchema = z.object({
  seq: finite(0, 1e12).int(), sentAt: time, elapsed: finite(0, 1e12), state: demoStateSchema.optional(),
  pointer: z.array(z.object({t: time, at: anchor, down: z.boolean().optional()}).strict()).max(120),
  events: z.array(z.discriminatedUnion("kind", [
    z.object({t: time, kind: z.literal("click"), at: anchor}).strict(),
    z.object({t: time, kind: z.literal("sent"), id, aircraftId: id, callsign: z.string().max(80), text: z.string().max(2000), path: z.array(label).max(12)}).strict(),
  ])).max(40),
}).strict();

export const sameDemoState = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A control's visible name, used to find the same control on the other screen. */
export function demoLabel(element: Element) {
  const text = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 120) : undefined;
}
const CONTROLS = "button, a, [role=switch], [role=menuitem], input, select, label";

/** Turns a screen position into something the trainee's screen can place, whatever its size. */
export function demoAnchorAt(root: HTMLElement, target: EventTarget | null, clientX: number, clientY: number, scope?: {element: HTMLElement; camera: MapCamera}): DemoAnchor {
  const element = target instanceof Element ? target : null;
  const control = element?.closest(CONTROLS);
  const name = control && root.contains(control) ? demoLabel(control) : undefined;
  const regionElement = element?.closest<HTMLElement>("[data-demo-region]");
  const region = regionElement && root.contains(regionElement) ? regionElement.dataset.demoRegion! : "root";
  if (control && name) {
    const bounds = control.getBoundingClientRect();
    return {kind: "ui", region, label: name, fx: bounds.width ? (clientX - bounds.left) / bounds.width : .5, fy: bounds.height ? (clientY - bounds.top) / bounds.height : .5};
  }
  if (scope && element && scope.element.contains(element)) {
    const bounds = scope.element.getBoundingClientRect();
    return {kind: "scope", point: {x: scope.camera.center.x + (clientX - bounds.left - bounds.width / 2) / scope.camera.scale, y: scope.camera.center.y - (clientY - bounds.top - bounds.height / 2) / scope.camera.scale}};
  }
  const area = (region === "root" ? root : regionElement!).getBoundingClientRect();
  return {kind: "ui", region, fx: area.width ? (clientX - area.left) / area.width : .5, fy: area.height ? (clientY - area.top) / area.height : .5};
}

/** Names a scrolled list by its region and its place under it, which is the same on both screens. */
export function demoScrollKey(root: HTMLElement, element: Element): string | null {
  const region = element.closest<HTMLElement>("[data-demo-region]");
  if (!region || !root.contains(region)) return null;
  const path: number[] = [];
  for (let node = element; node !== region && node.parentElement; node = node.parentElement) path.unshift([...node.parentElement.children].indexOf(node));
  return `${region.dataset.demoRegion}:${path.join(".")}`;
}
/** The list a scroll key names on this screen. */
export function demoScrollElement(root: HTMLElement, key: string): HTMLElement | null {
  const [region, path] = key.split(":");
  // A closing popup can still be on screen beside the one that replaced it.
  let node: Element | null = root.querySelector(`[data-demo-region="${region}"]:not([data-closing="true"])`) ?? root.querySelector(`[data-demo-region="${region}"]`);
  for (const index of path ? path.split(".").map(Number) : []) node = node?.children[index] ?? null;
  return node instanceof HTMLElement ? node : null;
}
/** How far a list is scrolled, from 0 at the top to 1 at the bottom. */
export const demoScrollRatio = (element: Element) => {
  const range = element.scrollHeight - element.clientHeight;
  return range > 0 ? Math.min(1, Math.max(0, element.scrollTop / range)) : 0;
};

/** Finds the control an anchor names on this screen, preferring a visible one. */
export function demoControl(root: HTMLElement, at: DemoAnchor) {
  if (at.kind !== "ui" || !at.label) return null;
  const area = at.region === "root" ? root : root.querySelector(`[data-demo-region="${at.region}"]`) ?? root;
  let fallback: Element | null = null;
  for (const element of area.querySelectorAll(CONTROLS)) {
    if (demoLabel(element) !== at.label) continue;
    const bounds = element.getBoundingClientRect();
    if (bounds.width && bounds.height) return element;
    fallback ??= element;
  }
  return fallback;
}

/** Places an anchor on this screen in client pixels, or null when it is not visible here. */
export function demoPosition(root: HTMLElement, at: DemoAnchor, scope?: {element: HTMLElement; camera: MapCamera}): Point | null {
  if (at.kind === "scope") {
    if (!scope) return null;
    const bounds = scope.element.getBoundingClientRect();
    return {x: bounds.left + bounds.width / 2 + (at.point.x - scope.camera.center.x) * scope.camera.scale, y: bounds.top + bounds.height / 2 - (at.point.y - scope.camera.center.y) * scope.camera.scale};
  }
  const control = demoControl(root, at);
  const area = control ?? (at.region === "root" ? root : root.querySelector(`[data-demo-region="${at.region}"]`));
  if (!area) return null;
  const bounds = area.getBoundingClientRect();
  if (!bounds.width && !bounds.height) return null;
  return {x: bounds.left + at.fx * bounds.width, y: bounds.top + at.fy * bounds.height};
}

/** Fits the trainer's visible map area into this screen's scope. */
export function followedCamera(camera: NonNullable<DemoState["camera"]>, size: {width: number; height: number}): MapCamera {
  const fit = camera.width > 0 && camera.height > 0 && size.width > 0 && size.height > 0 ? Math.min(size.width / camera.width, size.height / camera.height) : 1;
  return {center: {...camera.center}, scale: camera.scale * fit};
}

/** Turns the trainer's batches into replay marks: scope pointer at most ten times a second, every
 * click, and every sent command. `frameAt`/`frameElapsed` place exercise time on the replay clock. */
export function demoReplayMarks(entries: readonly {elapsed: number; batch: Omit<DemoBatch, "seq">}[], frameAt: number, frameElapsed: number): ReplayDemoMark[] {
  const marks: ReplayDemoMark[] = [];
  let last = -Infinity, lastDown = false;
  for (const {batch} of entries) {
    const at = (t: number) => Math.max(0, frameAt - (frameElapsed - (batch.elapsed - (batch.sentAt - t) / 1000)));
    for (const sample of batch.pointer) {
      if (sample.at.kind !== "scope") continue;
      const time = at(sample.t), down = !!sample.down;
      if (time - last < .1 && down === lastDown) continue;
      marks.push({at: time, point: sample.at.point, ...(down ? {down: true as const} : {})});
      last = time; lastDown = down;
    }
    for (const event of batch.events) {
      if (event.kind === "click" && event.at.kind === "scope") marks.push({at: at(event.t), point: event.at.point, click: true});
      else if (event.kind === "sent") marks.push({at: at(event.t), sent: {callsign: event.callsign, text: event.text, path: event.path}});
    }
  }
  return marks.sort((a, b) => a.at - b.at);
}

/** What a replay shows of the trainer at a time: the pointer for 1.5 s after its last sample, a click
 * ripple for 0.7 s, and the latest sent command for the sent card's usual 7 s. */
export function replayDemoAt(marks: readonly ReplayDemoMark[], time: number) {
  let low = 0, high = marks.length;
  while (low < high) {const mid = (low + high) >>> 1; if (marks[mid].at <= time) low = mid + 1; else high = mid;}
  let pointer: {point: Point; down?: boolean; click?: boolean} | null = null, sent: ReplayDemoMark["sent"] & {at: number} | null = null, click = false;
  for (let i = low - 1; i >= 0 && time - marks[i].at <= DEMO_SENT_VISIBLE_MS / 1000; i--) {
    const mark = marks[i], age = time - mark.at;
    if (mark.click && age <= .7) click = true;
    if (!pointer && mark.point && !mark.click && age <= 1.5) {
      const next = marks.slice(low).find(other => other.point && !other.click);
      const ratio = next && next.at - mark.at <= .5 ? (time - mark.at) / (next.at - mark.at) : 0;
      pointer = {point: next && ratio ? {x: mark.point.x + (next.point!.x - mark.point.x) * ratio, y: mark.point.y + (next.point!.y - mark.point.y) * ratio} : mark.point, down: !!mark.down};
    }
    if (!sent && mark.sent) sent = {...mark.sent, at: mark.at};
  }
  return {pointer: pointer && click ? {...pointer, click} : pointer, sent};
}

/** Pointer samples interpolated at a time on the trainer's clock. */
export function demoPointerAt(samples: readonly DemoPointer[], time: number): DemoPointer | null {
  if (!samples.length) return null;
  const index = samples.findIndex(sample => sample.t > time);
  if (index === -1) return samples.at(-1)!;
  if (index === 0) return samples[0];
  const before = samples[index - 1], after = samples[index];
  if (before.at.kind !== "scope" || after.at.kind !== "scope" || after.t === before.t) return before;
  const ratio = (time - before.t) / (after.t - before.t);
  return {t: time, down: before.down, at: {kind: "scope", point: {x: before.at.point.x + (after.at.point.x - before.at.point.x) * ratio, y: before.at.point.y + (after.at.point.y - before.at.point.y) * ratio}}};
}

/** Collects the trainer's pointer and UI state and posts it in small batches. */
export class DemoRecorder {
  private seq = 0;
  private pointer: DemoPointer[] = [];
  private events: DemoEvent[] = [];
  private state: DemoState | null = null;
  private sentState: DemoState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private camera: () => DemoState["camera"] = () => null;
  constructor(private post: (batch: DemoBatch) => Promise<unknown>, private elapsed: () => number, private now = () => performance.now()) {}
  start() {if (!this.timer) this.timer = setInterval(() => void this.flush(), DEMO_BATCH_MS);}
  stop() {if (this.timer) clearInterval(this.timer); this.timer = null; this.pointer = []; this.events = []; this.sentState = null;}
  /** Replaces the exercise clock, for callers that can only read it after rendering. */
  setClock(elapsed: () => number) {this.elapsed = elapsed;}
  setState(state: Omit<DemoState, "camera">) {this.state = {...state, camera: null};}
  /** The scope view is read when each batch goes out rather than on every pan frame. */
  setCamera(camera: () => DemoState["camera"]) {this.camera = camera;}
  move(at: DemoAnchor, down?: boolean) {
    const last = this.pointer.at(-1), t = this.now();
    if (last && t - last.t < 12) this.pointer[this.pointer.length - 1] = {t, at, ...(down ? {down} : {})};
    else this.pointer.push({t, at, ...(down ? {down} : {})});
    if (this.pointer.length > 120) this.pointer.splice(0, this.pointer.length - 120);
  }
  event(event: Omit<Extract<DemoEvent, {kind: "click"}>, "t"> | Omit<Extract<DemoEvent, {kind: "sent"}>, "t">) {
    this.events.push({...event, t: this.now()} as DemoEvent);
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }
  async flush() {
    if (this.busy) return;
    const current = this.state ? {...this.state, camera: this.camera()} : null;
    const state = current && !sameDemoState(current, this.sentState) ? current : undefined;
    if (!state && !this.pointer.length && !this.events.length) return;
    const batch: DemoBatch = {seq: ++this.seq, sentAt: this.now(), elapsed: this.elapsed(), ...(state ? {state} : {}), pointer: this.pointer, events: this.events};
    this.pointer = []; this.events = []; this.busy = true;
    try {await this.post(batch); if (state) this.sentState = state;}
    catch {/* The next batch carries the latest state again. */}
    finally {this.busy = false;}
  }
}
