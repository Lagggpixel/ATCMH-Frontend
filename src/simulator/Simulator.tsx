"use client";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import Link from "next/link";
import {CONTEXT_ACTIONS, type ContextAction} from "./catalog";
import {getAirport, frequenciesFor, simulatedMetar, openingFrequency, controlledFrequencies, trainingMode} from "./airports";
import RadarQuickPopup from "./RadarQuickPopup";
import {airborne} from "./radar";
import {frequencyPendingRequests, pendingPilotMessage, stripRunway, unreadMessages, type Action, type Aircraft, type Frequency, type Point} from "./model";
import {SharedSession} from "./shared-transport";
import SessionAccess, {SessionNotice} from "./SessionAccess";
import {sessionCode, sessionPath, type SessionRole} from "./sessions";
import LiveScenarioPanel from "./LiveScenarioPanel";
import {trainingRequest} from "./TrainingLibrary";
import Scope from "./Scope";
import StaffPanel, {StaffToolbar, TrafficRoster} from "./StaffPanel";
import AtisPanel from "./AtisPanel";
import MessagePanel, {MessageLog} from "./MessagePanel";
import RadioAudio from "./RadioAudio";
import AircraftContextMenu from "./AircraftContextMenu";
import styles from "./Simulator.module.css";

export default function Simulator({role, sessionId}: {role: SessionRole; sessionId: string}) {
  return <SessionAccess role={role} returnTo={sessionPath(role, sessionId)}>{(csrf, accountId) => <SimulatorSession key={`${role}:${sessionId}:${accountId}`} role={role} sessionId={sessionId} csrf={csrf} accountId={accountId}/>}</SessionAccess>;
}
function SimulatorSession({role, sessionId, csrf, accountId}: {role: SessionRole; sessionId: string; csrf: string; accountId: string}) {
  const [transport] = useState(() => new SharedSession(role, sessionId, csrf));
  const view = useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getServerSnapshot);
  const [chosenFrequency, setFrequency] = useState<Frequency | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vectorHeading, setVectorHeading] = useState<number>();
  const [vectorAnchor, setVectorAnchor] = useState<Point>();
  const [quickHidden, setQuickHidden] = useState(false);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [utility, setUtility] = useState<ContextAction | null>(null);
  const [editMode, setEditMode] = useState("");
  const [holdPoint, setHoldPoint] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [trainingError, setTrainingError] = useState("");
  const [split, setSplit] = useState(76);
  const {exercise} = view;
  const AIRPORT = getAirport(exercise), FREQUENCIES = frequenciesFor(AIRPORT), METAR = simulatedMetar(AIRPORT);
  const mode = trainingMode(exercise);
  const frequency = chosenFrequency ?? openingFrequency(exercise);
  const selected = exercise.aircraft.find(a => a.id === selectedId);
  const messaging = exercise.aircraft.find(a => a.id === messageId);
  const dispatch = transport.dispatch;
  const paused = role === "mentee" && Boolean(exercise.pausedByStaff);
  const pauseTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => transport.start(), [transport]);
  useEffect(() => transport.subscribe(() => {
    const current = transport.getSnapshot();
    if (!current.connected || role === "mentee" && current.exercise.pausedByStaff) {setVectorHeading(undefined); setQuickHidden(true);}
  }), [transport, role]);
  useEffect(() => {
    if (!paused) return;
    const previous = document.activeElement;
    pauseTitle.current?.focus();
    return () => {if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};
  }, [paused]);
  const frequencyPending = frequencyPendingRequests(exercise);
  const pendingAircraft = exercise.aircraft.filter(a => a.frequency && pendingPilotMessage(exercise, a.id, a.frequency)).map(a => a.id);
  const giveWayTargets = role === "staff" ? [
    ...exercise.aircraft.flatMap(a => a.giveWay ? [a.giveWay.aircraftId] : []),
    ...exercise.messages.flatMap(m => m.sender === "controller" && !m.retractedBy && m.instruction?.type === "give-way" && m.instruction.aircraftId && now !== null && now - m.time < 30_000 ? [m.instruction.aircraftId] : []),
  ] : [];
  const unread = messaging ? unreadMessages(exercise, messaging.id, frequency) : 0;
  useEffect(() => {
    if (messageId && unread && view.connected && !paused) dispatch({kind: "read", aircraftId: messageId, frequency});
  }, [messageId, unread, frequency, view.connected, paused, dispatch]);
  useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer);}, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") {setMessageId(null); setUtility(null); setSelectedId(null); setEditMode("");}};
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, []);
  const openMessages = (a: Aircraft) => {setSelectedId(a.id); setMessageId(a.id); setUtility(null); dispatch({kind: "read", aircraftId: a.id, frequency});};
  const select = (id: string | null) => {setVectorHeading(undefined); setQuickHidden(false); setEditMode(""); setSelectedId(id); setUtility(null); if (id !== messageId) setMessageId(null);};
  const contextAction = (action: ContextAction, a: Aircraft) => {
    if (action === "messages") openMessages(a);
    else if (action === "remove-reminder") dispatch({kind: "edit", aircraftId: a.id, patch: {reminderAt: null}});
    else setUtility(action);
  };
  const point = (p: Point) => {
    if (!selected || role !== "staff" || editMode === "taxi-preview") return;
    const patch: Partial<Aircraft> = editMode === "position" ? {position: p} : editMode === "taxi" ? {taxiPath: [...selected.taxiPath, {...p, hold: holdPoint}]} : {flightPlan: [...selected.flightPlan, p]};
    dispatch({kind: "edit", aircraftId: selected.id, patch}); if (editMode === "position") setEditMode("");
  };
  const context = (a: Aircraft) => messageId || role === "staff" ? null : mode !== "local" && a.frequency === frequency && airborne(a, AIRPORT) && !a.radar?.transferred ? quickHidden || !view.connected ? null : <RadarQuickPopup key={`${a.id}:${vectorHeading ?? "click"}`} aircraft={a} exercise={exercise} frequency={frequency} heading={vectorHeading} connected={view.connected} dispatch={dispatch} onMessages={() => openMessages(a)} onSent={() => {setQuickHidden(true); setVectorHeading(undefined);}}/> : <AircraftContextMenu key={a.id} aircraft={a} frequency={frequency} elapsed={exercise.elapsed} connected={view.connected} dispatch={dispatch} onAction={action => contextAction(action, a)} onClose={() => select(null)}/>;
  const elapsed = `${String(Math.floor(exercise.elapsed / 60)).padStart(2, "0")}:${String(Math.floor(exercise.elapsed % 60)).padStart(2, "0")}`;
  if (view.fatal) return <SessionNotice title={view.code === "seat-occupied" ? `${role === "staff" ? "Control" : "Mentee"} page already in use` : view.code === "not-found" ? "Session unavailable" : "Could not join session"}><p>{view.fatal}</p><p>Session {sessionCode(sessionId, exercise.airport)}</p><button onClick={() => window.location.reload()}>Try again</button><Link href="/simulator/staff">Return to sessions</Link></SessionNotice>;
  if (!view.session) return <SessionNotice title={view.status}><Link href={`/simulator/${role}`}>Return to {role === "staff" ? "sessions" : "session entry"}</Link></SessionNotice>;
  return <main className={`${styles.simulator} ${role === "staff" ? styles.staffSimulator : styles.menteeSimulator}`}>
    <div className={styles.exerciseContents} inert={paused} aria-hidden={paused || undefined}>
    {role === "staff" ? <><StaffToolbar sessionId={sessionId} sessionTitle={view.session.title} exercise={exercise} dispatch={dispatch} owner={view.owner} status={view.status} audio={<RadioAudio accountId={accountId} role={role} exercise={exercise} connected={view.connected} scope="all"/>} onReset={() => {select(null); setEditMode("");}} scenario={!!view.scenario} onRestart={() => void trainingRequest(csrf, `attempts/${sessionId}`, {action: "restart", attemptId: view.scenario?.attemptId}).catch(e => setTrainingError(e.message))} extra={<LiveScenarioPanel sessionId={sessionId} csrf={csrf} scenario={view.scenario} elapsed={exercise.elapsed} running={exercise.running} connected={view.connected} onEvent={transport.scenarioEvent}/>}/><TrafficRoster exercise={exercise} selected={selected} onSelect={select} dispatch={dispatch} owner={view.owner}/></> : <><nav className={styles.sidebar} aria-label="Simulator frequencies"><div className={styles.trainerBrand}><strong>ATCMH</strong><span>ATC Trainer</span></div>{controlledFrequencies(exercise).map(key => <button key={key} aria-pressed={frequency === key} className={`${frequency === key ? styles.activeFrequency : ""} ${frequencyPending[key] ? styles.pendingRequest : ""}`} onClick={() => {setFrequency(key); setMessageId(null); setSelectedId(null); setVectorHeading(undefined); setQuickHidden(false);}}><span>{AIRPORT.icao} {FREQUENCIES[key].label}</span><span className={styles.frequencyValue}>{FREQUENCIES[key].value}{frequencyPending[key] ? ` (${frequencyPending[key]})` : ""}</span></button>)}<Link href="/simulator/staff" className={styles.exit}>Leave</Link></nav>
    <header className={styles.topBanner}><span>{METAR}<small>Simulation only · <a href="/simulator/about" target="_blank" rel="noreferrer">About & sources</a></small></span><RadioAudio accountId={accountId} role={role} exercise={exercise} connected={view.connected} paused={paused} scope={frequency}/><span>UTC {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"}Z · Exercise {elapsed}</span></header></>}
    {frequency === "atis" && role === "mentee" ? <AtisPanel exercise={exercise} dispatch={dispatch} connected={view.connected}/> : <>
      <Scope key={`${AIRPORT.icao}:${mode}`} airport={AIRPORT} radarEnvironment={exercise.radarEnvironment} radarMode={mode === "local" ? undefined : mode} onVector={role === "mentee" && mode !== "local" && view.connected && !paused ? (id, heading, release) => {select(id); setVectorHeading(heading); setVectorAnchor(release);} : undefined} contextPoint={vectorHeading === undefined ? undefined : vectorAnchor} onTagAngle={view.connected && !paused && (role === "mentee" || view.owner) ? (id, angle) => void dispatch({kind: "edit", aircraftId: id, patch: {tagAngle: angle}}) : undefined} pendingAircraft={pendingAircraft} autoReadback={exercise.autoReadback} running={exercise.running} aircraft={exercise.aircraft} frequency={role === "staff" ? "all" : frequency} giveWayTargets={giveWayTargets} selected={selected?.id ?? null} onSelect={select} onPoint={point} onTaxiPathEdit={role === "staff" && view.owner ? (aircraftId, path, edit) => dispatch({kind: "taxi-path", aircraftId, path, edit}) : undefined} editMode={role === "staff" && view.owner ? editMode : ""} context={context}/>
      {role === "staff" ? <StaffPanel exercise={exercise} selected={selected} dispatch={dispatch} onSelect={select} editMode={editMode} onEditMode={setEditMode} holdPoint={holdPoint} onHoldPoint={setHoldPoint} owner={view.owner} status={view.status}/> : <aside className={styles.rightPanel} style={{gridTemplateRows: `${split}% 8px 1fr`}} aria-label="Flight strips and messages" inert={Boolean(messaging)} aria-hidden={Boolean(messaging) || undefined}>
        <div className={styles.strips} aria-label="Flight strips"><header className={styles.stripsHeader}><h2>{FREQUENCIES[frequency].label} traffic</h2><span>{exercise.aircraft.filter(a => a.frequency === frequency).length}</span></header>{exercise.aircraft.filter(a => a.frequency === frequency).map(a => {
          const pending = pendingAircraft.includes(a.id) ? 1 : 0;
          return <div key={a.id} className={`${styles.strip} ${selectedId === a.id ? styles.selectedStrip : ""} ${a.reminderAt !== null && a.reminderAt <= exercise.elapsed ? styles.reminder : ""}`}><button className={styles.stripBody} onClick={() => select(a.id)} aria-label={`Select strip ${a.callsign}`}><span>{a.callsign}</span><span style={{color: a.clearedToLand ? "#91e98d" : undefined}}>{stripRunway(a)}</span><span>{a.type}</span></button><button className={`${styles.atcButton} ${pending ? styles.pendingRequest : ""}`} disabled={!view.connected} onClick={() => openMessages(a)}>ATC{pending ? ` (${pending})` : ""}<i className={a.active ? styles.activePilot : styles.inactivePilot}/></button></div>;
        })}</div>
        <input className={styles.splitter} aria-label="Flight strip panel height" type="range" min="30" max="85" value={split} onChange={e => setSplit(Number(e.target.value))}/>
        <MessageLog airport={AIRPORT} messages={exercise.messages} frequency={frequency}/>
      </aside>}
    </>}
    {messaging && role === "mentee" && messaging.frequency === frequency ? <MessagePanel key={`${messaging.id}:${frequency}`} aircraft={messaging} exercise={exercise} frequency={frequency} connected={view.connected} dispatch={dispatch} onClose={() => setMessageId(null)}/> : null}
    {utility && selected ? <UtilityPanel label={utility} aircraft={selected} dispatch={dispatch} onClose={() => setUtility(null)}/> : null}
    {!view.connected ? <div className={styles.connectionBanner} role="status">{view.status}<span>Your scenario is saved. Waiting for the connection to return.</span></div> : null}
    {trainingError ? <div className={styles.error} role="alert">{trainingError}<button aria-label="Dismiss scenario error" onClick={() => setTrainingError("")}>×</button></div> : null}
    {view.error ? <div className={styles.error} role="alert">{view.error}<button aria-label="Dismiss error" onClick={transport.clearError}>×</button></div> : null}
    <div className={styles.rotatePrompt}><h1>ATCMH ATC Trainer</h1><p>Rotate your tablet to landscape or use a larger screen.</p><Link href="/">Return to ATCMH</Link></div>
    </div>
    {paused ? <section className={styles.pauseScreen} role="status" aria-labelledby="exercise-paused-title"><Pause size={40} weight="fill" aria-hidden="true"/><h1 id="exercise-paused-title" ref={pauseTitle} tabIndex={-1}>{view.session.scenario?.finished ? "Exercise finished" : "Exercise paused"}</h1><Link href="/">Exit simulator</Link></section> : null}
  </main>;
}
function UtilityPanel({label, aircraft: a, dispatch, onClose}: {label: ContextAction; aircraft: Aircraft; dispatch: (a: Action) => void; onClose: () => void}) {
  const edit = (patch: Partial<Aircraft>) => {dispatch({kind: "edit", aircraftId: a.id, patch}); onClose();};
  return <section className={styles.utility} role="dialog" aria-label={CONTEXT_ACTIONS[label]} aria-modal="true"><header>{CONTEXT_ACTIONS[label]}<button aria-label="Close dialog" onClick={onClose}>×</button></header>
    {label === "information" ? <dl><dt>Callsign</dt><dd>{a.callsign}</dd><dt>Aircraft</dt><dd>{a.type}</dd><dt>Altitude</dt><dd>{Math.round(a.altitude)}ft MSL</dd><dt>Heading</dt><dd>{Math.round(a.heading)}°</dd><dt>Speed</dt><dd>{Math.round(a.speed)}KT</dd></dl> : null}
    {label === "tag" ? <div className={styles.colorChoices}>{(["auto", "default", "left", "right"] as const).map(tag => <button key={tag} onClick={() => edit({tag})}>{tag === "auto" ? "Automatic Position" : tag === "default" ? "Default Position" : tag === "left" ? "Left" : "Right"}</button>)}</div> : null}
  </section>;
}
