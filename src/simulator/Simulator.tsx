"use client";
import type {PlanGroundTaxi} from "./GroundRouteEditor";
import type {MapCamera} from "./scope-camera";
import CrashAlert from "./CrashAlert";
import {conflictLabels, type ConflictKind} from "./training-conflicts";
import ConflictOverlay from "./ConflictOverlay";
import FullscreenButton from "./FullscreenButton";
import {magneticHeadingLabel} from "./magnetic-headings";
import type {Airport} from "./model";
import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from "react";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import Link from "next/link";
import {catalogFor, CONTEXT_ACTIONS, type ContextAction} from "./catalog";
import {getAirport, frequenciesFor, simulatedMetar, openingFrequency, controlledFrequencies, trainingMode} from "./airports";
import RadarQuickPopup from "./RadarQuickPopup";
import type {VectorTarget} from "./vector-drag";
import {airborne, radarEnvironmentFor} from "./radar";
import {frequencyPendingRequests, pendingPilotMessage, pendingRequestCount, unreadMessages, type Action, type Aircraft, type Frequency, type Point} from "./model";
import {SharedSession} from "./shared-transport";
import SessionAccess, {SessionNotice} from "./SessionAccess";
import {sessionCode, sessionPath, type SessionMode} from "./sessions";
import LiveScenarioPanel, {FinishAttemptDialog} from "./LiveScenarioPanel";
import {trainingRequest} from "./TrainingLibrary";
import Scope from "./Scope";
import ControllerStrip from "./ControllerStrip";
import {controllerStripText} from "./controller-strip";
import {flightStrips} from "./flight-strip-order";
import StaffPanel, {StaffToolbar, TrafficRoster} from "./StaffPanel";
import SpawnAircraftDialog from "./SpawnAircraftDialog";
import DeleteAircraftDialog from "./DeleteAircraftDialog";
import MentorContextMenu, {type ScopeContext} from "./MentorContextMenu";
import AtisPanel from "./AtisPanel";
import MessagePanel, {MessageLog} from "./MessagePanel";
import CommandMenuConnector from "./CommandMenuConnector";
import RadioAudio from "./RadioAudio";
import {RadioAudio as RadioPlayer} from "./radio-audio";
import StaffTutorial from "./StaffTutorial";
import AircraftContextMenu from "./AircraftContextMenu";
import styles from "./Simulator.module.css";
import {DemoGhost, DemoTraineeBar, DemoTrainerBar, useLatestSent} from "./DemoMirror";
import {DemoRecorder, demoAnchorAt, demoScrollElement, demoScrollKey, demoScrollRatio, sameDemoState, type DemoGroundDraft, type DemoState} from "./demonstration";
import liveTheme from "./LiveTheme.module.css";

