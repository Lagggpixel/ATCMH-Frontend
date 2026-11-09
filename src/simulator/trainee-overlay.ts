import {DEMO_SENT_VISIBLE_MS, type DemoBatch, type DemoGroundDraft, type DemoState, type QuickPicker} from "./demonstration";
import type {ReplayParticipant, ReplayTraineeMark} from "./replays";
import {buildGroundRoute, groundPointKey} from "./ground-route";
import type {Airport, GroundRoute} from "./model";
import type {DemoFrame} from "./shared-transport";

/** The part of a trainee's controller state a staff radar or replay draws. */
export type TraineeView = Pick<DemoState, "frequency" | "selectedId" | "messageId" | "menuPath" | "vectorDraft" | "ground" | "camera"> & Partial<Pick<DemoState, "quickHidden" | "vectorHeading" | "vectorTarget" | "quickPicker">>;

/** The trainee's colour on a staff radar: their selection ring, drags and open messages. */
export const TRAINEE_BLUE = "#499cff";

/** Each staff page keeps its own choice, per account: a trainer and an Owner spectator never share it. */
export interface TraineeControlsSetting {show: boolean; follow: boolean}
export const TRAINEE_CONTROLS_DEFAULT: TraineeControlsSetting = {show: true, follow: false};
export const traineeControlsKey = (accountId?: string) => `sweatbox:trainee-controls:${accountId ?? "anonymous"}`;

type Store = Pick<Storage, "getItem" | "setItem">;
export function readTraineeControls(storage: Store | undefined, accountId?: string): TraineeControlsSetting {
  try {
    const saved = JSON.parse(storage?.getItem(traineeControlsKey(accountId)) ?? "null") as (Partial<TraineeControlsSetting> & {followZoom?: unknown}) | null;
    // Earlier pages saved "follow zoom"; following now takes the trainee's whole view.
    const follow = typeof saved?.follow === "boolean" ? saved.follow : saved?.followZoom;
    return {
      show: typeof saved?.show === "boolean" ? saved.show : TRAINEE_CONTROLS_DEFAULT.show,
      follow: typeof follow === "boolean" ? follow : TRAINEE_CONTROLS_DEFAULT.follow,
    };
  } catch {return {...TRAINEE_CONTROLS_DEFAULT};}
}
export function writeTraineeControls(storage: Store | undefined, accountId: string | undefined, setting: TraineeControlsSetting) {
  try {storage?.setItem(traineeControlsKey(accountId), JSON.stringify(setting));} catch {/* Blocked storage keeps the choice for this page only. */}
}

/** The newest controller state in a shadow frame, or the one already shown. */
export function latestShadowState(current: DemoState | null, frame: DemoFrame): DemoState | null {
  for (let i = frame.batches.length - 1; i >= 0; i--) {
    const state = frame.batches[i].state;
    if (state) return state;
  }
  return frame.state ?? current;
}

/** An active drag can belong to a different aircraft from the previous selection. */
export const traineeFocus = (state: TraineeView | null) => state ? state.vectorDraft?.aircraftId ?? state.ground?.aircraftId ?? state.messageId ?? state.selectedId : null;

/** The trainee's taxi or pushback drag, rebuilt from its control points like the trainee's own preview. */
export function traineeGroundRoute(airport: Airport, ground: DemoGroundDraft | null): GroundRoute | undefined {
  if (!ground) return undefined;
  const route = buildGroundRoute(airport, ground.kind, ground.controls, ground.destination).route;
  return route ? {...route, points: route.points.map(p => groundPointKey(p) in ground.holds ? {...p, hold: ground.holds[groundPointKey(p)]} : p)} : undefined;
}

/** V toggles the overlay while the scope has focus, but never while typing. */
export function traineeShortcut(event: {key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null}) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== "v") return false;
  const target = event.target as {tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown} | null;
  if (!target?.closest?.("[data-simulator-tour=radar]")) return false;
  return !target.isContentEditable && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? "");
}

/** Only what an overlay draws: quick commands, scroll positions and dismissed strips stay out of replays. */
export const traineeView = (state: TraineeView): TraineeView => ({frequency: state.frequency, selectedId: state.selectedId, messageId: state.messageId, menuPath: state.menuPath, vectorDraft: state.vectorDraft, ground: state.ground, camera: state.camera,
  ...(state.quickHidden ? {quickHidden: true} : {}), ...(state.vectorHeading !== undefined ? {vectorHeading: state.vectorHeading} : {}),
  ...(state.vectorTarget ? {vectorTarget: state.vectorTarget} : {}), ...(state.quickPicker ? {quickPicker: state.quickPicker} : {})});

/** The aircraft whose popup menu the trainee has open: selected, not dismissed, and not replaced by the message list. */
export const traineeMenuAircraft = (state: TraineeView | null) => state && state.selectedId && !state.messageId && !state.quickHidden && !state.vectorDraft ? state.selectedId : null;

