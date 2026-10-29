"use client";
import {useCallback, useEffect, useId, useRef, useState, useSyncExternalStore} from "react";
import {createPortal} from "react-dom";
import {Check} from "@phosphor-icons/react/dist/csr/Check";
import {Minus} from "@phosphor-icons/react/dist/csr/Minus";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {Question} from "@phosphor-icons/react/dist/csr/Question";
import {
  WHATS_NEW, endTour, findTargets, finishTrack, goToStep, legacyKey, matchesText, numberIn, placeTourCard, progressKey, readProgress, resetProgress,
  setMinimised, startTrack, suggestedTrack, targetSelector, trackById, tracksFor, emptyProgress,
  type TourProgress, type TourRect, type TourScope, type TourStep, type TourTarget, type TrackId,
} from "./tutorial";
import styles from "./StaffTutorial.module.css";

/* Progress is a personal browser preference shared by every tour component on the page. */
const listeners = new Set<() => void>();
const cache = new Map<string, TourProgress>();
const SERVER_PROGRESS: TourProgress = {...emptyProgress(), welcomed: true};
function loadProgress(accountId: string) {
  let progress = cache.get(accountId);
  if (!progress) {
    let raw: string | null = null, legacy: string | null = null;
    try {raw = window.localStorage.getItem(progressKey(accountId)); legacy = window.localStorage.getItem(legacyKey(accountId));} catch { /* Tours work without storage. */ }
    progress = readProgress(raw, legacy); cache.set(accountId, progress);
  }
  return progress;
}
const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
export function useTourProgress(accountId: string) {
  const progress = useSyncExternalStore(subscribe, () => loadProgress(accountId), () => SERVER_PROGRESS);
  const update = useCallback((change: (current: TourProgress) => TourProgress) => {
    const next = change(loadProgress(accountId));
    cache.set(accountId, next);
    try {window.localStorage.setItem(progressKey(accountId), JSON.stringify(next));} catch { /* Tours work without storage. */ }
    listeners.forEach(listener => listener());
  }, [accountId]);
  return [progress, update] as const;
}

const usable = (element: HTMLElement) => {const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && !element.closest("[inert]");};
const find = (target?: TourTarget) => target ? findTargets<HTMLElement>(document, target, usable)[0] ?? null : null;
const where = {home: "Sweatbox home", radar: "Mentor radar"} as const;
const MENTOR_SCOPES: readonly TourScope[] = ["home", "radar"];

