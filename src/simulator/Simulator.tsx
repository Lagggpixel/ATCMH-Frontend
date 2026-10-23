"use client";
import type {VectorTarget} from "./vector-drag";
import FullscreenButton from "./FullscreenButton";
import {magneticHeadingLabel} from "./magnetic-headings";
import type {Airport} from "./model";
import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from "react";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import Link from "next/link";
import {catalogFor, CONTEXT_ACTIONS, type ContextAction} from "./catalog";
import {getAirport, frequenciesFor, simulatedMetar, openingFrequency, controlledFrequencies, trainingMode} from "./airports";
import RadarQuickPopup from "./RadarQuickPopup";
import {airborne, radarStripRunway, radarEnvironmentFor} from "./radar";
import {frequencyPendingRequests, pendingPilotMessage, unreadMessages, type Action, type Aircraft, type Frequency, type Point} from "./model";
import {SharedSession} from "./shared-transport";
import SessionAccess, {SessionNotice} from "./SessionAccess";
import {sessionCode, sessionPath, type SessionRole} from "./sessions";
import LiveScenarioPanel from "./LiveScenarioPanel";
import {trainingRequest} from "./TrainingLibrary";
import Scope, {type ScopeCamera} from "./Scope";
import ControllerStrip from "./ControllerStrip";
import StaffPanel, {StaffToolbar, TrafficRoster} from "./StaffPanel";
import AtisPanel from "./AtisPanel";
import MessagePanel, {MessageLog} from "./MessagePanel";
import RadioAudio from "./RadioAudio";
import StaffTutorial from "./StaffTutorial";
import AircraftContextMenu from "./AircraftContextMenu";
import styles from "./Simulator.module.css";