const PICKER_STEPS: Record<QuickPicker, string> = {altitude: "Assign Altitude", approach: "Clear for Approach", missed: "Missed Approach", reminder: "Set Reminder", color: "Set Color", "direct-altitude": "Direct To + Altitude"};
const degrees = (heading: number) => `${String(Math.round(heading) || 360).padStart(3, "0")}\u00b0`;

/** A message path short enough for one line: the last two steps, with the rest folded. */
export const traineePath = (labels: readonly string[]) => labels.length > 2 ? ["\u2026", ...labels.slice(-2)].join(" \u203a ") : labels.length ? labels.join(" \u203a ") : "Other Message";

/** What the trainee is doing right now, in a few words for the caption under their ring; null when nothing is open. */
export function traineeStep(state: TraineeView | null, vector?: {heading: number; nm: number; target?: string} | null): string | null {
  if (!state) return null;
  if (state.vectorDraft) {
    if (state.vectorDraft.initial) return "Vector";
    if (!vector) return "Cancel";
    return vector.target ? `Direct To ${vector.target}` : `Vector ${degrees(vector.heading)} \u00b7 ${Math.floor(vector.nm)}NM`;
  }
  if (state.ground) return state.ground.kind === "pushback" ? "Pushback draft" : "Taxi route draft";
  if (state.messageId) return traineePath(state.menuPath);
  if (!traineeMenuAircraft(state)) return null;
  const picker = state.quickPicker;
  if (picker === "direct-altitude" && state.vectorTarget) return `Direct To ${state.vectorTarget.name} + Altitude`;
  const heading = state.vectorHeading !== undefined ? degrees(state.vectorHeading) : null;
  if (picker) return heading && picker !== "reminder" && picker !== "color" ? `${PICKER_STEPS[picker]} \u00b7 ${heading}` : PICKER_STEPS[picker];
  if (state.vectorTarget) return `Direct To ${state.vectorTarget.name}`;
  return heading ? `Vector ${heading}` : "Menu open";
}

/** Turns one position's shadow trace into replay marks on the replay clock: each change of state, at
 * most one per fixed tenth of a second, and every sent command. Each mark keeps the account that produced
 * it, so a seat handover never mixes two trainees. `frameAt`/`frameElapsed` place exercise time on the replay clock. */
export function traineeReplayMarks(entries: readonly {elapsed: number; batch: Omit<DemoBatch, "seq">; accountId?: string}[], positionId: string, frameAt: number, frameElapsed: number): ReplayTraineeMark[] {
  const states: ReplayTraineeMark[] = [], sent: ReplayTraineeMark[] = [];
  const bucket = (time: number) => Math.floor(time * 10 + 1e-9);
  let last = "";
  for (const {batch, accountId} of entries) {
    const at = (t: number) => Math.max(0, frameAt - (frameElapsed - (batch.elapsed - (batch.sentAt - t) / 1000)));
    const by = accountId ? {accountId} : {};
    if (batch.state) {
      const view = traineeView(batch.state), key = JSON.stringify([accountId, view]), time = at(batch.sentAt);
      if (key !== last) {
        const previous = states.at(-1), mark = {at: time, positionId, ...by, state: view};
        // A drag in progress keeps only its newest point within each fixed tenth of a second.
        if (previous && previous.accountId === accountId && bucket(previous.at) === bucket(time)) states[states.length - 1] = mark;
        else states.push(mark);
        last = key;
      }
    }
    for (const event of batch.events) if (event.kind === "sent") sent.push({at: at(event.t), positionId, ...by, sent: {callsign: event.callsign, text: event.text, path: event.path}});
  }
  return [...states, ...sent].sort((a, b) => a.at - b.at);
}

/** The positions a replay recorded trainee controls for, in first-seen order. */
export const replayTraineePositions = (marks: readonly ReplayTraineeMark[]) => [...new Set(marks.map(mark => mark.positionId))];

/** One position's controls at a replay time: the latest state, and the latest sent command for 7 s, each
 * with the account that produced it, so a seat handover labels each mark with its own trainee. */
export function replayTraineeAt(marks: readonly ReplayTraineeMark[], positionId: string, time: number) {
  let state: TraineeView | null = null, stateBy: string | undefined, sent: (NonNullable<ReplayTraineeMark["sent"]> & {at: number; accountId?: string}) | null = null;
  for (const mark of marks) {
    if (mark.at > time) break;
    if (mark.positionId !== positionId) continue;
    if (mark.state) {state = mark.state; stateBy = mark.accountId;}
    if (mark.sent) sent = {...mark.sent, at: mark.at, ...(mark.accountId ? {accountId: mark.accountId} : {})};
  }
  return {state, stateBy, sent: sent && time - sent.at <= DEMO_SENT_VISIBLE_MS / 1000 ? sent : null};
}

/** The name to show for a recorded mark: the trainee whose account produced it, never just whoever held the seat first. */
export const replayTraineeName = (participants: readonly ReplayParticipant[], accountId: string | undefined) =>
  accountId ? participants.find(p => p.accountId === accountId)?.name || undefined : undefined;
