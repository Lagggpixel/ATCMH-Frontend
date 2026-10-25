/** Sweatbox tours: short hands-on tracks. Pure data and helpers; the browser parts live in StaffTutorial.tsx. */

export type TrackId = "start-share" | "run-radar" | "taxi" | "flight-plans" | "add-aircraft" | "full-stop" | "mentee-first";
export type TourScope = "home" | "radar" | "mentee";

/** A control on the page: a data-simulator-tour name, or a selector optionally narrowed by its visible text. */
export interface TourTarget {tour?: string; selector?: string; text?: readonly string[]}
/** When a step counts as done: an element appears, the user acts on the target, or a counter goes up. */
export type DoneCheck =
  | {kind: "present"; target: TourTarget}
  | {kind: "event"; event: "click" | "change" | "drop"; target?: TourTarget}
  | {kind: "count-up"; target: TourTarget};

export interface TourStep {target?: TourTarget; fallback?: TourTarget; title: string; text: string; task?: string; hint?: string; done?: readonly DoneCheck[]}
export interface TourTrack {id: TrackId; scope: TourScope; title: string; summary: string; length: string; isNew?: boolean; steps: readonly TourStep[]}

const tour = (name: string): TourTarget => ({tour: name});
const SELECTED = {selector: '[data-simulator-tour="aircraft-controls"]:not([data-section="global-log"])'};
const START_BUTTONS = {selector: "button", text: ["Start Taxi", "Start Pushback"]};
const FS = {selector: 'button[aria-label="All aircraft full stop"]'};