export default function Simulator({role, sessionId}: {role: SessionRole; sessionId: string}) {
  return <SessionAccess role={role} returnTo={sessionPath(role, sessionId)}>{(csrf, accountId) => <SimulatorSession key={`${role}:${sessionId}:${accountId}`} role={role} sessionId={sessionId} csrf={csrf} accountId={accountId}/>}</SessionAccess>;
}
function SimulatorSession({role, sessionId, csrf, accountId}: {role: SessionRole; sessionId: string; csrf: string; accountId: string}) {
  const [transport] = useState(() => new SharedSession(role, sessionId, csrf));
  const view = useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getServerSnapshot);
  const [dismissedStrips, setDismissedStrips] = useState<Record<string, string | null>>({});
  const [focusRequest, setFocusRequest] = useState<{id: string; serial: number}>();
  const [chosenFrequency, setFrequency] = useState<Frequency | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vectorHeading, setVectorHeading] = useState<number>();
  const [vectorTarget, setVectorTarget] = useState<VectorTarget>();
  const [vectorAnchor, setVectorAnchor] = useState<Point>();
  const [quickHidden, setQuickHidden] = useState(false);
  const [messagePath, setMessagePath] = useState<string[]>([]);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [utility, setUtility] = useState<ContextAction | null>(null);
  const [editMode, setEditMode] = useState("");
  const [holdPoint, setHoldPoint] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [trainingError, setTrainingError] = useState("");
  const fullscreenRoot = useRef<HTMLElement>(null);
  const {exercise} = view;
  const AIRPORT = getAirport(exercise), FREQUENCIES = frequenciesFor(AIRPORT), METAR = simulatedMetar(AIRPORT);
  const mode = trainingMode(exercise);
  const frequency = chosenFrequency ?? openingFrequency(exercise);
  const scopeView = `${exercise.id}:${AIRPORT.icao}:${mode}:${role === "staff" ? "all" : frequency}`;
  const [scopeCameras, setScopeCameras] = useState<Record<string, ScopeCamera>>({});
  const saveScopeCamera = useCallback((camera: ScopeCamera) => setScopeCameras(views => ({...views, [scopeView]: camera})), [scopeView]);
  const selected = exercise.aircraft.find(a => a.id === selectedId);
  const messaging = exercise.aircraft.find(a => a.id === messageId);
  const dispatch = transport.dispatch;
  const paused = role === "mentee" && Boolean(exercise.pausedByStaff);
  const hiddenByPause = paused && (exercise.pauseVisibility !== "visible" || Boolean(view.session?.scenario?.finished));
  const pauseTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => transport.start(), [transport]);
  useEffect(() => transport.subscribe(() => {
    const current = transport.getSnapshot();
    if (!current.connected || role === "mentee" && current.exercise.pausedByStaff) {setVectorHeading(undefined); setVectorTarget(undefined); setQuickHidden(true);}
  }), [transport, role]);
  useEffect(() => {
    if (!hiddenByPause) return;
    const previous = document.activeElement;
    pauseTitle.current?.focus();
    return () => {if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};
  }, [hiddenByPause]);
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
  const openMessages = (a: Aircraft, path: string[] = []) => {setMessagePath(path);setSelectedId(null); setMessageId(a.id); setUtility(null); if (!paused) dispatch({kind: "read", aircraftId: a.id, frequency});};
  const select = (id: string | null) => {setVectorHeading(undefined); setVectorTarget(undefined); setQuickHidden(false); setEditMode(""); setSelectedId(id); setUtility(null); if (id !== messageId) setMessageId(null);};
  const contextAction = (action: ContextAction, a: Aircraft) => {
    if (action === "messages") openMessages(a);
    else if (action === "hold") openMessages(a, ["Request Hold", "Present Position"]);
    else if (action === "guard") {const command = {type: "atc", action: "guard", frequency, variant: "contact"} as const; void dispatch({kind: "command", aircraftId: a.id, command, frequency, text: catalogFor(AIRPORT, exercise.radarEnvironment).instructionText(a, command)}); setQuickHidden(true);}
    else if (action === "remove-reminder") dispatch({kind: "edit", aircraftId: a.id, patch: {reminderAt: null}});
    else {setUtility(action); setQuickHidden(true);}
  };
  const point = (p: Point) => {
    if (!selected || role !== "staff" || editMode === "taxi-preview") return;
    const patch: Partial<Aircraft> = editMode === "position" ? {position: p} : editMode === "taxi" ? {taxiPath: [...selected.taxiPath, {...p, hold: holdPoint}]} : {flightPlan: [...selected.flightPlan, p]};
    dispatch({kind: "edit", aircraftId: selected.id, patch}); if (editMode === "position") setEditMode("");
  };
  const context = (a: Aircraft) => role === "staff" || paused || quickHidden ? null : mode !== "local" && a.frequency === frequency && airborne(a, AIRPORT) && !a.radar?.transferred ? quickHidden || !view.connected ? null : <RadarQuickPopup key={`${a.id}:${vectorHeading ?? "click"}:${vectorTarget?.index ?? "free"}`} aircraft={a} exercise={exercise} frequency={frequency} heading={vectorHeading} target={vectorTarget} connected={view.connected} dispatch={dispatch} onMessages={() => openMessages(a)} onAction={action => contextAction(action, a)} onSent={() => {setQuickHidden(true); setVectorHeading(undefined); setVectorTarget(undefined);}}/> : <AircraftContextMenu key={a.id} exercise={exercise} aircraft={a} frequency={frequency} elapsed={exercise.elapsed} connected={view.connected} dispatch={dispatch} onAction={action => contextAction(action, a)} onClose={() => {setQuickHidden(true); setVectorHeading(undefined); setVectorTarget(undefined);}}/>;
  const elapsed = `${String(Math.floor(exercise.elapsed / 60)).padStart(2, "0")}:${String(Math.floor(exercise.elapsed % 60)).padStart(2, "0")}`;
  if (view.fatal) return <SessionNotice title={view.code === "seat-occupied" ? `${role === "staff" ? "Control" : "Mentee"} page already in use` : view.code === "not-found" ? "Session unavailable" : "Could not join session"}><p>{view.fatal}</p><p>Session {sessionCode(sessionId, exercise.airport)}</p><button onClick={() => window.location.reload()}>Try again</button><Link href="/sweatbox/staff">Return to sessions</Link></SessionNotice>;
  if (!view.session) return <SessionNotice title={view.status}><Link href={`/sweatbox/${role}`}>Return to {role === "staff" ? "sessions" : "session entry"}</Link></SessionNotice>;
  return <main ref={fullscreenRoot} className={`${styles.simulator} ${role === "staff" ? styles.staffSimulator : styles.menteeSimulator}`}>
    <div className={styles.exerciseContents} inert={hiddenByPause} aria-hidden={hiddenByPause || undefined}>
    {role === "staff" ? <><StaffToolbar tutorial={<StaffTutorial accountId={accountId} live/>} sessionId={sessionId} sessionTitle={view.session.title} exercise={exercise} dispatch={dispatch} owner={view.owner} status={view.status} audio={<RadioAudio accountId={accountId} role={role} exercise={exercise} connected={view.connected} scope="all"/>} onReset={() => {select(null); setEditMode("");}} scenario={!!view.scenario} onRestart={() => void trainingRequest(csrf, `attempts/${sessionId}`, {action: "restart", attemptId: view.scenario?.attemptId}).catch(e => setTrainingError(e.message))} extra={<LiveScenarioPanel sessionId={sessionId} csrf={csrf} scenario={view.scenario} elapsed={exercise.elapsed} running={exercise.running} connected={view.connected} onEvent={transport.scenarioEvent}/>}/><TrafficRoster exercise={exercise} selected={selected} onSelect={select} dispatch={dispatch} owner={view.owner}/></> : <><nav className={styles.sidebar} aria-label="Sweatbox frequencies">{controlledFrequencies(exercise).map(key => <button key={key} aria-pressed={frequency === key} className={`${frequency === key ? styles.activeFrequency : ""} ${frequencyPending[key] ? styles.pendingRequest : ""}`} onClick={() => {setFrequency(key); setMessageId(null); setSelectedId(null); setVectorHeading(undefined); setVectorTarget(undefined); setQuickHidden(false);}}><span className={styles.facilityLabel}><small>{AIRPORT.icao}</small>{FREQUENCIES[key].label}</span><span className={styles.frequencyValue}>{FREQUENCIES[key].value}{frequencyPending[key] ? ` (${frequencyPending[key]})` : ""}</span></button>)}<Link href="/sweatbox/staff" className={styles.exit}>Leave</Link></nav>
    <header className={styles.topBanner}><span>{METAR}<small>Simulation only · <a href="/sweatbox/about" target="_blank" rel="noreferrer">About & sources</a></small></span><RadioAudio accountId={accountId} role={role} exercise={exercise} connected={view.connected} paused={paused} scope={frequency}/><span>UTC {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"}Z · Exercise {elapsed}</span><FullscreenButton target={fullscreenRoot}/></header></>}
    {frequency === "atis" && role === "mentee" ? <AtisPanel exercise={exercise} dispatch={dispatch} connected={view.connected && !paused}/> : <>
      <Scope focusRequest={focusRequest} key={`${exercise.id}:${AIRPORT.icao}:${mode}`} savedCamera={scopeCameras[scopeView]} onCameraChange={saveScopeCamera} airport={AIRPORT} radarEnvironment={exercise.radarEnvironment} radarMode={mode === "local" ? undefined : mode} onVector={role === "mentee" && mode !== "local" && view.connected && !paused ? (id, heading, release, target) => {select(id); setVectorHeading(heading); setVectorTarget(target); setVectorAnchor(release);} : undefined} contextPoint={vectorHeading === undefined ? undefined : vectorAnchor} onTagAngle={view.connected && !paused && (role === "mentee" || view.owner) ? (id, angle) => void dispatch({kind: "edit", aircraftId: id, patch: {tagAngle: angle}}) : undefined} pendingAircraft={pendingAircraft} autoReadback={exercise.autoReadback} running={exercise.running} aircraft={exercise.aircraft} frequency={role === "staff" ? "all" : frequency} giveWayTargets={giveWayTargets} selected={selected?.id ?? null} onSelect={select} onPoint={point} onTaxiPathEdit={role === "staff" && view.owner ? (aircraftId, path, edit) => dispatch({kind: "taxi-path", aircraftId, path, edit}) : undefined} editMode={role === "staff" && view.owner ? editMode : ""} context={context}/>
      {role === "staff" ? <StaffPanel exercise={exercise} selected={selected} dispatch={dispatch} onSelect={select} editMode={editMode} onEditMode={setEditMode} holdPoint={holdPoint} onHoldPoint={setHoldPoint} owner={view.owner} status={view.status}/> : <aside className={styles.rightPanel} aria-label="Flight strips and messages" inert={Boolean(messaging)} aria-hidden={Boolean(messaging) || undefined}>
        <div className={styles.strips} aria-label="Flight strips">{Object.keys(dismissedStrips).length ? <button className={styles.restoreStrips} onClick={() => setDismissedStrips({})}>Restore dismissed strips</button> : null}<header className={styles.stripsHeader}><h2>{FREQUENCIES[frequency].label} traffic</h2><span>{exercise.aircraft.filter(a => a.frequency === frequency).length}</span></header>{exercise.aircraft.filter(a => a.frequency === frequency).map(a => {
          const pending = pendingAircraft.includes(a.id) ? 1 : 0;
          const stripKey = `${frequency}:${a.id}`, latestRequest = exercise.messages.filter(m => m.aircraftId === a.id && m.frequency === frequency && m.sender === "pilot").at(-1)?.id ?? null;
          if (Object.hasOwn(dismissedStrips, stripKey) && dismissedStrips[stripKey] === latestRequest) return null;
          return <ControllerStrip key={a.id} aircraft={a} runway={radarStripRunway(a, exercise.radarEnvironment ?? radarEnvironmentFor(AIRPORT))} selected={selectedId === a.id} pending={Boolean(pending)} reminder={a.reminderAt !== null && a.reminderAt <= exercise.elapsed} connected={view.connected && !paused} onSelect={() => select(a.id)} onFocus={() => {setSelectedId(null); setFocusRequest({id: a.id, serial: Date.now()});}} onMessages={() => openMessages(a)} onDismiss={() => {setDismissedStrips(previous => ({...previous, [stripKey]: latestRequest})); if (selectedId === a.id) select(null);}}/>;
        })}</div>
        <MessageLog airport={AIRPORT} messages={exercise.messages} frequency={frequency} compact/>
      </aside>}
    </>}
    {messaging && role === "mentee" && messaging.frequency === frequency ? <><button className={styles.messageBackdrop} aria-label="Dismiss aircraft messages" onClick={() => setMessageId(null)}/><MessagePanel key={`${messaging.id}:${frequency}:${messagePath.join("/")}`} initialPath={messagePath} aircraft={messaging} exercise={exercise} frequency={frequency} quickCommands={view.quickCommands} connected={view.connected && !paused} dispatch={dispatch} onClose={() => setMessageId(null)}/></> : null}
    {utility && selected && !paused ? <UtilityPanel airport={AIRPORT} label={utility} aircraft={selected} dispatch={dispatch} onClose={() => setUtility(null)}/> : null}
    {paused && !hiddenByPause ? <div className={styles.visiblePause} role="status">Exercise paused · Viewing only</div> : null}
    {!view.connected ? <div className={styles.connectionBanner} role="status">{view.status}<span>Your scenario is saved. Waiting for the connection to return.</span></div> : null}
    {trainingError ? <div className={styles.error} role="alert">{trainingError}<button aria-label="Dismiss scenario error" onClick={() => setTrainingError("")}>×</button></div> : null}
    {view.error ? <div className={styles.error} role="alert">{view.error}<button aria-label="Dismiss error" onClick={transport.clearError}>×</button></div> : null}
    <div className={styles.rotatePrompt}><h1>ATCMH Sweatbox</h1><p>Rotate your tablet to landscape or use a larger screen.</p><Link href="/">Return to ATCMH</Link></div>
    </div>
    {hiddenByPause ? <section className={styles.pauseScreen} role="status" aria-labelledby="exercise-paused-title"><Pause size={40} weight="fill" aria-hidden="true"/><h1 id="exercise-paused-title" ref={pauseTitle} tabIndex={-1}>{view.session.scenario?.finished ? "Exercise finished" : "Exercise paused"}</h1><Link href="/">Exit Sweatbox</Link></section> : null}
  </main>;
}
function UtilityPanel({airport, label, aircraft: a, dispatch, onClose}: {airport: Airport; label: ContextAction; aircraft: Aircraft; dispatch: (a: Action) => void; onClose: () => void}) {
  const edit = (patch: Partial<Aircraft>) => {dispatch({kind: "edit", aircraftId: a.id, patch}); onClose();};
  return <section className={`${styles.utility} ${label === "information" ? styles.aircraftInformation : ""}`} role="dialog" aria-label={CONTEXT_ACTIONS[label]} aria-modal={label === "information" ? undefined : true}><header>{CONTEXT_ACTIONS[label]}<button aria-label="Close dialog" onClick={onClose}>×</button></header>
    {label === "information" ? <dl><dt>Callsign</dt><dd>{a.callsign}</dd><dt>Aircraft</dt><dd>{a.type}</dd><dt>Altitude</dt><dd>{Math.round(a.altitude)}ft MSL</dd><dt>Heading</dt><dd>{magneticHeadingLabel(a.heading, airport)}°M</dd><dt>Speed</dt><dd>{Math.round(a.speed)}KT</dd><dt>Frequency</dt><dd>{a.frequency ? a.frequency.toUpperCase() : "Not tuned"}</dd><dt>Destination</dt><dd>{a.destination?.name ?? airport.icao}</dd><dt>Assigned runway</dt><dd>{a.runway ?? "—"}</dd><dt>Assigned altitude</dt><dd>{a.radar?.targetAltitude ? a.radar.targetAltitude.unit === "feet" ? `${a.radar.targetAltitude.value}ft` : `FL${a.radar.targetAltitude.value}` : "—"}</dd><dt>Flight plan</dt><dd>{a.flightPlan.length ? <ol>{a.flightPlan.map((point, index) => <li key={index}>{point.name ?? `Waypoint ${index + 1}`}</li>)}</ol> : "No flight plan"}</dd></dl> : null}
    {label === "tag" ? <div className={styles.colorChoices}>{(["auto", "default"] as const).map(tag => <button key={tag} onClick={() => edit({tag})}>{tag === "auto" ? "Automatic Position" : tag === "default" ? "Default Position" : tag === "left" ? "Left" : "Right"}</button>)}</div> : null}
  </section>;
}
