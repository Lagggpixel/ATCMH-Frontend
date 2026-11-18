
"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {getAirport, trainingMode} from "./airports";
import {EndlessBriefing} from "./EndlessStudio";
import {endlessEndpoint} from "./endless/client";
import type {EndlessEvent, EndlessReport} from "./endless/runtime";
import type {Exercise} from "./model";
import {ReplayTimeline, type ReplayFrame} from "./replays";
import Scope from "./Scope";
import SessionAccess from "./SessionAccess";
import {sessionJson} from "./shared-transport";
import styles from "./EndlessStudio.module.css";

interface Window {initial: Exercise; frames: ReplayFrame[]; from: number; until: number}
interface Review {report: EndlessReport; events: EndlessEvent[]}
const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map((part, i) => i ? String(part).padStart(2, "0") : part).join(":");
};
export default function EndlessReplay({id, home}: {id: string; home: string}) {
  return <SessionAccess role="staff" returnTo={`${home}/replays/${id}`}>{(_csrf, accountId) =>
    <Replay id={id} home={home} accountId={accountId}/>}</SessionAccess>;
}
function Replay({id, home, accountId}: {id: string; home: string; accountId: string}) {
  const [review, setReview] = useState<Review>();
  const [window, setWindow] = useState<Window>();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
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
  return <main className={styles.page}>
    <header className={styles.header}><Link href={home}>Endless practice</Link><h1>{score?.definition.title ?? "Endless replay"}</h1></header>
    {problem ? <section><p role="alert" className={styles.error}>{problem}</p><button onClick={() => {setProblem(""); setRetry(value => value + 1);}}>Try again</button></section> : null}
    {score ? <section aria-label="Run summary">
      <h2>Run summary</h2><p className={styles.score}>{score.score === null ? "No score" : `${score.score} / 100`}</p>
      <dl className={styles.metrics}>{([
        ["Released", score.released], ["Completed", score.completed], ["Unfinished", score.unfinished],
        ["Unresolved exits", score.unresolved], ["Skipped releases", score.skipped], ["Separation incidents", score.separation],
        ["Runway conflicts", score.runway], ["Collisions", score.collisions], ["Terrain impacts", score.terrain],
      ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <details><summary>Operational briefing and scoring rules</summary><EndlessBriefing definition={score.definition}/>
        <p>Safety starts at 75 points. Each loss of separation costs 10 points and each runway conflict costs 15. Completed operations earn up to 25 points. A collision or terrain impact caps the score at 49.</p>
      </details>
    </section> : null}
    <section aria-label="Replay timeline">
      <div className={styles.scope}>{exercise ? <Scope endless elapsed={exercise.elapsed} accountId={accountId} airport={getAirport(exercise)}
        radarEnvironment={exercise.radarEnvironment} radarMode={radarMode === "local" ? undefined : radarMode}
        aircraft={exercise.aircraft} messages={exercise.messages} running={false} frequency="all" selected={selected} onSelect={setSelected}
        showProjectedPaths={false}/> : <p role="status">Loading this part of the replay…</p>}</div>
      <div className={styles.seek}>
        <button type="button" disabled={duration <= 0} onClick={() => {
          if (playing && time < duration) setPlaying(false);
          else {if (time >= duration) seek(0); setPlaying(true);}
        }}>{playing && time < duration ? "Pause" : "Play"}</button>
        <label>Playback time <input type="range" min={0} max={duration} step="any" value={time} disabled={duration <= 0}
          onChange={event => {setPlaying(false); seek(Number(event.target.value));}}/></label>
        <time>{clock(time)} / {clock(duration)}</time>
      </div>
      {selectedAircraft ? <div>
        <h3>{selectedAircraft.callsign}</h3>
        <p>{selectedAircraft.flightPlan.length ? selectedAircraft.flightPlan.map(fix => fix.name).join(" → ") : "No filed route"}</p>
        <ol>{exercise?.messages.filter(message => message.aircraftId === selectedAircraft.id).slice(-6).map(message => <li key={message.id}>{message.text}</li>)}</ol>
      </div> : null}
      <h2>Debrief moments</h2>
      {events.length ? <ul className={styles.events}>{events.map(event => <li key={event.ordinal}><button type="button" onClick={() => {
        setPlaying(false); seek(event.at, event.aircraftId);
      }}>{clock(event.at)} · {event.label}{event.issue ? ` · ${event.issue}` : ""}</button></li>)}</ul>
        : <p>No incidents or injected issues in this part of the replay.</p>}
    </section>
  </main>;
}