export const TRACKS: readonly TourTrack[] = [
  {id: "start-share", scope: "home", title: "Start and share a session", summary: "Pick a scenario, invite your Mentee, open the radar.", length: "4 steps", steps: [
    {target: tour("new-session"), title: "Start a session", text: "Choose Start a session, then pick a published scenario and, if you like, the Mentee. It starts paused so you can prepare.", hint: "Nothing is created until you confirm in that window."},
    {target: tour("session-library"), title: "Your sessions", text: "Sessions are listed here with their airport, Mentee and status."},
    {target: tour("mentee-sharing"), fallback: tour("session-library"), title: "Invite your Mentee", text: "Assign a Mentee and the session shows up in their Your sweatbox. Or copy the code and send it.", task: "Copy a session code or assign a Mentee", done: [{kind: "event", event: "click"}]},
    {target: tour("staff-radar-link"), fallback: tour("session-library"), title: "Continue on the radar", text: "Use Enter to open the Mentor radar. The next tour picks up there.", hint: "No session yet? Start one first. The radar tour waits for your next visit."},
  ]},
  {id: "run-radar", scope: "radar", title: "Run the radar", summary: "Play and pause, the aircraft list and the controls beside the radar.", length: "6 steps", steps: [
    {target: tour("play-pause"), title: "Control the pace", text: "Press Play when you and your Mentee are ready. Pause freezes the exercise whenever you need to explain something.", hint: "The tour never pauses a running exercise for you."},
    {target: tour("traffic"), title: "Select an aircraft", text: "This is your traffic. Select a callsign here or on the scope to open its controls.", task: "Select any aircraft", done: [{kind: "present", target: SELECTED}]},
    {target: tour("aircraft-controls"), title: "Act as the pilot", text: "Radio replies and sends pilot requests. Flight changes movement. Setup holds intentions, routes, speeds and aircraft details.", hint: "With nothing selected, this panel shows the session log."},
    {target: tour("automatic"), fallback: tour("session-menu"), title: "Choose how pilots respond", text: "In the Session menu, Automatic pilot actions reads back and follows valid instructions for you. Turn it off to reply yourself.", hint: "Automatic never grants clearances."},
    {target: tour("timeline"), fallback: tour("toolbar"), title: "Follow the scenario", text: "In a scenario session, Scenario shows what runs next and lets you run Mentor release events. Finish attempt in the Session menu saves feedback."},
    {target: tour("return-sessions"), title: "Return for a debrief", text: "Go back to Sessions here. Archive closes a session, asks for your feedback and saves its replay.", hint: "Tours are always under Help."},
  ]},
  {id: "taxi", scope: "radar", isNew: true, title: "Taxi and pushback", summary: "Plan a route on the scope, then Start Taxi or Start Pushback.", length: "4 steps", steps: [
    {target: tour("traffic"), title: "Pick an aircraft on the ground", text: "Select an aircraft that is parked or holding.", task: "Select a ground aircraft", done: [{kind: "present", target: SELECTED}]},
    {target: {selector: "button", text: ["Plan on scope"]}, fallback: tour("aircraft-controls"), title: "Plan on scope", text: "Open Flight, then press Plan on scope.", task: "Press Plan on scope", done: [{kind: "event", event: "click"}]},
    {target: tour("radar"), title: "Drag a taxi route", text: "Press on the aircraft and drag along the taxiways to where it should stop. The route follows the taxiway lines. Esc cancels.", task: "Drag a route on the scope", done: [{kind: "present", target: {...START_BUTTONS, selector: "button:not(:disabled)"}}]},
    {target: START_BUTTONS, fallback: tour("aircraft-controls"), title: "Start moving", text: "On a stand facing in, choose Start Pushback. Otherwise choose Start Taxi. The aircraft follows the route and stops at its end.", task: "Press Start Taxi or Start Pushback", hint: "Want a different route? Press Plan on scope again and drag a new one.", done: [{kind: "event", event: "click"}]},
  ]},
  {id: "flight-plans", scope: "radar", isNew: true, title: "Flight plans", summary: "Type a route like TLA DCT GOW, then drag to reorder.", length: "3 steps", steps: [
    {target: {selector: 'button, [role="tab"]', text: ["Routes", "Route"]}, fallback: tour("aircraft-controls"), title: "Open the route", text: "Select an aircraft, open Setup, then Routes.", task: "Open Routes", done: [{kind: "event", event: "click"}]},
    {target: {selector: '[data-simulator-tour="aircraft-controls"] input:not([type="checkbox"]):not([type="radio"])'}, fallback: tour("aircraft-controls"), title: "Type a route", text: "Type fixes with DCT between them, like TLA DCT GOW, or a procedure as PROC.TRANSITION, then apply it.", task: "Type a route and apply it", done: [{kind: "event", event: "change"}]},
    {target: tour("aircraft-controls"), title: "Put the fixes in order", text: "Drag a fix by its handle, or use its arrow buttons. A live change keeps the aircraft flying to its current fix.", task: "Move a fix", done: [{kind: "event", event: "drop"}, {kind: "event", event: "click", target: {selector: '[aria-label^="Move"]'}}]},
  ]},
  {id: "add-aircraft", scope: "radar", isNew: true, title: "Add aircraft", summary: "Spawn at the spot you click, with automatic speed.", length: "3 steps", steps: [
    {target: {selector: '[data-simulator-tour="traffic"] button', text: ["Add"]}, fallback: tour("traffic"), title: "Add an aircraft", text: "Press Add, then click the scope where it should start.", task: "Open the Add aircraft window", done: [{kind: "present", target: {selector: "dialog[open]"}}]},
    {target: {selector: "dialog[open]"}, title: "Two things are set for you", text: "Clicked position starts it at the spot you picked. Automatic speed flies a normal speed for what it is doing; choose a number to override it, in 10 kt steps.", task: "Add the aircraft", done: [{kind: "count-up", target: {selector: '[data-simulator-tour="traffic"] h1 small'}}]},
    {target: tour("traffic"), title: "Find it in the list", text: "The new aircraft is in your traffic list. Select it to give it a route or a taxi."},
  ]},
  {id: "full-stop", scope: "radar", isNew: true, title: "Full stop for everyone", summary: "One FS toggle lands every aircraft, and undoes it.", length: "2 steps", steps: [
    {target: FS, fallback: tour("traffic"), title: "Full stop for everyone", text: "FS sets every aircraft to land with a full stop. It stays highlighted while it is on.", task: "Press FS", hint: "FS needs at least one aircraft.", done: [{kind: "present", target: {selector: `${FS.selector}[aria-pressed="true"]`}}]},
    {target: FS, fallback: tour("traffic"), title: "Undo it the same way", text: "Press FS again and each aircraft goes back to the landing it had before.", task: "Press FS again", done: [{kind: "present", target: {selector: `${FS.selector}[aria-pressed="false"]`}}]},
  ]},
  {id: "mentee-first", scope: "mentee", title: "Your first session", summary: "The scope, selecting aircraft and giving a taxi route.", length: "4 steps", steps: [
    {target: tour("radar"), title: "You are the controller", text: "Your Mentor flies every aircraft and plays the pilots. You give the instructions on this scope."},
    {target: tour("radar"), title: "Select an aircraft", text: "Click an aircraft on the scope to see its flight plan and your options."},
    {target: tour("radar"), title: "Drag a taxi route", text: "With a ground aircraft selected, drag along the taxiways to build the taxi instruction, then send it."},
    {title: "Paused means talk", text: "When your Mentor pauses, everything freezes so you can go over what happened. Nothing is lost.", hint: "You can replay this tour from Help."},
  ]},
];

export const WHATS_NEW: readonly TrackId[] = ["taxi", "flight-plans", "add-aircraft", "full-stop"];
export const trackById = (id: TrackId) => TRACKS.find(track => track.id === id)!;
export const tracksFor = (scopes: readonly TourScope[]) => TRACKS.filter(track => scopes.includes(track.scope));

export interface ActiveTour {track: TrackId; step: number; minimised?: boolean}
export interface TourProgress {v: 2; done: TrackId[]; welcomed: boolean; active: ActiveTour | null; queue: TrackId[]}
export const emptyProgress = (): TourProgress => ({v: 2, done: [], welcomed: false, active: null, queue: []});
export const progressKey = (accountId: string) => `simulator:tutorial:v2:${accountId}`;
export const legacyKey = (accountId: string) => `simulator:staff-tutorial:v1:${accountId}`;
const isTrack = (value: unknown): value is TrackId => TRACKS.some(track => track.id === value);