export default function Simulator({role, sessionId}: {role: SessionMode; sessionId: string}) {
  return <SessionAccess role={role} allowMentee={role === "mentee"} returnTo={sessionPath(role, sessionId)}>{(csrf, accountId) => <SimulatorSession key={`${role}:${sessionId}:${accountId}`} role={role} sessionId={sessionId} csrf={csrf} accountId={accountId}/>}</SessionAccess>;
}
function SimulatorSession({role: connectionRole, sessionId, csrf, accountId}: {role: SessionMode; sessionId: string; csrf: string; accountId: string}) {
  const [scopeCameras] = useState(() => new Map<string, MapCamera>());
  const [radioPlayer] = useState(() => new RadioPlayer());
  const observing = connectionRole === "spectator";
  const role = connectionRole === "mentee" ? "mentee" : "staff";
  const exitPath = role === "mentee" ? "/sweatbox/mentee" : "/sweatbox/staff";
  const [transport] = useState(() => new SharedSession(connectionRole, sessionId, csrf));
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
  const menuPaths = useRef(new Map<string, {frequency: Frequency; path: string[]}>());
  const [messageId, setMessageId] = useState<string | null>(null);
  const [utility, setUtility] = useState<ContextAction | null>(null);
  const [scopeContext, setScopeContext] = useState<ScopeContext | null>(null);
  const [spawnAt, setSpawnAt] = useState<{point?: Point} | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState("");
  const [groundRouteRequest, setGroundRouteRequest] = useState<{aircraftId: string; runway?: string; serial: number}>();
  const [now, setNow] = useState<number | null>(null);
  const [pair, setPair] = useState<{kind: ConflictKind; first: string} | null>(null);
  const [trainingError, setTrainingError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const fullscreenRoot = useRef<HTMLElement>(null);
  const {exercise} = view;
  const demonstration = observing ? undefined : exercise.demonstration;
  // The mentor holds the controller seat; the mentee watches it mirrored on their own screen.
  const presenting = role === "staff" && !!demonstration, watching = role === "mentee" && !!demonstration;
  const layout = presenting ? "mentee" : role;
  const AIRPORT = getAirport(exercise), FREQUENCIES = frequenciesFor(AIRPORT), METAR = simulatedMetar(AIRPORT, exercise.weather);
  const mode = trainingMode(exercise);
  const frequency = chosenFrequency ?? openingFrequency(exercise);
  const selected = exercise.aircraft.find(a => a.id === selectedId);
  const messaging = exercise.aircraft.find(a => a.id === messageId);
  const lastGroundMessage = selected && exercise.messages.filter(m => m.aircraftId === selected.id && m.sender === "controller" && !m.retractedBy && (m.instruction?.type === "taxi" || m.instruction?.type === "pushback")).at(-1);
  const lastGroundCommand = lastGroundMessage?.instruction;
  const reviewedGroundRoute = lastGroundCommand && (lastGroundCommand.type === "taxi" || lastGroundCommand.type === "pushback") ? lastGroundCommand.route : undefined;
  const assignedPath = reviewedGroundRoute?.kind === "pushback" ? selected?.pushback?.path : selected?.taxiPath;
  const groundRouteAssigned = reviewedGroundRoute && assignedPath?.length === reviewedGroundRoute.points.length && reviewedGroundRoute.points.every((p, i) => p.x === assignedPath[i].x && p.y === assignedPath[i].y);
  const groundRouteAnswered = lastGroundMessage && exercise.messages.some(m => m.commandId === lastGroundMessage.id);
  const sentGroundRoute = selected && ["parked", "pushback", "taxi", "lineup"].includes(selected.mode) && !selected?.arrivalExit && !groundRouteAnswered && !groundRouteAssigned && !(reviewedGroundRoute?.kind === "pushback" && selected?.enginesRunning) ? reviewedGroundRoute : undefined;
  const physicalRouteVisible = !!groundRouteAssigned || !!groundRouteAnswered && !!reviewedGroundRoute && !!selected && ["taxi", "pushback", "lineup", "rollout"].includes(selected.mode);
  const demoRefs = useRef({presenting, watching, exercise, cameraKey: ""});
  useEffect(() => {demoRefs.current.presenting = presenting; demoRefs.current.watching = watching; demoRefs.current.exercise = exercise;});
  const [recorder] = useState(() => new DemoRecorder(batch => transport.sendDemo(batch), () => 0));
  useEffect(() => {recorder.setClock(() => demoRefs.current.exercise.elapsed);}, [recorder]);
  /** While demonstrating, every command the mentor sends is shown to the mentee word for word. */
  const dispatch = useCallback((action: Action, path?: string[]) => {
    const {presenting, exercise} = demoRefs.current;
    if (presenting && action.kind === "command") recorder.event({kind: "sent", id: crypto.randomUUID(), aircraftId: action.aircraftId, callsign: exercise.aircraft.find(a => a.id === action.aircraftId)?.callsign ?? "", text: action.text, path: (path ?? []).slice(0, 12).map(label => label.slice(0, 120))});
    return transport.dispatch(action, path);
  }, [transport, recorder]);
  const [livePath, setLivePath] = useState<string[]>([]);
  const scopeDemo = useRef<{vectorDraft: {aircraftId: string; point: Point} | null; ground: DemoGroundDraft | null}>({vectorDraft: null, ground: null});
  const controllerDemo = useRef<Omit<DemoState, "camera" | "vectorDraft" | "ground"> | null>(null);
  const scrollDemo = useRef<Record<string, number>>({});
  const pushDemo = useCallback(() => {if (controllerDemo.current) recorder.setState({...controllerDemo.current, ...scopeDemo.current, scroll: scrollDemo.current});}, [recorder]);
  const setScopeDemo = useCallback((scope: {vectorDraft: {aircraftId: string; point: Point} | null; ground: DemoGroundDraft | null}) => {
    scopeDemo.current = scope; pushDemo();
  }, [pushDemo]);
  const [mirror, setMirror] = useState<DemoState | null>(null);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow), reapply = useRef(() => {});
  const [sent, setSent] = useLatestSent();
  const [handedBack, setHandedBack] = useState(false);
  const paused = role === "mentee" && Boolean(exercise.pausedByStaff);
  const hiddenByPause = paused && (exercise.pauseVisibility !== "visible" || Boolean(view.session?.scenario?.finished));
  const pauseTitle = useRef<HTMLHeadingElement>(null);
  const cameraKey = `${AIRPORT.icao}:${mode}:${layout === "staff" ? "all" : frequency}`;
  useEffect(() => {demoRefs.current.cameraKey = cameraKey;}, [cameraKey]);
  const scopeCamera = useCallback(() => scopeCameras.get(demoRefs.current.cameraKey), [scopeCameras]);
  // Mentor: record the shared controller state, the scope view, the pointer and clicks.
  useEffect(() => {
    if (!presenting) return;
    recorder.setCamera(() => {
      const camera = scopeCamera(), box = fullscreenRoot.current?.querySelector("[data-simulator-tour=radar]")?.getBoundingClientRect();
      return camera && box ? {center: {...camera.center}, scale: camera.scale, width: Math.round(box.width), height: Math.round(box.height)} : null;
    });
    recorder.start();
    const root = fullscreenRoot.current;
    const anchor = (event: PointerEvent) => {
      const element = root?.querySelector<HTMLElement>("[data-simulator-tour=radar]"), camera = scopeCamera();
      return demoAnchorAt(root!, event.target, event.clientX, event.clientY, element && camera ? {element, camera} : undefined);
    };
    let latest: PointerEvent | null = null, frame = 0;
    const move = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      latest = event;
      frame ||= requestAnimationFrame(() => {frame = 0; if (latest) recorder.move(anchor(latest), latest.buttons > 0); latest = null;});
    };
    const down = (event: PointerEvent) => {if (!event.isPrimary) return; const at = anchor(event); recorder.move(at, true); recorder.event({kind: "click", at});};
    // Scrolling a popup, the command list or the strips scrolls the same list on the watching screen.
    scrollDemo.current = {};
    const scrolled = (event: Event) => {
      const key = root && event.target instanceof Element ? demoScrollKey(root, event.target) : null;
      if (!key) return;
      const others = {...scrollDemo.current}; delete others[key];
      scrollDemo.current = {...Object.fromEntries(Object.entries(others).slice(-23)), [key]: demoScrollRatio(event.target as Element)};
      pushDemo();
    };
    root?.addEventListener("scroll", scrolled, {capture: true, passive: true});
    root?.addEventListener("pointermove", move, {capture: true, passive: true});
    root?.addEventListener("pointerdown", down, {capture: true, passive: true});
    return () => {cancelAnimationFrame(frame); root?.removeEventListener("scroll", scrolled, {capture: true}); root?.removeEventListener("pointermove", move, {capture: true}); root?.removeEventListener("pointerdown", down, {capture: true}); recorder.stop();};
  }, [presenting, recorder, scopeCamera, pushDemo]);
  useEffect(() => {
    controllerDemo.current = presenting ? {frequency, selectedId, messageId, menuPath: messageId ? livePath : [], dismissedStrips, quickHidden, utility, vectorHeading, vectorTarget, vectorAnchor} : null;
    pushDemo();
  }, [presenting, pushDemo, frequency, selectedId, messageId, livePath, dismissedStrips, quickHidden, utility, vectorHeading, vectorTarget, vectorAnchor]);
  // Mentor: start from the mentee's own frequency, strips and open messages.
  useEffect(() => presenting ? transport.onDemoSeed(seed => {
    setFrequency(seed.frequency); setSelectedId(seed.selectedId); setMessageId(seed.messageId); setMessagePath(seed.menuPath); setLivePath(seed.menuPath); setDismissedStrips(seed.dismissedStrips);
    setVectorHeading(undefined); setVectorTarget(undefined); setUtility(null);
  }) : undefined, [presenting, transport]);
  // Mentee: hand the mentor this screen's controller state, then follow theirs.
  const seedRef = useRef({frequency, selectedId, messageId, messagePath, dismissedStrips});
  useEffect(() => {seedRef.current = {frequency, selectedId, messageId, messagePath: messageId ? menuPaths.current.get(messageId)?.path ?? messagePath : [], dismissedStrips};});
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let applied: DemoState | null = null;
    // The mentee's controls track the mentor's as each demonstration frame arrives.
    const follow = (mirror: DemoState) => {
      if (followRef.current) setFrequency(mirror.frequency);
      setSelectedId(mirror.selectedId); setMessageId(mirror.messageId);
      setMessagePath(current => current.join("/") === mirror.menuPath.join("/") ? current : mirror.menuPath);
      setDismissedStrips(mirror.dismissedStrips); setQuickHidden(mirror.quickHidden); setUtility(mirror.utility as ContextAction | null);
      setVectorHeading(mirror.vectorHeading); setVectorTarget(mirror.vectorTarget); setVectorAnchor(mirror.vectorAnchor);
    };
    const send = (attempt: number) => {
      const {messagePath: menuPath, ...controller} = seedRef.current;
      void transport.sendDemoSeed({...controller, menuPath}).catch(() => {if (!cancelled && attempt < 4) setTimeout(() => send(attempt + 1), 400 * (attempt + 1));});
    };
    send(0);
    reapply.current = () => {if (applied) setFrequency(applied.frequency);};
    const stop = transport.onDemo(frame => {
      if (frame.state && !sameDemoState(applied, frame.state)) {applied = frame.state; setMirror(applied); follow(applied);}
      const latest = frame.batches.flatMap(batch => batch.events).findLast(event => event.kind === "sent");
      if (latest?.kind === "sent") setSent(latest);
    });
    return () => {cancelled = true; stop(); reapply.current = () => {}; setMirror(null); setSent(null);};
  }, [watching, transport, setSent]);
  const changeFollow = (value: boolean) => {followRef.current = value; setFollow(value); if (value) reapply.current();};
  useEffect(() => {
    const scroll = mirror?.scroll, root = fullscreenRoot.current;
    if (!scroll || !root) return;
    const frame = requestAnimationFrame(() => {
      for (const [key, ratio] of Object.entries(scroll)) {
        const element = demoScrollElement(root, key);
        if (element) element.scrollTop = ratio * Math.max(0, element.scrollHeight - element.clientHeight);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [mirror]);
  const wasWatching = useRef(false);
  useEffect(() => {
    if (wasWatching.current && !watching) {setHandedBack(true); const timer = setTimeout(() => setHandedBack(false), 5000); wasWatching.current = false; return () => clearTimeout(timer);}
    wasWatching.current = watching;
  }, [watching]);
  const toggleDemonstration = () => {
    if (!view.owner || !view.connected) return;
    setEditMode(""); setScopeContext(null); setSpawnAt(null); setDeleteId(null); setPair(null); setSelectedId(null); setMessageId(null); setVectorHeading(undefined); setVectorTarget(undefined);
    void dispatch({kind: "demonstrate", enabled: !presenting});
  };
  useEffect(() => transport.start(), [transport]);
  useEffect(() => transport.subscribe(() => {
    const current = transport.getSnapshot();
    if (role === "mentee" && current.exercise.pausedByStaff) {setVectorHeading(undefined); setVectorTarget(undefined); setQuickHidden(true);}
  }), [transport, role]);
  useEffect(() => {
    if (!hiddenByPause) return;
    const previous = document.activeElement;
    pauseTitle.current?.focus();
    return () => {if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};
  }, [hiddenByPause]);
  const frequencyPending = frequencyPendingRequests(exercise);
  const pendingAircraft = exercise.aircraft.filter(a => a.frequency && pendingRequestCount(exercise, a.id, a.frequency) > 0).map(a => a.id);
  const missingStripControls = layout === "mentee" ? exercise.aircraft.filter(a => a.frequency && Object.hasOwn(dismissedStrips, `${a.frequency}:${a.id}`) && dismissedStrips[`${a.frequency}:${a.id}`] === (exercise.messages.filter(m => m.aircraftId === a.id && m.frequency === a.frequency && m.sender === "pilot").at(-1)?.id ?? null)).map(a => a.id) : [];
  useEffect(() => {
    for (const [id, saved] of menuPaths.current) {
      if (exercise.aircraft.find(a => a.id === id)?.frequency !== saved.frequency) menuPaths.current.delete(id);
    }
  }, [exercise.aircraft]);
  const giveWayTargets = layout === "staff" ? [
    ...exercise.aircraft.flatMap(a => a.giveWay ? [a.giveWay.aircraftId] : []),
    ...exercise.messages.flatMap(m => m.sender === "controller" && !m.retractedBy && m.instruction?.type === "give-way" && m.instruction.aircraftId && now !== null && now - m.time < 30_000 ? [m.instruction.aircraftId] : []),
  ] : [];
  const unread = messaging ? unreadMessages(exercise, messaging.id, frequency) : 0;
  useEffect(() => {
    if (!observing && messageId && (unread > 0 || messaging?.reminderAt != null) && view.connected && !paused) dispatch({kind: "read", aircraftId: messageId, frequency});
  }, [messageId, unread, messaging?.reminderAt, frequency, view.connected, paused, dispatch, observing]);
  useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer);}, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape" && !demoRefs.current.watching) {setPair(null); setSpawnAt(null); setDeleteId(null); setScopeContext(null); setMessageId(null); setUtility(null); setScopeContext(null); setSelectedId(null); setVectorHeading(undefined); setVectorTarget(undefined); setEditMode("");}};
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, []);
  const openMessages = (a: Aircraft, path?: string[]) => {if (watching) return; const saved = menuPaths.current.get(a.id); setMessagePath(path ?? (saved?.frequency === frequency ? saved.path : []));setSelectedId(null); setMessageId(a.id); setLivePath(path ?? (saved?.frequency === frequency ? saved.path : [])); setUtility(null); if (!paused && !observing) dispatch({kind: "read", aircraftId: a.id, frequency});};
  const select = (id: string | null) => {
    if (watching) return;
    if (pair && id) {
      if (!view.owner || !view.connected) {setPair(null); return;}
      if (id === pair.first) return;
      void dispatch({kind: "conflict", conflict: pair.kind, aircraftId: pair.first, otherId: id}); setPair(null); return;
    }
    if (layout === "mentee" && id && exercise.aircraft.some(a => a.id === id && a.frequency === frequency)) {
      const key = `${frequency}:${id}`;
      setDismissedStrips(previous => {
        if (!Object.hasOwn(previous, key)) return previous;
        const next = {...previous}; delete next[key]; return next;
      });
    }
setVectorHeading(undefined); setVectorTarget(undefined); setQuickHidden(false); setEditMode(""); setSelectedId(id); setUtility(null); if (id !== messageId) setMessageId(null);};
  const contextAction = (action: ContextAction, a: Aircraft) => {
    if (action === "messages") openMessages(a);
    else if (action === "hold") openMessages(a, ["Request Hold", vectorTarget ? `At Waypoint (${vectorTarget.name})` : "Present Position"]);
    else if (action === "guard") {const command = {type: "atc", action: "guard", frequency, variant: "contact"} as const; void dispatch({kind: "command", aircraftId: a.id, command, frequency, text: catalogFor(AIRPORT, exercise.radarEnvironment, exercise.weather).instructionText(a, command)}); setQuickHidden(true);}
    else if (action === "remove-reminder") dispatch({kind: "edit", aircraftId: a.id, patch: {reminderAt: null}});
    else {setUtility(action); setQuickHidden(true);}
  };
  const point = (p: Point) => {
    if (!selected || layout !== "staff" || !view.owner || editMode !== "position") return;
    dispatch({kind: "edit", aircraftId: selected.id, patch: {position: p}}); setEditMode("");
  };
  const context = (a: Aircraft, onPlanTaxi?: PlanGroundTaxi) => layout === "staff" || paused || quickHidden ? null : watching ? controllerContext(a) : controllerContext(a, onPlanTaxi);
  const controllerContext = (a: Aircraft, onPlanTaxi?: PlanGroundTaxi) => mode !== "local" && a.frequency === frequency && airborne(a, AIRPORT) && !a.radar?.transferred ? quickHidden ? null : <RadarQuickPopup key={`${a.id}:${vectorHeading ?? "click"}:${vectorTarget?.index ?? "free"}`} aircraft={a} exercise={exercise} frequency={frequency} heading={vectorHeading} target={vectorTarget} connected={!paused && !view.fatal && !watching} dispatch={dispatch} onMessages={() => openMessages(a)} onAction={action => contextAction(action, a)} onSent={() => {setQuickHidden(true); setVectorHeading(undefined); setVectorTarget(undefined);}}/> : <AircraftContextMenu onPlanTaxi={onPlanTaxi} key={a.id} exercise={exercise} aircraft={a} frequency={frequency} elapsed={exercise.elapsed} connected={!paused && !view.fatal && !watching} dispatch={dispatch} onAction={action => contextAction(action, a)} onClose={() => {setQuickHidden(true); setVectorHeading(undefined); setVectorTarget(undefined);}}/>;
  const elapsed = `${String(Math.floor(exercise.elapsed / 60)).padStart(2, "0")}:${String(Math.floor(exercise.elapsed % 60)).padStart(2, "0")}`;
  if (view.fatal) return <SessionNotice title={view.code === "seat-occupied" ? `${role === "staff" ? "Control" : "Mentee"} page already in use` : view.code === "not-found" ? "Session unavailable" : "Could not join session"}><p>{view.fatal}</p><p>Session {sessionCode(sessionId, exercise.airport)}</p><button onClick={() => window.location.reload()}>Try again</button><Link href={exitPath}>{role === "mentee" ? "Return to Your sweatbox" : "Return to sessions"}</Link></SessionNotice>;
  if (!view.session) return <SessionNotice title={view.status}><Link href={exitPath}>Return to {role === "staff" ? "sessions" : "Your sweatbox"}</Link></SessionNotice>;
  return <main ref={fullscreenRoot} className={`${styles.simulator} ${liveTheme.theme} ${layout === "staff" ? styles.staffSimulator : styles.menteeSimulator} ${watching ? follow ? styles.demoLocked : styles.demoBrowsing : ""}`}>
    <div className={styles.exerciseContents} inert={hiddenByPause} aria-hidden={hiddenByPause || undefined}>
    {layout === "staff" ? <><StaffToolbar demonstrate={observing ? undefined : {on: presenting, available: view.owner && view.connected && !!view.session.menteeOccupied && !paused, onToggle: toggleDemonstration}} observer={observing ? {enabled: view.owner, connected: view.connected, onToggle: () => {transport.setControlsEnabled(!view.owner); setEditMode(""); setSpawnAt(null); setDeleteId(null); setScopeContext(null);}} : undefined} tutorial={<StaffTutorial accountId={accountId} live/>} sessionId={sessionId} sessionTitle={view.session.title} exercise={exercise} dispatch={dispatch} owner={view.owner} status={view.status} audio={<RadioAudio csrf={csrf} player={radioPlayer} accountId={accountId} role={role} exercise={exercise} connected={view.connected} scope="all"/>} onReset={() => {select(null); setEditMode("");}} scenario={!!view.scenario} onRestart={() => {if (!view.owner || !view.connected) return; void trainingRequest(csrf, `attempts/${sessionId}`, {action: "restart", attemptId: view.scenario?.attemptId}).catch(e => setTrainingError(e.message));}} onFinish={view.scenario && !view.scenario.finished ? () => setFinishing(true) : undefined} extra={view.scenario ? <LiveScenarioPanel canControl={view.owner && view.connected} scenario={view.scenario} elapsed={exercise.elapsed} running={exercise.running} connected={view.connected} onEvent={transport.scenarioEvent}/> : null}/><TrafficRoster onSpawn={() => {setScopeContext(null); setSpawnAt({});}} exercise={exercise} selected={selected} onSelect={select} dispatch={dispatch} owner={view.owner}/></> : <><nav className={styles.sidebar} aria-label="Simulator frequencies" data-demo-region="frequencies">{controlledFrequencies(exercise).map(key => <button key={key} aria-pressed={frequency === key} className={`${frequency === key ? styles.activeFrequency : ""} ${frequencyPending[key] ? styles.pendingRequest : ""}`} onClick={() => {setFrequency(key); setMessageId(null); setSelectedId(null); setVectorHeading(undefined); setQuickHidden(false);}}><span className={styles.facilityLabel}><small>{AIRPORT.icao}</small>{FREQUENCIES[key].label}</span><span className={styles.frequencyValue}>{FREQUENCIES[key].value}{frequencyPending[key] ? ` (${frequencyPending[key]})` : ""}</span></button>)}{presenting ? null : <Link href={exitPath} className={styles.exit} onClick={role === "mentee" ? event => {if (!window.confirm("Leave this session? You can rejoin from Your sweatbox.")) event.preventDefault();} : undefined}>Leave</Link>}</nav>
    <header className={styles.topBanner} data-demo-region="banner"><span>{METAR}<small>Simulation only · <a href="/sweatbox/about" target="_blank" rel="noreferrer">About & sources</a></small></span><RadioAudio csrf={csrf} player={radioPlayer} accountId={accountId} role={role} exercise={exercise} connected={view.connected} paused={paused} scope={frequency}/><span>UTC {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"}Z · Exercise {elapsed}</span><FullscreenButton target={fullscreenRoot}/></header></>}
    {frequency === "atis" && layout === "mentee" ? <AtisPanel exercise={exercise} dispatch={dispatch} connected={!paused && !view.fatal}/> : <>
      <Scope labelFrequency={frequency} messages={exercise.messages} accountId={accountId} overlay={presenting && demonstration ? <DemoTrainerBar watcher={view.session.menteeName} seconds={Math.max(0, exercise.elapsed - demonstration.startedAt)} connected={view.owner && view.connected} onHandBack={toggleDemonstration}/> : watching ? <DemoTraineeBar follow={follow} onFollow={changeFollow} sent={sent}/> : layout === "staff" ? <ConflictOverlay accountId={accountId} conflicts={exercise.conflicts} aircraft={exercise.aircraft} elapsed={exercise.elapsed} pairing={pair ? {kind: pair.kind, callsign: exercise.aircraft.find(a => a.id === pair.first)?.callsign} : null} enabled={view.owner && view.connected} onCancel={conflictId => void dispatch({kind: "cancel-conflict", conflictId})} onCancelPairing={() => setPair(null)}/> : undefined} missingStripControls={missingStripControls} elapsed={exercise.elapsed} openStripId={layout === "mentee" && messaging?.frequency === frequency ? messaging.id : undefined} weather={exercise.weather} conflictTags={layout === "staff" ? Object.fromEntries(exercise.aircraft.map(a => [a.id, conflictLabels(exercise.conflicts, a.id)])) : undefined} conflictTargets={pair ? exercise.aircraft.filter(a => a.id !== pair.first && a.active && (pair.kind !== "cancel-takeoff" || a.altitude <= AIRPORT.elevation + 1)).map(a => a.id) : undefined} focusRequest={focusRequest} onScopeContextMenu={layout === "staff" && view.owner && view.connected ? target => {setScopeContext(target); setEditMode("");} : undefined} cameraStore={scopeCameras} cameraKey={cameraKey} key={cameraKey} onDemoScope={presenting ? setScopeDemo : undefined} mirrorVector={watching ? mirror?.vectorDraft ?? null : undefined} mirrorGround={watching ? mirror?.ground ?? null : undefined} followCamera={watching && follow ? mirror?.camera : undefined} airport={AIRPORT} radarEnvironment={exercise.radarEnvironment} radarMode={mode === "local" ? undefined : mode} measureVectors={layout === "staff" && mode !== "local" && !editMode} onVector={layout === "mentee" && mode !== "local" && !view.fatal && !paused && !watching ? (id, heading, release, target) => {select(id); setVectorHeading(heading); setVectorTarget(target); setVectorAnchor(release);} : undefined} contextPoint={vectorHeading === undefined ? undefined : vectorAnchor} groundRouteMode={layout === "staff" ? "staff" : undefined} groundRouteRequest={layout === "staff" ? groundRouteRequest : undefined} onGroundClearance={layout === "staff" && view.owner && mode === "local" ? async (id, command) => await dispatch({kind: "maneuver", aircraftId: id, command}) !== false : layout === "mentee" && mode === "local" && frequency === "ground" && !view.fatal && !paused && !watching ? async (id, command) => {const a = exercise.aircraft.find(a => a.id === id); if (!a) return false; const request = pendingPilotMessage(exercise, id, frequency); return await dispatch({kind: "command", aircraftId: id, command, frequency, text: catalogFor(AIRPORT, exercise.radarEnvironment).instructionText(a, command), ...(request ? {replyTo: request.id} : {})}) !== false;} : undefined} sentGroundRoute={sentGroundRoute} groundRouteCleared={physicalRouteVisible} onTagAngle={view.connected && !paused && !watching && (layout === "mentee" || view.owner) ? (id, angle) => void dispatch({kind: "edit", aircraftId: id, patch: {tagAngle: angle}}) : undefined} pendingAircraft={pendingAircraft} autoReadback={exercise.autoReadback} running={exercise.running} aircraft={exercise.aircraft} frequency={layout === "staff" ? "all" : frequency} giveWayTargets={giveWayTargets} selected={selected?.id ?? null} onSelect={select} onPoint={point} editMode={layout === "staff" && view.owner ? editMode : ""} context={context}/>
      {layout === "staff" ? <StaffPanel prepareSpeech={radioPlayer.prepareDraft} exercise={exercise} selected={selected} dispatch={dispatch} onSelect={select} editMode={editMode} onEditMode={setEditMode} onPlanTaxi={(aircraftId, runway) => {setEditMode(""); setGroundRouteRequest({aircraftId, runway, serial: Date.now()});}} owner={view.owner} status={view.status}/> : <aside className={styles.rightPanel} aria-label="Flight strips and messages" data-demo-region="panel" inert={Boolean(messaging)} aria-hidden={Boolean(messaging) || undefined}>
        <div className={styles.strips} aria-label="Flight strips" data-demo-region="strips"><header className={styles.stripsHeader}><h2>{FREQUENCIES[frequency].label} traffic</h2><span>{exercise.aircraft.filter(a => a.frequency === frequency).length}</span></header>{flightStrips(exercise, frequency).map(a => {
          const pending = pendingRequestCount(exercise, a.id, frequency);
          const stripKey = `${frequency}:${a.id}`, latestRequest = exercise.messages.filter(m => m.aircraftId === a.id && m.frequency === frequency && m.sender === "pilot").at(-1)?.id ?? null;
          if (Object.hasOwn(dismissedStrips, stripKey) && dismissedStrips[stripKey] === latestRequest) return null;
          return <ControllerStrip key={a.id} aircraft={a} {...controllerStripText(a, AIRPORT, exercise.radarEnvironment ?? radarEnvironmentFor(AIRPORT), exercise.messages)} selected={selectedId === a.id} pending={pending} reminder={a.reminderAt !== null && a.reminderAt <= exercise.elapsed} connected={view.connected} onSelect={() => {setQuickHidden(true); setSelectedId(a.id); setVectorHeading(undefined); setVectorTarget(undefined); setMessageId(null);}} onFocus={() => {setSelectedId(null); setFocusRequest({id: a.id, serial: Date.now()});}} onMessages={() => openMessages(a)} onDismiss={() => {setDismissedStrips(previous => ({...previous, [stripKey]: latestRequest})); if (selectedId === a.id) select(null);}}/>;
        })}</div>
        <MessageLog airport={AIRPORT} messages={exercise.messages} frequency={frequency} compact/>
      </aside>}
    </>}
    {messaging && layout === "mentee" && messaging.frequency === frequency ? <><CommandMenuConnector aircraftId={messaging.id} rootRef={fullscreenRoot}/><button className={styles.messageBackdrop} aria-label="Dismiss aircraft messages" onClick={() => {if (!watching) setMessageId(null);}}/><MessagePanel prepareSpeech={radioPlayer.prepareDraft} key={`${messaging.id}:${frequency}:${messagePath.join("/")}`} initialPath={messagePath} onPathChange={path => {menuPaths.current.set(messaging.id, {frequency, path}); setLivePath(path);}} holdTarget={vectorTarget} aircraft={messaging} exercise={exercise} frequency={frequency} quickCommands={view.quickCommands} connected={!paused && !view.fatal && !watching} dispatch={dispatch} onClose={() => {if (!watching) setMessageId(null);}}/></> : null}
    {scopeContext && layout === "staff" ? <MentorContextMenu local={mode === "local"} onConflict={kind => {const a = exercise.aircraft.find(a => a.id === scopeContext.aircraftId); if (!a || a.altitude <= AIRPORT.elevation + 1 || !["pattern", "heading"].includes(a.mode)) {setTrainingError("Select an airborne arrival first."); setScopeContext(null); return;} if (kind === "uwc" && a.landing !== "touch-and-go") {setTrainingError("UWC requires touch-and-go intentions."); setScopeContext(null); return;} if (kind === "ga" && a.landing !== "full-stop") {setTrainingError("GA requires full-stop intentions for the first aircraft."); setScopeContext(null); return;} setPair({kind, first: a.id}); setSelectedId(a.id); setScopeContext(null); setEditMode("");}} target={scopeContext} callsign={exercise.aircraft.find(a => a.id === scopeContext.aircraftId)?.callsign} enabled={view.owner && view.connected} onClose={() => setScopeContext(null)} onSpawn={() => {setSpawnAt({point: scopeContext.point}); setScopeContext(null);}} onDelete={() => {setDeleteId(scopeContext.aircraftId!); setScopeContext(null);}}/> : null}
    {spawnAt && layout === "staff" ? <SpawnAircraftDialog accountId={accountId} exercise={exercise} position={spawnAt.point} enabled={view.owner && view.connected} dispatch={dispatch} onSpawned={select} onClose={() => setSpawnAt(null)}/> : null}
    {deleteId && layout === "staff" && exercise.aircraft.find(a => a.id === deleteId) ? <DeleteAircraftDialog aircraft={exercise.aircraft.find(a => a.id === deleteId)!} enabled={view.owner && view.connected} dispatch={dispatch} onDeleted={() => {if (selectedId === deleteId) select(null);}} onClose={() => setDeleteId(null)}/> : null}
    {utility && selected && !paused ? <UtilityPanel airport={AIRPORT} label={utility} aircraft={selected} dispatch={dispatch} onClose={() => setUtility(null)}/> : null}
    {paused && !hiddenByPause ? <div className={styles.visiblePause} role="status">Exercise paused · Viewing only</div> : null}
    {!view.connected || view.status.startsWith("Connection interrupted") ? <div className={styles.connectionBanner} role="status" aria-live="polite">{view.status}<span>{view.queuedCommands > 0 ? `${view.queuedCommands} command${view.queuedCommands === 1 ? "" : "s"} waiting for acknowledgement` : "Your scenario is saved. Waiting for the connection to return."}</span>{view.queuedCommands > 0 ? <button onClick={transport.cancelQueued}>Cancel unsent commands</button> : null}</div> : null}
    {layout === "staff" && mode !== "local" && exercise.terrainStatus === "unavailable" ? <div className={styles.terrainImpactStatus} role="status">Terrain impact checks are delayed or unavailable. Unsampled terrain is not assumed clear.</div> : null}
    {finishing && view.scenario ? <FinishAttemptDialog sessionId={sessionId} csrf={csrf} scenario={view.scenario} elapsed={exercise.elapsed} canControl={view.owner && view.connected} onClose={() => setFinishing(false)}/> : null}
    {trainingError ? <div className={styles.error} role="alert">{trainingError}<button aria-label="Dismiss scenario error" onClick={() => setTrainingError("")}>×</button></div> : null}
    {view.error ? <div className={styles.error} role="alert">{view.error}<button aria-label="Dismiss error" onClick={transport.clearError}>×</button></div> : null}
    <div className={styles.rotatePrompt}><h1>Sweatbox</h1><p>Rotate your phone or tablet to landscape, or use a larger screen.</p><Link href={exitPath}>Return to Sweatbox</Link></div>
    </div>
    {hiddenByPause ? <section className={styles.pauseScreen} role="status" aria-labelledby="exercise-paused-title"><Pause size={40} weight="fill" aria-hidden="true"/><h1 id="exercise-paused-title" ref={pauseTitle} tabIndex={-1}>{view.session.scenario?.finished ? "Exercise finished" : "Exercise paused"}</h1><Link href={exitPath}>Exit simulator</Link></section> : null}
    {watching ? <DemoGhost subscribe={transport.onDemo} root={fullscreenRoot} camera={scopeCamera}/> : null}
    {handedBack ? <div className={`${styles.visiblePause} ${styles.demoHandedBack}`} role="status">You have control again</div> : null}
    <CrashAlert exercise={exercise} connected={view.connected} paused={paused}/>
  </main>;
}
function UtilityPanel({airport, label, aircraft: a, dispatch, onClose}: {airport: Airport; label: ContextAction; aircraft: Aircraft; dispatch: (a: Action) => void; onClose: () => void}) {
  const edit = (patch: Partial<Aircraft>) => {dispatch({kind: "edit", aircraftId: a.id, patch}); onClose();};
  return <section className={`${styles.utility} ${label === "information" ? styles.aircraftInformation : ""}`} role="dialog" aria-label={CONTEXT_ACTIONS[label]} aria-modal={label === "information" ? undefined : true}><header>{CONTEXT_ACTIONS[label]}<button aria-label="Close dialog" onClick={onClose}>×</button></header>
    {label === "information" ? <dl><dt>Callsign</dt><dd>{a.callsign}</dd><dt>Aircraft</dt><dd>{a.type}</dd><dt>Altitude</dt><dd>{Math.round(a.altitude)}ft MSL</dd><dt>Heading</dt><dd>{magneticHeadingLabel(a.heading, airport)}°M</dd><dt>Speed</dt><dd>{Math.round(a.speed)}KT</dd><dt>Frequency</dt><dd>{a.frequency ? a.frequency.toUpperCase() : "Not tuned"}</dd><dt>Destination</dt><dd>{a.destination?.name ?? airport.icao}</dd><dt>Assigned runway</dt><dd>{a.runway ?? "—"}</dd><dt>Assigned altitude</dt><dd>{a.radar?.targetAltitude ? a.radar.targetAltitude.unit === "feet" ? `${a.radar.targetAltitude.value}ft` : `FL${a.radar.targetAltitude.value}` : "—"}</dd><dt>Flight plan</dt><dd>{a.flightPlan.length ? <ol>{a.flightPlan.map((point, index) => <li key={index}>{point.name ?? `Waypoint ${index + 1}`}</li>)}</ol> : "No flight plan"}</dd></dl> : null}
    {label === "tag" ? <div className={styles.colorChoices}>{(["auto", "default"] as const).map(tag => <button key={tag} onClick={() => edit({tag})}>{tag === "auto" ? "Automatic Position" : tag === "default" ? "Default Position" : tag === "left" ? "Left" : "Right"}</button>)}</div> : null}
  </section>;
}
