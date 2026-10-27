"use client";
import {useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import Image from "next/image";
import Link from "next/link";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {CaretLeft} from "@phosphor-icons/react/dist/csr/CaretLeft";
import {CaretRight} from "@phosphor-icons/react/dist/csr/CaretRight";
import {ClockCounterClockwise} from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import {ClockClockwise} from "@phosphor-icons/react/dist/csr/ClockClockwise";
import {LinkSimple} from "@phosphor-icons/react/dist/csr/LinkSimple";
import {ChatCircleText} from "@phosphor-icons/react/dist/csr/ChatCircleText";
import DashboardThemeProvider from "../dashboard/theme/DashboardThemeProvider";
import SessionAccess from "./SessionAccess";
import LearningFrame from "../learning/LearningFrame";
import {sessionJson} from "./shared-transport";
import {canPlayReplay, ReplayTimeline, type ReplayDetail, type ReplayFrame} from "./replays";
import {timeLabel} from "./scenarios";
import {frequenciesFor, getAirport, trainingMode} from "./airports";
import {conflictLabels} from "./training-conflicts";
import {radioDisplayText} from "./radio-text";
import {adjacentMoment, currentMoment, replayMoments, type ReplayMoment} from "./replay-moments";
import {modeLabel} from "./session-status";
import type {Message} from "./model";
import {DemoSentCard} from "./DemoMirror";
import {replayDemoAt} from "./demonstration";
import Scope from "./Scope";
import {MessageLog} from "./MessagePanel";
import ReplayIndex from "./ReplayIndex";
import TrainerNotice from "./TrainerNotice";
import liveTheme from "./LiveTheme.module.css";
import styles from "./ReplayViewer.module.css";

const ended = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"});
const people = (detail: ReplayDetail, role: "staff" | "mentee") => detail.replay.participants.filter(p => p.role === role).map(p => p.name || p.accountId).join(", ");

export default function ReplayLibrary({id}: {id?: string}) {
  if (!id) return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo="/sweatbox/replays">{(_csrf, accountId) => <ReplayIndex accountId={accountId}/>}</SessionAccess></LearningFrame>;
  // Mentees may open a replay too; the server only returns ones they took part in.
  return <DashboardThemeProvider><div className={styles.theme}><SessionAccess embedded allowMentee role="mentee" returnTo={`/sweatbox/replays/${id}`}>
    {(csrf, accountId, access) => <ReplayViewer key={`${id}:${accountId}`} id={id} accountId={accountId} csrf={csrf} mentor={access.simulator}/>}
  </SessionAccess></div></DashboardThemeProvider>;
}

function ReplayViewer({id, accountId, mentor, csrf}: {id: string; accountId: string; mentor: boolean; csrf: string}) {
  const [detail, setDetail] = useState<ReplayDetail | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const back = mentor ? "/sweatbox/replays" : "/sweatbox/mentee/replays";
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        let after = 0, first: ReplayDetail | null = null; const frames: ReplayFrame[] = [];
        do {
          const page = await fetch(`/api/simulator/replays/${id}?after=${after}${mentor ? "" : "&scope=self"}`, {signal: controller.signal, cache: "no-store"}).then(sessionJson) as ReplayDetail;
          first ??= page; frames.push(...page.frames);
          if (page.next === null) break;
          if (page.next <= after) throw new Error("The replay could not be loaded. Try again.");
          after = page.next;
        } while (!controller.signal.aborted);
        if (!controller.signal.aborted && first) setDetail({...first, frames, next: null});
      } catch (reason) {if (!controller.signal.aborted) setError((reason as Error).message);}
    };
    void load(); return () => controller.abort();
  }, [id, retry, mentor]);
  const facts = detail ? [detail.replay.airport ?? "EGPH", modeLabel(detail.replay), people(detail, "staff") && `Mentor ${people(detail, "staff")}`, people(detail, "mentee") && `Mentee ${people(detail, "mentee")}`, `Ended ${ended.format(detail.replay.endedAt)} UTC`, "Read only"].filter(Boolean) : [];
  return <main className={styles.viewer}>
    <header className={styles.header}>
      <Link className={`${styles.btn} ${styles.quiet}`} href={back}><CaretLeft size={18} aria-hidden="true"/>{mentor ? "Replays" : "Your replays"}</Link>
      <Image className={styles.logo} src="/assets/logo-Czz1Kl8u.png" width={24} height={28} alt=""/>
      <div className={styles.title}><h1>{detail?.replay.title ?? "Session replay"}</h1>{detail ? <p>{facts.join(" · ")}</p> : null}</div>
    </header>
    {detail && mentor ? <FeedbackEditor detail={detail} csrf={csrf} onSaved={setDetail}/> : null}
    {error ? <div className={styles.message}><p role="alert">{error}</p><button className={styles.btn} onClick={() => {setError(""); setRetry(value => value + 1);}}>Try again</button></div>
      : detail ? <Playback key={detail.replay.id} detail={detail} accountId={accountId} mentor={mentor}/> : <p role="status" className={styles.message}>Loading recording…</p>}
    <footer className={styles.footer}><TrainerNotice/></footer>
  </main>;
}

