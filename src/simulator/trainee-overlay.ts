import type {DemoGroundDraft, DemoState} from "./demonstration";
import {buildGroundRoute, groundPointKey} from "./ground-route";
import type {Airport, GroundRoute} from "./model";
import type {DemoFrame} from "./shared-transport";

/** The trainee's colour on a staff radar: their selection ring, drags and open messages. */
export const TRAINEE_BLUE = "#499cff";

/** Each staff page keeps its own choice, per account: a trainer and an Owner spectator never share it. */
export interface TraineeControlsSetting {show: boolean; followZoom: boolean}
export const TRAINEE_CONTROLS_DEFAULT: TraineeControlsSetting = {show: true, followZoom: false};
export const traineeControlsKey = (accountId?: string) => `sweatbox:trainee-controls:${accountId ?? "anonymous"}`;

type Store = Pick<Storage, "getItem" | "setItem">;
export function readTraineeControls(storage: Store | undefined, accountId?: string): TraineeControlsSetting {
  try {
    const saved = JSON.parse(storage?.getItem(traineeControlsKey(accountId)) ?? "null") as Partial<TraineeControlsSetting> | null;
    return {
      show: typeof saved?.show === "boolean" ? saved.show : TRAINEE_CONTROLS_DEFAULT.show,
      followZoom: typeof saved?.followZoom === "boolean" ? saved.followZoom : TRAINEE_CONTROLS_DEFAULT.followZoom,
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

/** The aircraft the trainee is working: the one whose messages are open, otherwise the one selected. */
export const traineeFocus = (state: DemoState | null) => state ? state.messageId ?? state.selectedId : null;

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