/** The guide card and spotlight for whichever track is active. Renders nothing when no tour runs. */
function CoachTour({accountId, scope, live = false}: {accountId: string; scope: TourScope; live?: boolean}) {
  const [progress, update] = useTourProgress(accountId);
  const active = progress.active, track = active ? trackById(active.track) : null;
  const here = !!track && track.scope === scope;
  // A track started elsewhere points the way there.
  const away = !!track && !here;
  const shown: TourStep | null = here && active ? track.steps[active.step] : away && track ? {
    title: `Continue on the ${where[track.scope]}`, target: scope === "home" && track.scope === "radar" ? {tour: "staff-radar-link"} : undefined,
    text: track.scope === "radar" ? `${track.title} runs on the radar. Open any session with Enter and it picks up there.` : `${track.title} continues on the Sweatbox home.`,
  } : null;
  const stepKey = active ? `${active.track}:${active.step}:${here}` : "";
  const minimised = !!active?.minimised;
  const [layout, setLayout] = useState<{target: TourRect | null; left: number; top: number} | null>(null);
  const [found, setFound] = useState(false), [satisfied, setSatisfied] = useState(false), [pulse, setPulse] = useState(0);
  const card = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), element = useRef<HTMLElement | null>(null);
  const baseline = useRef<number | null | undefined>(undefined);
  const titleId = useId(), descriptionId = useId();
  const last = !!track && !!active && active.step === track.steps.length - 1;
  const canNext = !shown?.done || satisfied || !found;

  // Reset per-step state while rendering when the step changes, rather than in an effect.
  const [seenStep, setSeenStep] = useState(stepKey);
  if (seenStep !== stepKey) {setSeenStep(stepKey); setSatisfied(false); setLayout(null);}
  useEffect(() => {baseline.current = undefined;}, [stepKey]);
  useEffect(() => {if (shown && !minimised && layout) heading.current?.focus({preventScroll: true});}, [stepKey, minimised, layout !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    if (!active || !track) return;
    if (!last) {update(current => goToStep(current, active.step + 1)); return;}
    const link = track.id === "start-share" ? document.querySelector<HTMLAnchorElement>('[data-simulator-tour="staff-radar-link"]') : null;
    update(current => {const next = finishTrack(current); return track.id === "start-share" && !next.active && !next.done.includes("run-radar") ? startTrack(next, "run-radar") : next;});
    if (link) window.location.assign(link.href);
  }, [active, track, last, update]);

  // Position the card and spotlight, and check the step's "present" and "count-up" conditions on every change.
  useEffect(() => {
    if (!shown || minimised) return;
    let frame = 0, observed: Element | null = null;
    const resize = new ResizeObserver(() => schedule());
    const update = () => {
      const primary = find(shown.target), target = primary ?? find(shown.fallback);
      element.current = primary; setFound(!!primary);
      if (target !== observed) {
        if (observed) resize.unobserve(observed);
        if (target) {resize.observe(target); target.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});}
        observed = target;
      }
      const rect = target?.getBoundingClientRect();
      const visible = rect && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      const box = visible ? {left: Math.max(4, rect.left - 6), top: Math.max(4, rect.top - 6), width: Math.max(0, Math.min(innerWidth - 4, rect.right + 6) - Math.max(4, rect.left - 6)), height: Math.max(0, Math.min(innerHeight - 4, rect.bottom + 6) - Math.max(4, rect.top - 6))} : null;
      const size = card.current?.getBoundingClientRect();
      const next = {target: box, ...placeTourCard(box, {width: innerWidth, height: innerHeight}, {width: size?.width ?? 360, height: size?.height ?? 320})};
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      for (const check of shown.done ?? []) {
        if (check.kind === "present" && findTargets<HTMLElement>(document, check.target, usable).length) setSatisfied(true);
        if (check.kind === "count-up") {
          const count = numberIn(findTargets<HTMLElement>(document, check.target)[0]?.textContent ?? null);
          if (baseline.current === undefined) baseline.current = count;
          else if (count !== null && baseline.current !== null && count > baseline.current) setSatisfied(true);
        }
      }
    };
    function schedule() {cancelAnimationFrame(frame); frame = requestAnimationFrame(update);}
    if (card.current) resize.observe(card.current);
    const mutations = new MutationObserver(schedule); mutations.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed", "data-section", "disabled", "open", "aria-selected"]});
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true); schedule();
    return () => {cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);};
  }, [stepKey, minimised]); // eslint-disable-line react-hooks/exhaustive-deps

  // "event" conditions: the user clicks, changes or drops on the step's control.
  useEffect(() => {
    const checks = (shown?.done ?? []).flatMap(check => check.kind === "event" ? [check] : []);
    if (!checks.length || minimised) return;
    const handlers = checks.map(check => {
      const handler = (event: Event) => {
        const source = event.target instanceof Element ? event.target : null;
        if (!source) return;
        const hit = check.target ? (() => {const match = source.closest<HTMLElement>(targetSelector(check.target)); return !!match && matchesText(match, check.target);})() : !!element.current?.contains(source);
        if (hit) setSatisfied(true);
      };
      document.addEventListener(check.event, handler, true);
      return [check.event, handler] as const;
    });
    return () => handlers.forEach(([type, handler]) => document.removeEventListener(type, handler, true));
  }, [stepKey, minimised]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!satisfied || minimised) return;
    const timer = window.setTimeout(advance, 1100);
    return () => window.clearTimeout(timer);
  }, [satisfied, minimised, advance]);

  useEffect(() => {
    if (!shown || minimised) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      event.preventDefault(); event.stopImmediatePropagation(); update(current => setMinimised(current, true));
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [shown !== null, minimised, update]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown || !track || !active || typeof document === "undefined") return null;
  const theme = `${styles.tour} ${live ? styles.live : ""}`;
  if (minimised) return createPortal(<div className={theme}><div className={styles.pill} role="status">
    <span><strong>{track.title}</strong> · {here ? `${active.step + 1} of ${track.steps.length}, paused` : "paused"}</span>
    <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => update(current => setMinimised(current, false))}>Resume</button>
    <button type="button" className={`${styles.btn} ${styles.iconBtn}`} aria-label="End tour" onClick={() => update(endTour)}><X size={16} aria-hidden="true"/></button>
  </div></div>, document.body);
  const tasks = here ? track.steps.map((item, index) => ({label: item.task ?? item.title, state: index < active.step || index === active.step && satisfied ? "done" : index === active.step ? "now" : "todo"})) : [];
  return createPortal(<div className={theme}>
    {layout?.target && layout.target.width > 0 && layout.target.height > 0 ? <div key={pulse} className={`${styles.spotlight} ${pulse ? styles.pulse : ""}`} data-testid="tutorial-spotlight" aria-hidden="true" style={layout.target}/> : null}
    <section ref={card} className={styles.card} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId} style={{left: layout?.left ?? 12, top: layout?.top ?? 12, visibility: layout ? "visible" : "hidden"}}>
      <header className={styles.head}><span>{track.title}{here ? <> · <span aria-live="polite">{active.step + 1} of {track.steps.length}</span></> : null}</span>
        <button type="button" className={`${styles.btn} ${styles.iconBtn} ${styles.quiet}`} aria-label="Minimise tour" title="Minimise (Esc)" onClick={() => update(current => setMinimised(current, true))}><Minus size={16} aria-hidden="true"/></button></header>
      {here ? <div className={styles.progress} aria-hidden="true">{track.steps.map((item, index) => <span key={index} className={index <= active.step ? styles.reached : undefined}/>)}</div> : null}
      {satisfied ? <p className={styles.ok} role="status"><Check size={14} weight="bold" aria-hidden="true"/>Done. Nice.</p> : null}
      <h2 id={titleId} ref={heading} tabIndex={-1}>{shown.title}</h2>
      <p id={descriptionId}>{shown.text}</p>
      {shown.hint ? <p className={styles.hint}>{shown.hint}</p> : null}
      {here && shown.target && !found ? <p className={styles.hint}>This control is not on screen right now. Open it, or continue without it.</p> : null}
      {tasks.some((_, index) => track.steps[index].task) ? <ol className={styles.tasks} aria-label="Steps">{tasks.map((task, index) => <li key={index} className={styles[task.state]}><span className={styles.chk} aria-hidden="true">{task.state === "done" ? <Check size={10} weight="bold"/> : null}</span>{task.label}<span className={styles.srOnly}>{task.state === "done" ? " (done)" : task.state === "now" ? " (current)" : ""}</span></li>)}</ol> : null}
      <footer className={styles.foot}>
        {found && shown.target ? <button type="button" className={styles.btn} onClick={() => {element.current?.scrollIntoView({block: "center", inline: "nearest", behavior: "smooth"}); setPulse(value => value + 1);}}><Play size={14} weight="fill" aria-hidden="true"/>Show me</button> : <span/>}
        <span className={styles.footEnd}>
          {here && active.step > 0 ? <button type="button" className={`${styles.btn} ${styles.quiet}`} onClick={() => update(current => goToStep(current, active.step - 1))}>Back</button> : null}
          {!here ? <button type="button" className={`${styles.btn} ${styles.quiet}`} onClick={() => update(endTour)}>End tour</button>
            : !canNext ? <button type="button" className={`${styles.btn} ${styles.quiet}`} onClick={advance}>Skip step</button>
            : <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={advance}>{last ? track.id === "start-share" ? "Continue on radar" : "Finish" : "Next"}</button>}
        </span>
      </footer>
    </section>
  </div>, document.body);
}

