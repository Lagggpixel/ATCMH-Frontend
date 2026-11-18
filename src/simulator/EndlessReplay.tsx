
"use client";

import Link from "next/link";
import {useEffect, useMemo, useRef, useState} from "react";
import {ArrowCounterClockwise} from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import {CaretLeft} from "@phosphor-icons/react/dist/csr/CaretLeft";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {SkipBack} from "@phosphor-icons/react/dist/csr/SkipBack";
import {SkipForward} from "@phosphor-icons/react/dist/csr/SkipForward";
import LearningFrame from "../learning/LearningFrame";
import {getAirport, trainingMode} from "./airports";
import {modeLabels, scoreTone} from "./EndlessStudio";
import {endlessEndpoint} from "./endless/client";
import type {EndlessEvent, EndlessReport} from "./endless/runtime";
import type {Exercise} from "./model";
import {ReplayTimeline, type ReplayFrame} from "./replays";
import Scope from "./Scope";
import SessionAccess from "./SessionAccess";
import {sessionJson} from "./shared-transport";
import styles from "./EndlessStudio.module.css";
import ui from "./Sweatbox.module.css";

interface Window {initial: Exercise; frames: ReplayFrame[]; from: number; until: number}
interface Review {report: EndlessReport; events: EndlessEvent[]}
const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map((part, i) => i ? String(part).padStart(2, "0") : part).join(":");
};
const momentClass = (event: EndlessEvent) => event.issue ? styles.mIssue : ({
  separation: styles.mSeparation, runway: styles.mRunway, collision: styles.mCollision, terrain: styles.mTerrain, unresolved: styles.mExit, skipped: styles.mSkipped,
} as Partial<Record<EndlessEvent["kind"], string>>)[event.kind] ?? styles.mExit;
const momentTitle = (event: EndlessEvent) => event.issue ? `Inbound issue: ${event.issue.toLowerCase()}` : ({
  separation: "Loss of separation", runway: "Runway conflict", collision: "Collision", terrain: "Terrain impact", unresolved: "Left your airspace unresolved", skipped: "Release skipped",
} as Partial<Record<EndlessEvent["kind"], string>>)[event.kind] ?? event.label;
const verdict = (score: number | null) => score === null ? "No score" : score >= 90 ? "Excellent run" : score >= 80 ? "Solid run" : score >= 50 ? "Room to improve" : "Tough run";

