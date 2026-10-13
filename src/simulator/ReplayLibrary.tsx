"use client";
import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import SessionAccess from "./SessionAccess";
import LearningFrame from "../learning/LearningFrame";
import TrainerNotice from "./TrainerNotice";
import {TrainingNav} from "./TrainingLibrary";
import {sessionJson} from "./shared-transport";
import {ReplayTimeline, type ReplayDetail, type ReplayFrame, type ReplaySummary} from "./replays";
import {timeLabel} from "./scenarios";
import {getAirport, environmentLabel, trainingMode} from "./airports";
import Scope from "./Scope";
import {MessageLog} from "./MessagePanel";
import legacyStyles from "./Training.module.css";
import libraryStyles from "./LibraryPages.module.css";
import replayStyles from "./Replays.module.css";

const date = (value: number) => new Intl.DateTimeFormat("en-GB", {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"}).format(value) + " UTC";
function People({replay, themed = false}: {replay: ReplaySummary; themed?: boolean}) {
  return <p className={themed ? libraryStyles.people : undefined}>{(["staff", "mentee"] as const).map(role => <span key={role}>{themed ? <small>{role === "staff" ? "Mentor" : "Mentee"}</small> : `${role === "staff" ? "Mentor" : "Mentee"}: `}{replay.participants.filter(p => p.role === role).map(p => p.name || p.accountId).join(", ") || "No participant recorded"}{!themed ? " · " : null}</span>)}</p>;
}
export default function ReplayLibrary({id}: {id?: string}) {
  const library = <SessionAccess embedded={!id} role="staff" returnTo={id ? `/simulator/replays/${id}` : "/simulator/replays"}>{() => <Library id={id}/>}</SessionAccess>;
  return id ? library : <LearningFrame product="Simulator">{library}</LearningFrame>;
}
function Library({id}: {id?: string}) {
  const styles = id ? legacyStyles : libraryStyles;
  const [replays, setReplays] = useState<ReplaySummary[]>([]), [next, setNext] = useState<number | null>(null);
  const [detail, setDetail] = useState<ReplayDetail | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        if (!id) {
          const data = await fetch(`/api/simulator/replays?offset=${offset}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson);
          if (!controller.signal.aborted) {setReplays(data.replays); setNext(data.next);}
        } else {
          let after = 0, first: ReplayDetail | null = null; const frames: ReplayFrame[] = [];
          do {
            const page = await fetch(`/api/simulator/replays/${id}?after=${after}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson) as ReplayDetail;
            first ??= page; frames.push(...page.frames);
            if (page.next === null) break;
            if (page.next <= after) throw new Error("The replay could not be loaded. Refresh to try again.");
            after = page.next;
          } while (!controller.signal.aborted);
          if (!controller.signal.aborted && first) setDetail({...first, frames, next: null});
        }
      } catch (reason) {if (!controller.signal.aborted) setError((reason as Error).message);}
      finally {if (!controller.signal.aborted) setLoading(false);}
    };
    void load(); return () => controller.abort();
  }, [id, offset]);
  return <main className={styles.library}>
    {id ? <><header className={legacyStyles.libraryHeader}><Link href="/dashboard">ATCMH / Simulator</Link><TrainingNav/></header><TrainerNotice/></> : <TrainingNav active="replays"/>}
    <div className={`${styles.libraryContent} ${id ? replayStyles.viewerContent : ""}`}>
      {id ? <Link href="/simulator/replays">← All replays</Link> : null}
      <div className={styles.heading}><div><h1>{detail?.replay.title ?? (id ? "Session replay" : "Replays")}</h1><p>Completed sessions stay saved permanently. Review aircraft movement, radio messages and ATIS without changing the session.</p></div></div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {loading ? <p role="status">Loading {id ? "recording" : "replays"}…</p> : detail ? <Playback key={detail.replay.id} detail={detail}/> : !id ? <>
        {replays.length ? <div className={styles.rows}>{replays.map(r => <article key={r.id}><div><Link href={`/simulator/replays/${r.id}`}><h2>{r.title}</h2></Link><People replay={r} themed/><p>{environmentLabel(r)} · {date(r.endedAt)} · {timeLabel(r.duration)} · {r.status}</p><small className={libraryStyles.status}>{r.kind === "recording" ? r.partial ? "Partial recording" : "Recorded session" : r.kind === "snapshot" ? "Final snapshot · Movement was not recorded" : "Summary only · Earlier details are unavailable"}</small></div><Link className={styles.primary} href={`/simulator/replays/${r.id}`}>{r.kind === "recording" ? "Watch replay" : "Review attempt"}</Link></article>)}</div> : <section className={styles.empty}><h2>No completed sessions yet</h2><p>Finish an attempt or end a session to save it here. Closing a page keeps the live session available under Sessions.</p></section>}
        <nav className={libraryStyles.pagination} aria-label="Replay pages"><button disabled={offset === 0} onClick={() => {setLoading(true); setError(""); setOffset(Math.max(0, offset - 50));}}>Previous</button><span>Page {Math.floor(offset / 50) + 1}</span><button disabled={next === null} onClick={() => {if (next !== null) {setLoading(true); setError(""); setOffset(next);}}}>Next</button></nav>
      </> : null}
      {!id ? <footer className={libraryStyles.libraryFooter}><TrainerNotice/><p>Completed sessions and previous attempts stay saved. Replays are read only.</p></footer> : null}
    </div>
  </main>;
}
function Playback({detail}: {detail: ReplayDetail}) {
  const {replay, initial, frames} = detail;
  const timeline = useMemo(() => initial ? new ReplayTimeline(initial, frames) : null, [initial, frames]);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const position = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!playing) return;
    let previous: number | null = null, request = 0;
    const tick = (now: number) => {
      const elapsed = previous === null ? 0 : (now - previous) / 1000; previous = now;
      position.current = Math.min(replay.duration, position.current + elapsed * speed); setTime(position.current);
      if (position.current >= replay.duration) {setPlaying(false); return;}
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick); return () => cancelAnimationFrame(request);
  }, [playing, speed, replay.duration]);
  const exercise = timeline?.at(time);
  return <section aria-label="Session replay" className={replayStyles.playback}>
    <People replay={replay}/><p>{date(replay.endedAt)} · {replay.status} · Read only</p>
    {replay.feedback ? <section className={replayStyles.atis}><h2>Instructor feedback</h2><p>{replay.feedback}</p></section> : null}
    {replay.partial ? <p className={replayStyles.note}>{replay.kind === "recording" ? `This recording starts ${timeLabel(initial?.elapsed ?? 0)} into the exercise. Earlier movement was not recorded.` : replay.kind === "snapshot" ? "Only the final snapshot survives for this older attempt. Playback was not recorded." : "Details for this older attempt were previously removed. Its assessment summary remains saved."}</p> : null}
    {replay.kind === "recording" && exercise ? <div className={replayStyles.controls}>
      <button disabled={replay.duration <= 0} onClick={() => {if (time >= replay.duration) {position.current = 0; setTime(0);} setPlaying(!playing || time >= replay.duration);}}>{playing && time < replay.duration ? "Pause" : "Play"}</button>
      <label className={replayStyles.seek}>Replay position<input aria-label="Replay position" type="range" min={0} max={Math.max(replay.duration, .01)} step={.01} value={time} onChange={e => {setPlaying(false); position.current = Number(e.target.value); setTime(position.current);}}/></label>
      <output aria-label="Replay time">{timeLabel(time)} / {timeLabel(replay.duration)}</output>
      <label>Speed<select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
    </div> : null}
    {exercise ? <><div className={replayStyles.workspace}><div className={replayStyles.scope}><Scope radarEnvironment={exercise.radarEnvironment} radarMode={trainingMode(exercise) === "local" ? undefined : trainingMode(exercise) as "approach" | "center"} airport={getAirport(exercise)} aircraft={exercise.aircraft} running={false} frequency="all" selected={selected} onSelect={setSelected}/></div><aside><MessageLog airport={getAirport(exercise)} messages={exercise.messages} frequency="all" title="Recorded radio messages"/></aside></div><section className={replayStyles.atis}><h2>Broadcast ATIS</h2><p>{exercise.publishedAtis || "No ATIS broadcast at this point."}</p></section></> : null}
  </section>;
}