/** First visit on the Sweatbox home: pick how to get started. */
function WelcomeDialog({accountId}: {accountId: string}) {
  const [progress, update] = useTourProgress(accountId);
  const [choice, setChoice] = useState<"around" | "new" | "own">("around");
  const titleId = useId();
  const open = !progress.welcomed && !progress.active;
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") update(endTour);};
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, update]);
  if (!open || typeof document === "undefined") return null;
  const options = [
    ["around", "Show me around", "A short tour of Home, then the radar."],
    ["new", "Only what is new", "Plan on scope, typed flight plans, Add aircraft and the FS toggle."],
    ["own", "Let me explore on my own", "No tour now. Tours are always under Help."],
  ] as const;
  const start = () => update(current => choice === "around" ? startTrack(current, "start-share") : choice === "new" ? startTrack(current, WHATS_NEW[0], WHATS_NEW) : endTour(current));
  return createPortal(<div className={`${styles.tour} ${styles.backdrop}`}>
    <section className={styles.welcome} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>Welcome to the new Sweatbox</h2>
      <p>There is a new layout and new ways to move aircraft. How would you like to get started?</p>
      <div role="radiogroup" aria-label="How to get started" className={styles.options}>
        {options.map(([key, title, text]) => <button key={key} type="button" role="radio" aria-checked={choice === key} className={styles.option} onClick={() => setChoice(key)}>
          <span><strong>{title}</strong><small>{text}</small></span><span className={styles.radio} aria-hidden="true"/>
        </button>)}
      </div>
      <footer className={styles.foot}><span/><span className={styles.footEnd}><button type="button" className={`${styles.btn} ${styles.quiet}`} onClick={() => update(endTour)}>Not now</button><button type="button" className={`${styles.btn} ${styles.primary}`} onClick={start}>{choice === "own" ? "Done" : "Start the tour"}</button></span></footer>
    </section>
  </div>, document.body);
}