/** Reads stored progress, carrying over the old single-tour outcome the first time. */
export function readProgress(raw: string | null, legacy: string | null): TourProgress {
  if (raw) try {
    const value = JSON.parse(raw) as Partial<TourProgress>;
    const active = value.active && isTrack(value.active.track) ? {track: value.active.track, step: Math.max(0, Math.min(Number(value.active.step) || 0, trackById(value.active.track).steps.length - 1)), minimised: !!value.active.minimised} : null;
    return {v: 2, done: (value.done ?? []).filter(isTrack), welcomed: !!value.welcomed, active, queue: (value.queue ?? []).filter(isTrack)};
  } catch { /* Fall through to a fresh start. */ }
  if (legacy === "completed") return {...emptyProgress(), done: ["start-share", "run-radar"], welcomed: true};
  if (legacy === "radar") return {...emptyProgress(), done: ["start-share"], welcomed: true, active: {track: "run-radar", step: 0}};
  if (legacy === "skipped") return {...emptyProgress(), welcomed: true};
  return emptyProgress();
}

export function startTrack(progress: TourProgress, track: TrackId, queue: readonly TrackId[] = []): TourProgress {
  return {...progress, welcomed: true, active: {track, step: 0}, queue: queue.filter(id => id !== track)};
}
export function goToStep(progress: TourProgress, step: number): TourProgress {
  if (!progress.active) return progress;
  const last = trackById(progress.active.track).steps.length - 1;
  return {...progress, active: {...progress.active, step: Math.max(0, Math.min(step, last)), minimised: false}};
}
/** Marks the active track done and starts the next queued one. */
export function finishTrack(progress: TourProgress): TourProgress {
  if (!progress.active) return progress;
  const done = progress.done.includes(progress.active.track) ? progress.done : [...progress.done, progress.active.track];
  const [next, ...queue] = progress.queue;
  return {...progress, done, active: next ? {track: next, step: 0} : null, queue: next ? queue : []};
}
export const endTour = (progress: TourProgress): TourProgress => ({...progress, welcomed: true, active: null, queue: []});
export const setMinimised = (progress: TourProgress, minimised: boolean): TourProgress => progress.active ? {...progress, active: {...progress.active, minimised}} : progress;
export const resetProgress = (): TourProgress => ({...emptyProgress(), welcomed: true});

/** The next track worth suggesting: the one in progress, else the first one not done. */
export function suggestedTrack(progress: TourProgress, scopes: readonly TourScope[]): TrackId | null {
  if (progress.active && scopes.includes(trackById(progress.active.track).scope)) return progress.active.track;
  return tracksFor(scopes).find(track => !progress.done.includes(track.id))?.id ?? null;
}

/** Minimal DOM surface the matchers need, so they can be tested without a browser. */
export interface TourNode {textContent: string | null}
export interface TourRoot<T extends TourNode> {querySelectorAll(selector: string): ArrayLike<T> & Iterable<T>}
export const targetSelector = (target: TourTarget) => target.selector ?? `[data-simulator-tour="${target.tour}"]`;
const clean = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
export function matchesText<T extends TourNode>(element: T, target: TourTarget) {
  return !target.text || target.text.some(text => clean(element.textContent) === text.toLowerCase());
}
export function findTargets<T extends TourNode>(root: TourRoot<T>, target: TourTarget, usable: (element: T) => boolean = () => true): T[] {
  return [...root.querySelectorAll(targetSelector(target))].filter(element => matchesText(element, target) && usable(element));
}
export const numberIn = (text: string | null) => {const match = /\d+/.exec(text ?? ""); return match ? Number(match[0]) : null;};

export interface TourRect {left: number; top: number; width: number; height: number}
/** Keep the guide beside its target where possible, inside small/short viewports. */
export function placeTourCard(target: TourRect | null, viewport: {width: number; height: number}, card: {width: number; height: number}) {
  const gap = 16, margin = 12;
  let left = viewport.width - card.width - margin, top = viewport.height - card.height - margin;
  if (target) {
    if (target.left + target.width + gap + card.width <= viewport.width - margin) {left = target.left + target.width + gap; top = target.top;}
    else if (target.left - gap - card.width >= margin) {left = target.left - gap - card.width; top = target.top;}
    else if (target.top + target.height + gap + card.height <= viewport.height - margin) {left = target.left; top = target.top + target.height + gap;}
    else if (target.top - gap - card.height >= margin) {left = target.left; top = target.top - gap - card.height;}
    else {left = target.left + target.width - card.width - gap; top = target.top + gap;}
  }
  return {left: Math.max(margin, Math.min(left, viewport.width - card.width - margin)), top: Math.max(margin, Math.min(top, viewport.height - card.height - margin))};
}