export default function EndlessReplay({id, home}: {id: string; home: string}) {
  return <LearningFrame product="Sweatbox">
    <SessionAccess embedded role="staff" returnTo={`${home}/replays/${id}`}>{(_csrf, accountId) =>
      <Replay id={id} home={home} accountId={accountId}/>}</SessionAccess>
  </LearningFrame>;
}
function Replay({id, home, accountId}: {id: string; home: string; accountId: string}) {
  const player = useRef<HTMLElement>(null);
  const [review, setReview] = useState<Review>();
  const [window, setWindow] = useState<Window>();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState("");
  const [retry, setRetry] = useState(0);
  const [requestedWindow, requestWindow] = useState(0);
  const base = `${endlessEndpoint}?replay=${encodeURIComponent(id)}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(base, {signal: controller.signal, cache: "no-store"}).then(sessionJson)
      .then((result: {review?: Review; duration: number}) => {if (!controller.signal.aborted) {setReview(result.review); setDuration(result.duration);}})
      .catch(error => {if (!controller.signal.aborted) setProblem(error.message);});
    return () => controller.abort();
  }, [base, retry]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${base}&at=${requestedWindow}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson)
      .then((result: {window: Window}) => {if (!controller.signal.aborted) setWindow(result.window);})
      .catch(error => {if (!controller.signal.aborted) setProblem(error.message);});
    return () => controller.abort();
  }, [base, requestedWindow, retry]);
  const timeline = useMemo(() => window ? new ReplayTimeline(window.initial, window.frames, window.from) : undefined, [window]);
  const exercise = window && time >= window.from && time <= window.until + .001 ? timeline?.at(time) : undefined;
  const coverage = window?.until ?? 0;

  useEffect(() => {
    if (!playing || !window || problem || time >= duration) return;
    const interval = setTimeout(() => {
      const next = Math.min(duration, time + .25);
      if (next > coverage + .001) {requestWindow(next); return;}
      setTime(next);
    }, 250);
    return () => clearTimeout(interval);
  }, [playing, window, problem, time, duration, coverage]);

  function seek(value: number, aircraftId?: string) {
    setTime(value);
    if (!window || value < window.from || value > window.until + .001) requestWindow(value);
    if (aircraftId) setSelected(aircraftId);
  }
  const score = review?.report;
  const selectedAircraft = exercise?.aircraft.find(aircraft => aircraft.id === selected);
  const radarMode = exercise ? trainingMode(exercise) : "local";
  const recent = window?.frames.flatMap(frame => frame.delta.endless ?? []) ?? [];
  const events = [...new Map([...(review?.events ?? []), ...recent].map(event => [event.ordinal, event])).values()]
    .filter(event => event.issue || !["release", "complete", "transfer"].includes(event.kind))
    .sort((a, b) => a.at - b.at);
  const current = [...events].reverse().find(event => event.at <= time + .5);
  const jump = (event: EndlessEvent | undefined) => {
    if (!event) return;
    setPlaying(false); seek(event.at, event.aircraftId);
    player.current?.focus({preventScroll: true});
    player.current?.scrollIntoView({block: "start"});
  };
  const copyLink = async () => {
    try {await navigator.clipboard.writeText(globalThis.window.location.href); setCopied("Link copied.");}
    catch {setCopied("Copy the address from your browser.");}
  };
  const safety = score ? Math.max(0, 75 - 10 * score.separation - 15 * score.runway) : 0;
  const completion = score?.released ? Math.round(25 * score.completed / score.released) : 0;
  const penalties = score ? [score.separation ? `${score.separation} loss${score.separation === 1 ? "" : "es"} of separation, −${10 * score.separation}` : "", score.runway ? `${score.runway} runway conflict${score.runway === 1 ? "" : "s"}, −${15 * score.runway}` : ""].filter(Boolean).join(" · ") || "no penalties" : "";
  const value = (count: number) => count ? <b className={styles.poor}>{count}</b> : <b className={styles.good}>None</b>;
  const ring = 2 * Math.PI * 50;

  return <div className={`${ui.page} ${styles.page}`}><main className={`${ui.content} ${styles.viewer}`}>
    <header className={styles.resultsHead}>
      <Link className={ui.btn} href={`${home}?view=replays`}><CaretLeft size={16} aria-hidden="true"/>Past runs</Link>
      <div>
        <h1>{score?.definition.title ?? "Endless replay"}</h1>
        <p>{score ? `${score.definition.airport} · ${modeLabels[score.definition.mode]} · ` : ""}{clock(duration)} long · read only</p>
      </div>
      <button className={ui.btn} type="button" onClick={() => void copyLink()}>Copy link</button>
      <Link className={`${ui.btn} ${ui.primary}`} href={home}><ArrowCounterClockwise size={16} aria-hidden="true"/>Practise again</Link>
    </header>
    {copied ? <p role="status" className={styles.muted} style={{margin: 0}}>{copied}</p> : null}
    {problem ? <section className={styles.card}><p role="alert" className={styles.error}>{problem}</p><p><button className={ui.btn} type="button" onClick={() => {setProblem(""); setRetry(value => value + 1);}}>Try again</button></p></section> : null}

    {score ? <>
      <section className={styles.scoreCard} aria-label="Score">
        <div className={styles.ring}>
          <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={score.score === null ? "No score" : `Score ${score.score} out of 100`}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--dashboard-inset)" strokeWidth="12"/>
            {score.score !== null ? <circle cx="60" cy="60" r="50" fill="none" className={styles[scoreTone(score.score)]} stroke="currentColor" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${ring * score.score / 100} ${ring}`} transform="rotate(-90 60 60)"/> : null}
            <text x="60" y="66" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--dashboard-ink)">{score.score ?? "—"}</text>
            <text x="60" y="86" textAnchor="middle" fontSize="12" fill="var(--dashboard-muted)">of 100</text>
          </svg>
          <div><strong>{verdict(score.score)}</strong><span>{score.score === null ? "No aircraft were released." : score.collisions || score.terrain ? "Capped at 49 by a collision or terrain impact." : ""}</span></div>
        </div>
        {score.released ? <div className={styles.bars}>
          <div className={styles.bar}>
            <div><strong>Safety</strong><span><b>{safety}</b> <span className={styles.muted}>of 75 · {penalties}</span></span></div>
            <div className={styles.track} aria-hidden="true"><span className={styles.safe} style={{width: `${safety / 75 * 100}%`}}/><span className={styles.lost} style={{width: `${(75 - safety) / 75 * 100}%`}}/></div>
          </div>
          <div className={styles.bar}>
            <div><strong>Completion</strong><span><b>{completion}</b> <span className={styles.muted}>of 25 · {score.completed} of {score.released} aircraft finished</span></span></div>
            <div className={styles.track} aria-hidden="true"><span className={styles.done} style={{width: `${completion / 25 * 100}%`}}/></div>
          </div>
          <p>A collision or terrain impact caps the score at 49.</p>
        </div> : null}
      </section>
      <dl className={styles.stats}>
        <div><dt>Safety</dt>
          <dd>Loss of separation {value(score.separation)}</dd><dd>Runway conflicts {value(score.runway)}</dd>
          <dd>Collisions {value(score.collisions)}</dd><dd>Terrain impacts {value(score.terrain)}</dd></div>
        <div><dt>Traffic</dt>
          <dd>Released <b>{score.released}</b></dd><dd>Finished <b>{score.completed}</b></dd><dd>Still with you <b>{score.unfinished}</b></dd>
          <dd>Left your airspace <b>{score.unresolved}</b></dd><dd>Skipped <b>{score.skipped}</b></dd></div>
      </dl>
    </> : null}

    <section ref={player} tabIndex={-1} aria-label="Replay" className={styles.replay}>
      <div className={styles.player}>
        <div className={styles.scope}>
          <span className={styles.readOnly}>Read only · {clock(time)}</span>
          {exercise ? <Scope endless elapsed={exercise.elapsed} accountId={accountId} airport={getAirport(exercise)}
            radarEnvironment={exercise.radarEnvironment} radarMode={radarMode === "local" ? undefined : radarMode}
            aircraft={exercise.aircraft} messages={exercise.messages} running={false} frequency="all" selected={selected} onSelect={setSelected}
            showProjectedPaths={false}/> : <p role="status">Loading this part of the replay…</p>}
        </div>
        <div className={styles.seek}>
          <button className={`${ui.btn} ${ui.primary} ${styles.round}`} type="button" disabled={duration <= 0} aria-label={playing && time < duration ? "Pause" : "Play"} onClick={() => {
            if (playing && time < duration) setPlaying(false);
            else {if (time >= duration) seek(0); setPlaying(true);}
          }}>{playing && time < duration ? <Pause size={18} weight="fill" aria-hidden="true"/> : <Play size={18} weight="fill" aria-hidden="true"/>}</button>
          <button className={`${ui.btn} ${styles.square}`} type="button" aria-label="Previous moment" disabled={!events.some(event => event.at < time - 1)}
            onClick={() => jump([...events].reverse().find(event => event.at < time - 1))}><SkipBack size={16} aria-hidden="true"/></button>
          <button className={`${ui.btn} ${styles.square}`} type="button" aria-label="Next moment" disabled={!events.some(event => event.at > time + 1)}
            onClick={() => jump(events.find(event => event.at > time + 1))}><SkipForward size={16} aria-hidden="true"/></button>
          <div className={styles.scrub}>
            {duration > 0 ? events.map(event => <span key={event.ordinal} className={`${styles.tick} ${momentClass(event)}`} style={{left: `${event.at / duration * 100}%`, background: "var(--moment)"}}/>) : null}
            <input aria-label="Playback time" type="range" min={0} max={duration} step="any" value={time} disabled={duration <= 0}
              onChange={event => {setPlaying(false); seek(Number(event.target.value));}}/>
          </div>
          <time>{clock(time)} / {clock(duration)}</time>
        </div>
      </div>
      <aside className={styles.moments} aria-labelledby="endless-moments">
        <div className={styles.momentsHead}><h2 id="endless-moments">Debrief moments</h2><span>{events.length}</span></div>
        {events.length ? <ol className={styles.momentList}>{events.map(event => <li key={event.ordinal}>
          <button type="button" className={momentClass(event)} aria-current={current?.ordinal === event.ordinal || undefined} onClick={() => jump(event)}>
            <span aria-hidden="true"/>
            <span><strong>{momentTitle(event)}</strong><small>{event.label}</small></span>
            <time>{clock(event.at)}</time>
          </button>
        </li>)}</ol> : <p className={styles.noMoments}>No incidents or inbound issues in this run.</p>}
        {selectedAircraft ? <div className={styles.selected} aria-label="Selected aircraft">
          <strong>{selectedAircraft.callsign}</strong>
          <span className={styles.muted}>{selectedAircraft.flightPlan.length ? selectedAircraft.flightPlan.map(fix => fix.name).join(" → ") : "No filed route"}</span>
          <ol>{exercise?.messages.filter(message => message.aircraftId === selectedAircraft.id).slice(-4).map(message => <li key={message.id}>{message.text}</li>)}</ol>
        </div> : null}
      </aside>
    </section>

    {score ? <details className={styles.details}>
      <summary>Briefing for this run</summary>
      <p>{score.definition.briefing}</p>
      <ul className={styles.muted}>{score.definition.streams.filter(stream => stream.rate > 0).map((stream, i) =>
        <li key={i}>{stream.name} · {stream.origin} → {stream.destination} · RWY {stream.runway} · {stream.rate}/hour</li>)}</ul>
    </details> : null}
  </main></div>;
}