function FeedbackEditor({detail, csrf, onSaved}: {detail: ReplayDetail; csrf: string; onSaved: (detail: ReplayDetail) => void}) {
  const [editing, setEditing] = useState(false), [position, setPosition] = useState(""), [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <section className={`${styles.feedback} ${styles.feedbackEditor}`}><h2>Update feedback</h2>{editing ? <form onSubmit={async event => {event.preventDefault(); setBusy(true); setError(""); try {const response = await fetch(`/api/simulator/replays/${detail.replay.id}`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify({expected: position ? detail.positionFeedback?.[position] ?? "" : detail.replay.feedback ?? "", feedback: draft, ...(position ? {positionId: position} : {})})}).then(sessionJson); onSaved(position ? {...detail, positionFeedback: {...detail.positionFeedback, [position]: response.feedback}} : {...detail, replay: {...detail.replay, feedback: response.feedback}}); setEditing(false);} catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}}}>
    <label>Feedback for <select value={position} onChange={event => {const id = event.target.value; setPosition(id); setDraft(id ? detail.positionFeedback?.[id] ?? "" : detail.replay.feedback ?? "");}}><option value="">All mentees</option>{(detail.feedbackPositions ?? detail.initial?.positions)?.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Feedback<textarea aria-label="Feedback" rows={6} maxLength={6000} value={draft} onChange={event => setDraft(event.target.value)}/></label>{error ? <p role="alert">{error}</p> : null}<div className={styles.feedbackActions}><button className={`${styles.btn} ${styles.primary}`} disabled={busy}>Save feedback</button><button type="button" className={styles.btn} disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
  </form> : <button type="button" className={styles.btn} onClick={() => {setPosition(""); setDraft(detail.replay.feedback ?? ""); setEditing(true);}}>Edit feedback</button>}</section>;
}

const markClass: Record<ReplayMoment["kind"], string> = {start: styles.kMeta, end: styles.kMeta, bookmark: styles.kBookmark, separation: styles.kSeparation, terrain: styles.kTerrain, collision: styles.kTerrain, demonstration: styles.kDemonstration};
type PanelTab = "moments" | "radio" | "atis";