const statusOf = (progress: TourProgress, id: TrackId) => progress.active?.track === id ? "now" : progress.done.includes(id) ? "done" : "todo";

/** Sweatbox home: the Learn the Sweatbox card. It also hosts the welcome dialog and the Home tour. */
export function LearnCard({accountId}: {accountId: string}) {
  const [progress, update] = useTourProgress(accountId);
  const tracks = tracksFor(MENTOR_SCOPES), done = tracks.filter(track => progress.done.includes(track.id)).length;
  const next = suggestedTrack(progress, MENTOR_SCOPES);
  const resume = (id: TrackId) => update(current => current.active?.track === id ? setMinimised(current, false) : startTrack(current, id));
  return <section aria-labelledby="learn-heading" className={styles.learn}>
    <div className={styles.learnIntro}>
      <h2 id="learn-heading">Learn the Sweatbox</h2>
      <div className={styles.meter}><span>{done} of {tracks.length} done</span><span className={styles.bar} role="progressbar" aria-label="Tours completed" aria-valuemin={0} aria-valuemax={tracks.length} aria-valuenow={done}><span style={{width: `${Math.round(done / tracks.length * 100)}%`}}/></span></div>
      {next ? <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => resume(next)}>{progress.active?.track === next ? "Continue" : "Start"}: {trackById(next).title}</button> : <p className={styles.hint}>All done. Replay any tour from here or from Help on the radar.</p>}
    </div>
    <ul className={styles.tiles}>{tracks.map((track, index) => {
      const state = statusOf(progress, track.id);
      return <li key={track.id} className={`${styles.tile} ${styles[`tile_${state}`]}`}>
        <div className={styles.tileTop}><span className={styles.state} aria-hidden="true">{state === "done" ? <Check size={14} weight="bold"/> : index + 1}</span>{track.isNew ? <span className={styles.newTag}>New</span> : null}</div>
        <h3>{track.title}</h3><p>{track.summary}</p>
        <div className={styles.tileFoot}><small>{track.length} · {track.scope === "home" ? "Home" : "Radar"}</small>
          <button type="button" className={`${styles.btn} ${state === "now" ? styles.primary : state === "done" ? styles.quiet : ""}`} onClick={() => resume(track.id)}>{state === "done" ? "Replay" : state === "now" ? "Continue" : "Start"}<span className={styles.srOnly}> {track.title}</span></button></div>
      </li>;
    })}</ul>
    <WelcomeDialog accountId={accountId}/>
    <CoachTour accountId={accountId} scope="home"/>
  </section>;
}

