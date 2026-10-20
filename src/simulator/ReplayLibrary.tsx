"use client";
import {useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {ArrowCounterClockwise} from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import {LockSimple} from "@phosphor-icons/react/dist/csr/LockSimple";
import Link from "next/link";
import SessionAccess from "./SessionAccess";
import LearningFrame from "../learning/LearningFrame";
import LibraryFooter from "./LibraryFooter";
import {TrainingNav} from "./TrainingLibrary";
import {sessionJson} from "./shared-transport";
import {canPlayReplay, ReplayTimeline, type ReplayDetail, type ReplayFrame, type ReplaySummary} from "./replays";
import {timeLabel} from "./scenarios";
import {getAirport, trainingMode} from "./airports";
import Scope from "./Scope";
import {MessageLog} from "./MessagePanel";
import ReplayIndex from "./ReplayIndex";
import libraryStyles from "./LibraryPages.module.css";
import replayStyles from "./Replays.module.css";

const date = (value: number) => new Intl.DateTimeFormat("en-GB", {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"}).format(value) + " UTC";
function People({replay}: {replay: ReplaySummary}) {
  return <p className={libraryStyles.people}>{(["staff", "mentee"] as const).map(role => <span key={role}><small>{role === "staff" ? "Mentor" : "Mentee"}</small>{replay.participants.filter(p => p.role === role).map(p => p.name || p.accountId).join(", ") || "No participant recorded"}</span>)}</p>;
}
export default function ReplayLibrary({id}: {id?: string}) {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo={id ? `/sweatbox/replays/${id}` : "/sweatbox/replays"}>
    {() => id ? <ReplayViewer key={id} id={id}/> : <ReplayIndex/>}
  </SessionAccess></LearningFrame>;
}
function ReplayViewer({id}: {id: string}) {
  const [detail, setDetail] = useState<ReplayDetail | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        let after = 0, first: ReplayDetail | null = null; const frames: ReplayFrame[] = [];
        do {
          const page = await fetch(`/api/simulator/replays/${id}?after=${after}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson) as ReplayDetail;
          first ??= page; frames.push(...page.frames);
          if (page.next === null) break;
          if (page.next <= after) throw new Error("The replay could not be loaded. Try again.");
          after = page.next;
        } while (!controller.signal.aborted);
        if (!controller.signal.aborted && first) setDetail({...first, frames, next: null});
      } catch (reason) {if (!controller.signal.aborted) setError((reason as Error).message);}
    };
    void load(); return () => controller.abort();
  }, [id, retry]);
  return <main className={libraryStyles.library}>
    <TrainingNav active="replays"/>
    <div className={`${libraryStyles.libraryContent} ${replayStyles.viewerContent}`}>
      <Link href="/sweatbox/replays">← All replays</Link>
      <header className={replayStyles.viewerHeader}>
        <div><h1>{detail?.replay.title ?? "Session replay"}</h1>{detail ? <People replay={detail.replay}/> : null}</div>
        {detail ? <div className={replayStyles.recordMeta}><span><LockSimple size={14} aria-hidden="true"/>Read only</span><p>Session ended <time dateTime={new Date(detail.replay.endedAt).toISOString()}>{date(detail.replay.endedAt)}</time></p></div> : null}
      </header>
      {error ? <div><p role="alert" className={libraryStyles.error}>{error}</p><button onClick={() => {setError(""); setRetry(value => value + 1);}}>Try again</button></div>
        : detail ? <Playback key={detail.replay.id} detail={detail}/> : <p role="status">Loading recording…</p>}
      <LibraryFooter/>
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
  const bookmarks = useMemo(() => timeline?.at(replay.duration)?.bookmarks ?? [], [timeline, replay.duration]);
  return <section aria-label="Session replay" className={replayStyles.playback}>
    {replay.kind === "recording" && replay.duration <= 0 ? <p className={replayStyles.note}>This session ended before any exercise time elapsed. You can review its saved state, but there is no playback.</p> : null}
    {replay.kind === "snapshot" ? <p className={replayStyles.note}>Only the final state is available for this older session.</p> : replay.kind === "unavailable" ? <p className={replayStyles.note}>Only the session summary is available. Movement and radio messages were not recorded.</p> : null}
    {replay.feedback ? <section className={replayStyles.atis}><h2>Instructor feedback</h2><p>{replay.feedback}</p></section> : null}
    {replay.partial && replay.kind === "recording" ? <p className={replayStyles.note}>{`Recording starts at exercise time ${timeLabel(initial?.elapsed ?? 0)}.`}</p> : null}
    {canPlayReplay(replay) && exercise ? <div className={replayStyles.controls} role="group" aria-label="Replay playback">
      <div className={replayStyles.transport}>
        <button className={replayStyles.playButton} aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => {if (time >= replay.duration) {position.current = 0; setTime(0);} setPlaying(!playing || time >= replay.duration);}}>{playing ? <Pause size={20} weight="fill" aria-hidden="true"/> : <Play size={20} weight="fill" aria-hidden="true"/>}{playing ? "Pause" : "Play"}</button>
        <button className={replayStyles.restartButton} aria-label="Restart replay" title="Restart replay" onClick={() => {setPlaying(false); position.current = 0; setTime(0);}}><ArrowCounterClockwise size={20} aria-hidden="true"/></button>
      </div>
      <label className={replayStyles.seek}><span>Replay timeline<output aria-label="Replay time">{timeLabel(time)} <span>/ {timeLabel(replay.duration)}</span></output></span><input aria-label="Replay position" aria-valuetext={`${timeLabel(time)} of ${timeLabel(replay.duration)}`} style={{"--replay-progress": `${time / replay.duration * 100}%`} as CSSProperties} type="range" min={0} max={replay.duration} step={.01} value={time} onChange={e => {setPlaying(false); position.current = Number(e.target.value); setTime(position.current);}}/></label>
      <div className={replayStyles.speedControl}><span>Playback speed</span><div role="group" aria-label="Playback speed">{[.5, 1, 2, 4].map(value => <button key={value} aria-label={`${value}× speed`} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>
    </div> : null}
    {bookmarks.length ? <label>Replay bookmarks<select aria-label="Replay bookmarks" value="" onChange={event => {const bookmark = bookmarks.find(mark => mark.id === event.target.value); if (bookmark) {setPlaying(false); position.current = bookmark.elapsed; setTime(bookmark.elapsed);}}}><option value="">Jump to bookmark</option>{bookmarks.map(mark => <option key={mark.id} value={mark.id}>{timeLabel(mark.elapsed)} · {mark.label}</option>)}</select></label> : null}
    {exercise ? <div className={replayStyles.workspace}><div className={replayStyles.scope}><Scope showProjectedPaths={false} radarEnvironment={exercise.radarEnvironment} radarMode={trainingMode(exercise) === "local" ? undefined : trainingMode(exercise) as "approach" | "center"} airport={getAirport(exercise)} aircraft={exercise.aircraft} running={false} frequency="all" selected={selected} onSelect={setSelected}/></div><aside className={replayStyles.replaySidebar}><section className={replayStyles.broadcast}><h2>Broadcast ATIS</h2><p>{exercise.publishedAtis && exercise.publishedAtis !== "ATIS UNAVAILABLE" ? exercise.publishedAtis : "No ATIS broadcast at this point."}</p></section><MessageLog airport={getAirport(exercise)} messages={exercise.messages} frequency="all" title="Recorded radio messages"/></aside></div> : null}
  </section>;
}