function Playback({detail, accountId, mentor}: {detail: ReplayDetail; accountId: string; mentor: boolean}) {
  const {replay, initial, frames} = detail;
  const timeline = useMemo(() => initial ? new ReplayTimeline(initial, frames) : null, [initial, frames]);
  const playable = canPlayReplay(replay) && !!timeline;
  const [time, setTime] = useState(() => {
    // A shared link can open at a moment: ?t=seconds.
    const t = typeof window === "undefined" ? NaN : Number(new URLSearchParams(window.location.search).get("t"));
    return Number.isFinite(t) && t > 0 ? Math.min(t, Math.max(0, replay.duration)) : 0;
  });
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [tab, setTab] = useState<PanelTab>("moments");
  const [selected, setSelected] = useState<string | null>(null), [copied, setCopied] = useState("");
  const [moments, setMoments] = useState<ReplayMoment[] | null>(null);
  const position = useRef(time);
  useEffect(() => {
    // Separation checks walk every recorded state; run them after the first paint.
    const timer = window.setTimeout(() => setMoments(timeline && initial ? replayMoments(initial, frames, timeline.at(replay.duration), replay.duration) : []), 0);
    return () => window.clearTimeout(timer);
  }, [timeline, initial, frames, replay.duration]);
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
  const seek = (value: number, keepPlaying = false) => {if (!keepPlaying) setPlaying(false); position.current = Math.max(0, Math.min(replay.duration, value)); setTime(position.current);};
  const exercise = timeline?.at(time);
  const demoMarks = useMemo(() => frames.flatMap(frame => frame.delta.demo ?? []), [frames]);
  const demo = replayDemoAt(demoMarks, time);
  const list = moments ?? [];
  const active = currentMoment(list, time), previous = adjacentMoment(list, time, -1), next = adjacentMoment(list, time, 1);
  const incident = list.find(m => (m.kind === "separation" || m.kind === "terrain" || m.kind === "collision") && m.at <= time && time <= Math.max(m.end ?? m.at, m.at + 5));
  const radar = exercise ? trainingMode(exercise) : "local";
  const frequencies = exercise ? frequenciesFor(getAirport(exercise)) : null;
  const radio = exercise?.messages.slice(-60) ?? [];
  const copyLink = async () => {
    const url = new URL(window.location.href); url.searchParams.set("t", String(Math.floor(time)));
    try {await navigator.clipboard.writeText(url.href); setCopied(`Link at ${timeLabel(time)} copied.`);}
    catch {setCopied(url.href);}
  };
  const pct = (at: number) => `${replay.duration > 0 ? at / replay.duration * 100 : 0}%`;
  return <div className={styles.body}>
    <section className={styles.stage} aria-label="Session replay">
      <div className={styles.scope}>
        {exercise ? <div className={`${liveTheme.theme} ${styles.scopeInner}`}><Scope messages={exercise.messages} accountId={accountId} showProjectedPaths={false} elapsed={exercise.elapsed} weather={exercise.weather}
          conflictTags={mentor ? Object.fromEntries(exercise.aircraft.map(a => [a.id, conflictLabels(exercise.conflicts, a.id)])) : undefined}
          radarEnvironment={exercise.radarEnvironment} radarMode={radar === "local" ? undefined : radar} airport={getAirport(exercise)} aircraft={exercise.aircraft} running={false} frequency="all" selected={selected} onSelect={setSelected} demoPointer={demo.pointer} overlay={demo.sent ? <DemoSentCard sent={demo.sent}/> : undefined}/></div>
          : <p className={styles.scopeEmpty}>{replay.kind === "unavailable" ? "Only the session summary is available. Movement and radio messages were not recorded." : "No recorded state to show."}</p>}
        {incident ? <div className={styles.incident} role="status"><span className={`${styles.k} ${markClass[incident.kind]}`}/><span><strong>{incident.label}</strong> · {incident.detail} · {timeLabel(incident.at)}{incident.end !== undefined && incident.end > incident.at ? ` to ${timeLabel(incident.end)}` : ""}</span></div> : null}
      </div>
      {replay.kind === "snapshot" ? <p className={styles.note}>Only the final state is available for this older session.</p> : null}
      {replay.kind === "recording" && replay.duration <= 0 ? <p className={styles.note}>This session ended before any exercise time elapsed. You can review its saved state, but there is no playback.</p> : null}
      {replay.partial && replay.kind === "recording" ? <p className={styles.note}>Recording starts at exercise time {timeLabel(initial?.elapsed ?? 0)}.</p> : null}
      {playable ? <div className={styles.transport} role="group" aria-label="Replay playback">
        <div className={styles.track}>
          <div className={styles.marks} aria-hidden="true">{list.filter(m => m.kind !== "start" && m.kind !== "end").map(m => <i key={m.id} className={`${styles.mark} ${markClass[m.kind]}`} style={{left: pct(m.at)}}/>)}
            {list.filter(m => m.end !== undefined && m.end > m.at).map(m => <i key={`${m.id}:span`} className={`${styles.span} ${markClass[m.kind]}`} style={{left: pct(m.at), width: `calc(${pct(m.end! - m.at)} + 2px)`}}/>)}</div>
          <input aria-label="Replay position" aria-valuetext={`${timeLabel(time)} of ${timeLabel(replay.duration)}`} style={{"--replay-progress": pct(time)} as CSSProperties} type="range" min={0} max={replay.duration} step={.01} value={time} onChange={event => seek(Number(event.target.value))}/>
        </div>
        <div className={styles.controls}>
          <button className={`${styles.btn} ${styles.primary}`} aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => {if (time >= replay.duration) seek(0); setPlaying(!playing || time >= replay.duration);}}>{playing ? <Pause size={18} weight="fill" aria-hidden="true"/> : <Play size={18} weight="fill" aria-hidden="true"/>}{playing ? "Pause" : "Play"}</button>
          <button className={`${styles.btn} ${styles.icon}`} aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => seek(time - 10, playing)}><ClockCounterClockwise size={20} aria-hidden="true"/></button>
          <button className={`${styles.btn} ${styles.icon}`} aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => seek(time + 10, playing)}><ClockClockwise size={20} aria-hidden="true"/></button>
          <output className={styles.clock} aria-label="Replay time">{timeLabel(time)} <span>/ {timeLabel(replay.duration)}</span></output>
          <span className={styles.spacer}/>
          <button className={styles.btn} disabled={!previous} onClick={() => previous && seek(previous.at)}><CaretLeft size={16} aria-hidden="true"/>Previous moment</button>
          <button className={styles.btn} disabled={!next} onClick={() => next && seek(next.at)}>Next moment<CaretRight size={16} aria-hidden="true"/></button>
          <div className={styles.seg} role="group" aria-label="Playback speed">{[.5, 1, 2, 4].map(value => <button key={value} aria-label={`${value}× speed`} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
          <button className={`${styles.btn} ${styles.quiet}`} onClick={() => void copyLink()}><LinkSimple size={18} aria-hidden="true"/>Copy link at {timeLabel(time)}</button>
        </div>
        {copied ? <p className={styles.copied} role="status">{copied}</p> : null}
      </div> : null}
    </section>
    <aside className={styles.side} aria-label="Replay details">
      <section aria-labelledby="feedback-heading" className={styles.feedback}>
        <h2 id="feedback-heading"><ChatCircleText size={18} aria-hidden="true"/>Mentor feedback</h2>
        <p className={replay.feedback ? undefined : styles.muted}>{replay.feedback ?? "No general feedback was saved with this session."}</p>
        {Object.entries(detail.positionFeedback ?? {}).filter(([, text]) => text).map(([id, text]) => <p key={id}><strong>{detail.feedbackPositions?.find(p => p.id === id)?.name ?? id}</strong>: {text}</p>)}
      </section>
      <div className={styles.tabs} role="tablist" aria-label="Replay panel">{([["moments", "Key moments", moments ? list.length - 2 : null], ["radio", "Radio", exercise?.messages.length ?? 0], ["atis", "ATIS", null]] as const).map(([key, label, count]) =>
        <button key={key} role="tab" id={`replay-${key}-tab`} aria-controls="replay-panel" aria-selected={tab === key} onClick={() => setTab(key)}>{label}{count !== null ? <span> {count}</span> : null}</button>)}</div>
      <div id="replay-panel" role="tabpanel" aria-labelledby={`replay-${tab}-tab`} className={styles.panel} tabIndex={0}>
        {tab === "moments" ? moments === null ? <p className={styles.muted} role="status">Finding key moments…</p> : list.map(m => <button key={m.id} type="button" className={styles.moment} aria-current={active?.id === m.id || undefined} disabled={!playable} onClick={() => {seek(m.at); if (m.aircraftIds[0]) setSelected(m.aircraftIds[0]);}}>
          <span className={styles.momentTime}>{timeLabel(m.at)}</span><span className={`${styles.k} ${markClass[m.kind]}`}/><span><strong>{m.label}</strong><small>{m.detail}{m.end !== undefined && m.end > m.at ? ` · lasted ${Math.max(1, Math.round(m.end - m.at))} s` : ""}</small></span>
        </button>)
          : tab === "radio" ? exercise ? <div className={styles.fullLog}><MessageLog airport={getAirport(exercise)} messages={exercise.messages} frequency="all" title="Recorded radio messages"/></div> : <p className={styles.muted}>No radio messages were recorded.</p>
          : <p className={styles.atis}>{exercise?.publishedAtis && exercise.publishedAtis !== "ATIS UNAVAILABLE" ? exercise.publishedAtis : "No ATIS broadcast at this point."}</p>}
      </div>
      {tab !== "radio" ? <section aria-labelledby="radio-heading" className={styles.radio}>
        <div className={styles.radioHead}><h2 id="radio-heading">Radio log</h2><span>Follows playback</span></div>
        <RadioLog messages={radio} frequencies={frequencies} callsign={id => exercise?.aircraft.find(a => a.id === id)?.callsign ?? "Pilot"}/>
      </section> : null}
    </aside>
  </div>;
}

/** A small, auto-scrolling list of the transmissions up to the current replay time. */
function RadioLog({messages, frequencies, callsign}: {messages: Message[]; frequencies: ReturnType<typeof frequenciesFor> | null; callsign: (id: string) => string}) {
  const log = useRef<HTMLDivElement>(null), last = messages.at(-1)?.id;
  useEffect(() => {const element = log.current; if (element) element.scrollTop = element.scrollHeight;}, [last]);
  return <div ref={log} className={styles.radioLog} role="log" aria-label="Recorded radio messages">{messages.length ? messages.map((m, index) => <p key={m.id} data-latest={index === messages.length - 1 || undefined}>
    <time className={styles.mono} dateTime={new Date(m.time).toISOString()}>{new Date(m.time).toISOString().slice(11, 16)}</time>
    <span><strong className={m.sender === "controller" ? styles.atc : undefined}>{m.sender === "controller" ? frequencies?.[m.frequency]?.label ?? "ATC" : callsign(m.aircraftId)}</strong> {radioDisplayText(m.text)}{m.demonstrated ? <small> · Sent by mentor</small> : null}</span>
  </p>) : <p className={styles.muted}>Nothing said yet.</p>}</div>;
}