const CONTROLS = [
  ["Select aircraft", "Click it on the scope or in the Aircraft list"],
  ["Taxi or push", "Flight › Plan on scope, drag the route, then Start Taxi or Start Pushback"],
  ["Stop planning", "Esc, or Cancel on the scope"],
  ["Flight plan", "Setup › Routes. Type fixes like TLA DCT GOW, drag to reorder"],
  ["Add aircraft", "Add, then click the scope where it should start"],
  ["Full stop all", "FS in the Aircraft list. Press again to cancel"],
] as const;

function HelpPanel({accountId, onClose}: {accountId: string; onClose: () => void}) {
  const [progress, update] = useTourProgress(accountId);
  const titleId = useId(), panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") {event.stopPropagation(); onClose();}};
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  const run = (id: TrackId) => {update(current => current.active?.track === id ? setMinimised(current, false) : startTrack(current, id)); onClose();};
  return createPortal(<div className={`${styles.tour} ${styles.live}`}>
    <aside ref={panel} tabIndex={-1} className={styles.help} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <header className={styles.head}><h2 id={titleId}>Help</h2><button type="button" className={`${styles.btn} ${styles.iconBtn} ${styles.quiet}`} aria-label="Close help" onClick={onClose}><X size={16} aria-hidden="true"/></button></header>
      <section aria-label="Tours on the radar"><h3>Tours on the radar</h3>
        <ul className={styles.helpList}>{tracksFor(["radar"]).map(track => {
          const state = statusOf(progress, track.id);
          return <li key={track.id}><span className={`${styles.chk} ${styles[state]}`} aria-hidden="true">{state === "done" ? <Check size={10} weight="bold"/> : null}</span>
            <span><strong>{track.title}{track.isNew && state !== "done" ? <span className={styles.newTag}>New</span> : null}</strong><small>{state === "now" ? `${(progress.active?.step ?? 0) + 1} of ${track.steps.length}` : `${track.length}${state === "done" ? " · done" : ""}`}</small></span>
            <button type="button" className={`${styles.btn} ${state === "now" ? styles.primary : ""}`} onClick={() => run(track.id)}>{state === "now" ? "Resume" : state === "done" ? "Replay" : "Start"}<span className={styles.srOnly}> {track.title}</span></button></li>;
        })}</ul>
      </section>
      <section aria-label="Controls at a glance"><h3>Controls at a glance</h3>
        <dl className={styles.controls}>{CONTROLS.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
      </section>
      <button type="button" className={styles.linkButton} onClick={() => update(resetProgress)}>Reset tour progress</button>
    </aside>
  </div>, document.body);
}

/**
 * Sessions page and Mentor radar entry point. On the radar (`live`) it is the Help button with the tours list,
 * and it starts Run the radar on a first visit. Elsewhere it starts the Home tour.
 */
export default function StaffTutorial({accountId, live = false, label, className}: {accountId: string; live?: boolean; label?: string; className?: string}) {
  const [progress, update] = useTourProgress(accountId);
  const [help, setHelp] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const fresh = live && WHATS_NEW.some(id => !progress.done.includes(id));
  useEffect(() => {
    const timer = window.setTimeout(() => {if (live) update(current => current.welcomed || current.active ? current : startTrack(current, "run-radar"));}, 0);
    return () => window.clearTimeout(timer);
  }, [live, update]);
  const closeHelp = useCallback(() => {setHelp(false); trigger.current?.focus();}, []);
  return <>
    <button ref={trigger} type="button" className={`${styles.trigger} ${className ?? (live ? styles.liveTrigger : "")}`} aria-expanded={live ? help : undefined}
      onClick={() => live ? setHelp(open => !open) : update(current => startTrack(current, "start-share"))}>
      {live ? <Question size={16} aria-hidden="true"/> : null}{label ?? (live ? "Help" : "Tutorial")}{fresh ? <span className={styles.newDot}><span className={styles.srOnly}> (new tours)</span></span> : null}
    </button>
    {help ? <HelpPanel accountId={accountId} onClose={closeHelp}/> : null}
    {!live ? <WelcomeDialog accountId={accountId}/> : null}
    <CoachTour accountId={accountId} scope={live ? "radar" : "home"} live={live}/>
  </>;
}
