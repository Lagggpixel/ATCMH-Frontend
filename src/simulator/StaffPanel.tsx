"use client";
import FacilityControls from "./FacilityControls";
import PerformanceControls from "./PerformanceControls";
import {approachOptions} from "./aviation";
import {ALTITUDES, altitudeLabel} from "./radar";
import {magneticHeadingLabel} from "./magnetic-headings";
import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import Link from "next/link";
import {Airplane} from "@phosphor-icons/react/dist/csr/Airplane";
import {ArrowsClockwise} from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import PauseControls from "./PauseControls";

import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import {Users} from "@phosphor-icons/react/dist/csr/Users";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {engineFor, readbackText} from "./engine";
import {getAirport, defaultRunway, runwayEnds, frequenciesFor, trainingMode} from "./airports";
import {RadarSeedControls, RadarStaffControls} from "./RadarControls";
import {radarEnvironmentFor, radarGuidanceLabel} from "./radar";

import {catalogFor, positionReportText} from "./catalog";
import {planTaxiRoute} from "./taxi-routing";


import {arrivalWorkflow} from "./arrival-workflow";
import { intentionsOf, pendingCommands, stripRunway, type Action, type Aircraft, type Exercise, type Frequency, type Instruction, type Leg, type Runway, type Direction} from "./model";
import {sessionCode, sessionPath} from "./sessions";
import {MessageLog} from "./MessagePanel";
import IntentionsControls from "./IntentionsControls";
import AutomaticHelp from "./AutomaticHelp";
import LandingOutcomeControl from "./LandingOutcomeControl";
import SpeedControls from "./SpeedControls";
import DeleteAircraftDialog from "./DeleteAircraftDialog";
import styles from "./Simulator.module.css";
import workspace from "./StaffWorkspace.module.css";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretUp} from "@phosphor-icons/react/dist/csr/CaretUp";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
interface Props {exercise: Exercise; selected: Aircraft | undefined; dispatch: (a: Action) => void | boolean | Promise<boolean>; onSelect: (id: string | null) => void; editMode: string; onEditMode: (mode: string) => void; holdPoint: boolean; onHoldPoint: (value: boolean) => void; owner: boolean; status: string; prepareSpeech?: (text: string) => () => void}


function StaffMenu({children}: {children: ReactNode}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node) && !document.querySelector("dialog[open]")) ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <details ref={ref} className={workspace.sessionMenu} data-simulator-tour="session-menu" onKeyDown={event => {
    if (event.key === "Escape" && ref.current?.open && !document.querySelector("dialog[open]")) {
      event.stopPropagation(); ref.current.open = false; ref.current.querySelector("summary")?.focus();
    }
  }}><summary>Session <CaretDown aria-hidden="true"/></summary><div className={workspace.sessionMenuContent}>{children}</div></details>;
}

function aircraftPhase(a: Aircraft) {
  if (a.radar?.departure) return a.radar.departure.phase === "roll" ? "Takeoff roll" : "Initial climb";
  if (a.mode === "pattern") return a.leg === "final" ? "Final" : "Pattern";
  if (a.mode === "parked") return "Parked";
  if (a.mode === "taxi") return "Taxi";
  if (a.mode === "pushback") return "Pushback";
  if (["lineup", "takeoff", "rollout"].includes(a.mode)) return "Ground";
  return "Airborne";
}

export function StaffToolbar({exercise, dispatch, owner, status, onReset, audio, sessionId, sessionTitle, scenario = false, onRestart, extra, tutorial, observer}: Pick<Props, "exercise" | "dispatch" | "owner" | "status"> & {onReset: () => void; audio: ReactNode; sessionId: string; sessionTitle: string; scenario?: boolean; onRestart?: () => void; extra?: ReactNode; tutorial?: ReactNode; observer?: {enabled: boolean; connected: boolean; onToggle: () => void}}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const elapsed = `${String(Math.floor(exercise.elapsed / 60)).padStart(2, "0")}:${String(Math.floor(exercise.elapsed % 60)).padStart(2, "0")}`;
  return <header data-simulator-tour="toolbar" className={styles.staffToolbar}><Link data-simulator-tour="return-sessions" href="/sweatbox/staff" aria-label="Return to sessions">ATCMH Sweatbox</Link><span className={styles.staffTitle} title={`${sessionTitle} · ${sessionId}`}>/ <span>{sessionCode(sessionId, exercise.airport)}</span></span>{audio}{observer ? <div className={styles.ownerObserver}><span>Owner observing</span><button type="button" aria-pressed={observer.enabled} disabled={!observer.connected} onClick={observer.onToggle}>{observer.enabled ? "Disable controls" : "Enable controls"}</button></div> : null}<span className={styles.exerciseStatus} title={status}><span>{owner ? exercise.running ? "Running" : "Paused" : status}</span> <time>{elapsed}</time></span><PauseControls exercise={exercise} owner={owner} dispatch={dispatch}/>{extra}<StaffMenu><FacilityControls exercise={exercise} dispatch={dispatch} connected={owner}/><div data-simulator-tour="automatic" className={styles.automaticRow}><button className={styles.autoReadback} role="switch" aria-checked={!!exercise.autoReadback} disabled={!owner} onClick={() => dispatch({kind: "auto-readback", enabled: !exercise.autoReadback})}><span><strong>Automatic pilot actions</strong></span><span className={styles.autoReadbackSwitch} aria-hidden="true"/></button><AutomaticHelp/></div>{tutorial}<a href="/sweatbox/about" target="_blank" rel="noreferrer" title="Independent training tool; simulation only">About & sources</a><button disabled={!owner} onClick={() => setConfirmReset(true)}><ArrowsClockwise/>{scenario ? "Restart" : "Reset"}</button>{!observer ? <><button disabled={!owner || !exercise.aircraft.length} onClick={() => dispatch({kind: "all-full-stop"})}>All aircraft full stop</button><a className={styles.openMentee} href={sessionPath("mentee", sessionId)} target="_blank" rel="noreferrer"><Users/>Open mentee</a></> : null}</StaffMenu>{confirmReset ? <div className={styles.resetBackdrop}><section role="alertdialog" aria-modal="true" aria-labelledby="reset-exercise-title" aria-describedby="reset-exercise-description" className={styles.resetDialog} onKeyDown={e => {if (e.key === "Escape") setConfirmReset(false); if (e.key === "Tab") {const buttons = e.currentTarget.querySelectorAll("button"); if (e.shiftKey && document.activeElement === buttons[0]) {e.preventDefault(); buttons[1].focus();} else if (!e.shiftKey && document.activeElement === buttons[1]) {e.preventDefault(); buttons[0].focus();}}}}><h2 id="reset-exercise-title">{scenario ? "Restart attempt?" : "Reset exercise?"}</h2><p id="reset-exercise-description">Restore the sample traffic and clear this session’s changes and messages.</p><div><button autoFocus onClick={() => setConfirmReset(false)}>Cancel</button><button className={styles.primaryButton} disabled={!owner} onClick={() => {if (scenario) onRestart?.(); else dispatch({kind: "reset"}); onReset(); setConfirmReset(false);}}>{scenario ? "Restart attempt" : "Reset exercise"}</button></div></section></div> : null}</header>;
}

export function TrafficRoster({exercise, selected, onSelect, owner, onSpawn}: Pick<Props, "exercise" | "selected" | "onSelect" | "dispatch" | "owner"> & {onSpawn: () => void}) {
  const AIRPORT = getAirport(exercise), FREQUENCIES = frequenciesFor(AIRPORT);
  const [query, setQuery] = useState("");
  return <aside data-simulator-tour="traffic" className={`${styles.trafficRoster} ${workspace.roster}`} aria-label="Traffic"><header><h1>Aircraft <small>{exercise.aircraft.length}</small></h1><button disabled={!owner || exercise.aircraft.length >= 50} onClick={onSpawn}><Plus aria-hidden="true"/>Add</button></header>
    <label className={workspace.search}><span className={workspace.srOnly}>Search aircraft</span><input type="search" placeholder="Search callsign" value={query} onChange={event => setQuery(event.target.value)}/><MagnifyingGlass aria-hidden="true"/></label>

    <div className={`${styles.trafficList} ${workspace.list}`}>
      {exercise.aircraft.filter(a => `${a.callsign} ${a.type}`.toLowerCase().includes(query.trim().toLowerCase())).map(a => {
        const unanswered = pendingCommands(exercise, a.id).length;
        const unable = a.radar?.patternJoin?.status === "unable";
        return <button key={a.id} className={`${styles.trafficCard} ${workspace.row} ${a.id === selected?.id ? workspace.selectedRow : ""}`} aria-pressed={a.id === selected?.id} onClick={() => onSelect(a.id)}>
          <span className={workspace.rowIdentity}><strong>{a.callsign}</strong><small>{a.type} · {a.frequency ? `${FREQUENCIES[a.frequency].label} ${FREQUENCIES[a.frequency].value}` : "No frequency"}</small></span>
          <span className={workspace.rowState}><span>{aircraftPhase(a)}</span>{unanswered > 0 ? <em>{unanswered} {unanswered === 1 ? "reply" : "replies"}</em> : null}{unable ? <span className={workspace.warning} role="alert">Unable to join</span> : null}</span>
        </button>;
      })}
      {!exercise.aircraft.length ? <p className={workspace.rosterEmpty}>No aircraft yet. Add traffic to begin.</p> : query.trim() && !exercise.aircraft.some(a => `${a.callsign} ${a.type}`.toLowerCase().includes(query.trim().toLowerCase())) ? <p className={workspace.rosterEmpty}>No matching aircraft.</p> : null}
    </div>
  </aside>;
}
const radioTasks = [
  ["reply", "Reply to controller"], ["request", "Send pilot request"], ["custom", "Custom pilot message"],
  ["aircraft-log", "Aircraft message history"], ["global-log", "Session message log"], ["expectations", "Arrival expectations"],
] as const;
const setupTasks = [["intentions", "Intentions"], ["routes", "Routes & position"], ["details", "Aircraft details"], ["speeds", "Speed settings"]] as const;
const tabs = ["Radio", "Flight", "Setup"] as const;

export default function StaffPanel(props: Props) {
  const {selected: a, onEditMode} = props;
  const frequencies = frequenciesFor(getAirport(props.exercise));
  const [tab, setTab] = useState<typeof tabs[number]>("Radio");
  const [radioTask, setRadioTask] = useState<string>("reply"), [setupTask, setSetupTask] = useState<string>("intentions");
  const [flightTask, setFlightTask] = useState("flight");
  const [expanded, setExpanded] = useState(false), [collapsed, setCollapsed] = useState(false);
  const id = useId();
  const section = tab === "Radio" ? radioTask : tab === "Setup" ? setupTask : flightTask;
  const waiting = a ? pendingCommands(props.exercise, a.id).length : 0;
  const tasks = tab === "Radio" ? radioTasks : setupTasks;
  const changeTab = (next: typeof tabs[number]) => {setTab(next); onEditMode("");};
  const more = (task: string) => {
    if (task === "expand") setExpanded(value => !value);
    else if (task === "navigation" || task === "pattern") {setTab("Flight"); setFlightTask(task);}
    else if (task === "global-log") {setTab("Radio"); setRadioTask(task);}
    else {setTab("Setup"); setSetupTask(task);}
    onEditMode("");
  };
  return <section data-simulator-tour="aircraft-controls" className={`${styles.staffPanel} ${workspace.panel}`} aria-label="Staff controls" data-section={section} data-expanded={expanded} data-collapsed={collapsed}>
    <header className={workspace.identity}>
      {a ? <><div className={workspace.selectedIdentity}><strong>{a.callsign}</strong><small>{a.type} · {aircraftPhase(a)}</small></div>
        <label className={workspace.frequency}>Frequency<select aria-label="Aircraft frequency" disabled={!props.owner} value={a.frequency ?? "none"} onChange={e => props.dispatch({kind: "edit", aircraftId: a.id, patch: {frequency: e.target.value === "none" ? null : e.target.value as Frequency}})}>
          <option value="ground">{frequencies.ground.label} · {frequencies.ground.value}</option><option value="tower">{frequencies.tower.label} · {frequencies.tower.value}</option>
          {trainingMode(props.exercise) !== "local" ? <><option value="approach">Approach</option><option value="center">Center</option></> : null}
          <option value="none">No frequency</option>{a.frequency === "atis" ? <option value="atis" disabled>ATIS</option> : null}
        </select></label><div className={workspace.runway}><small>Runway</small><span>{stripRunway(a)}</span></div></> : <strong>No aircraft selected</strong>}
      <button className={workspace.collapse} aria-label={collapsed ? "Show aircraft controls" : "Collapse aircraft controls"} aria-expanded={!collapsed} onClick={() => {setCollapsed(value => !value); onEditMode("");}}>{collapsed ? <CaretUp/> : <CaretDown/>}</button>
    </header>
    {!collapsed ? <><div className={workspace.navigation}>
      <div role="tablist" aria-label="Aircraft controls" className={workspace.tabs}>
        {tabs.map(label => <button key={label} role="tab" id={`${id}-${label}`} aria-selected={tab === label} aria-controls={`${id}-content`} tabIndex={tab === label ? 0 : -1} disabled={!a && label !== "Radio"} onClick={() => changeTab(label)} onKeyDown={event => {
          const available: readonly (typeof tabs[number])[] = a ? tabs : ["Radio"];
          const index = available.indexOf(label);
          const next = event.key === "Home" ? available[0] : event.key === "End" ? available.at(-1) : event.key === "ArrowRight" ? available[(index + 1) % available.length] : event.key === "ArrowLeft" ? available[(index + available.length - 1) % available.length] : undefined;
          if (next) {event.preventDefault(); changeTab(next); document.getElementById(`${id}-${next}`)?.focus();}
        }}>{label}</button>)}
      </div>
      <select className={workspace.more} aria-label="More aircraft actions" value="" onChange={event => more(event.target.value)}>
        <option value="" disabled>More actions</option><option value="expand">{expanded ? "Reduce panel" : "Expand panel"}</option>
        <option value={a?.radar ? "navigation" : "pattern"} disabled={!a}>{a?.radar ? "Navigation & recovery" : "Pattern controls"}</option>
        <option value="speeds" disabled={!a}>Speed settings</option><option value="details" disabled={!a}>Aircraft details & removal</option><option value="global-log">Session message log</option>
      </select>
    </div>
    <div className={workspace.body} id={`${id}-content`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {tab !== "Flight" ? <div className={workspace.taskBar}><select aria-label={tab === "Radio" ? "Radio task" : "Setup task"} value={section} onChange={event => {if (tab === "Radio") setRadioTask(event.target.value); else setSetupTask(event.target.value); onEditMode("");}}>
        {tasks.map(([value, label]) => <option key={value} value={value} disabled={!a && value !== "global-log"}>{label}</option>)}
      </select>{tab === "Radio" && waiting > 0 ? <span className={workspace.pending}>{waiting} awaiting {waiting === 1 ? "reply" : "replies"}</span> : null}</div> : flightTask !== "flight" ? <div className={workspace.taskBar}><strong>{flightTask === "navigation" ? "Navigation & recovery" : "Pattern controls"}</strong><button onClick={() => {setFlightTask("flight"); onEditMode("");}}>Back to flight controls</button></div> : null}
      <div className={`${styles.controlContent} ${workspace.content}`}>
        {section === "global-log" ? <MessageLog showUnableReasons airport={getAirport(props.exercise)} messages={props.exercise.messages} frequency="all" title="Session message log"/> : section === "aircraft-log" && a ? <MessageLog showUnableReasons airport={getAirport(props.exercise)} key={a.id} messages={props.exercise.messages} frequency="all" aircraftId={a.id} title={`${a.callsign} message history`}/> : a ? <AircraftControls key={a.id} {...props} selected={a} section={section}/> : <div className={styles.staffEmpty}><Airplane size={28}/><strong>Select an aircraft to begin</strong><p>Or choose Session message log above.</p></div>}
      </div>
    </div></> : null}
  </section>;
}

function AircraftControls({exercise, selected: a, dispatch, onSelect, editMode, onEditMode, holdPoint, onHoldPoint, owner, section, prepareSpeech}: Props & {selected: Aircraft; section: string}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [headingDraft, setHeading] = useState<string | null>(null);
  const heading = headingDraft ?? String(magneticHeadingLabel(a.targetHeading, getAirport(exercise)));
  const AIRPORT = getAirport(exercise);
  const {runwayGeometry, sequenceStatus, validateAssignment: validateInstruction} = engineFor(exercise);
  const {pilotRequests, pilotRequestText} = catalogFor(AIRPORT, exercise.radarEnvironment, exercise.weather);
  const [requestId, setRequestId] = useState(a.frequency === "ground" ? "taxi-runway" : "runway-change");
  const remainingInPattern = intentionsOf(a).flight === "pattern";
  const [direction, setDirection] = useState<Direction>(a.radar?.departureDirection ?? "north");
  const [includeRunway, setIncludeRunway] = useState(true);
  const [entry,setEntry]=useState<"Left Traffic"|"Right Traffic"|"Straight In">("Straight In"), [takeoffDirection,setTakeoffDirection]=useState<Direction|"Straight Out">("north");
  const [inbound,setInbound]=useState<"default"|"runway"|"ils"|"gps"|"visual">("default"), [requestAltitude,setRequestAltitude]=useState(5000),[position,setPosition]=useState<NonNullable<import("./model").PilotRequestSelection["position"]>>("Final"),[outcome,setOutcome]=useState<Aircraft["landing"]|undefined>(),[confirmed,setConfirmed]=useState(false),[approachId,setApproachId]=useState("");
  const approaches=approachOptions(a,AIRPORT,(exercise.radarEnvironment??radarEnvironmentFor(AIRPORT)).approaches);
  const [runway, setRunway] = useState<Runway>(a.runway ?? defaultRunway(AIRPORT));
  const [response, setResponse] = useState("");
  const [routeError, setRouteError] = useState("");
  const edit = (patch: Partial<Aircraft>) => dispatch({kind: "edit", aircraftId: a.id, patch});
  const maneuver = (command: Instruction) => dispatch({kind: "maneuver", aircraftId: a.id, command});
  const extendingDownwind = a.mode === "pattern" && a.leg === "downwind" && a.extended;
  const downwindAction: Instruction = extendingDownwind ? {type: "pattern", leg: "base"} : {type: "extend", leg: "downwind"};
  const requests = pilotRequests(a), request = requests.find(r => r.id === requestId) ?? requests[0];
  const preview = request ? pilotRequestText(a, request, runway, remainingInPattern, {direction, takeoffDirection, entry, includeRunway, exercise, inbound, altitude:ALTITUDES.find(v=>(v.unit==="feet"?v.value:v.value*100)===requestAltitude),position,outcome,approachId}) : a.radar?.departure ? "Pilot checks in after the initial climb, at 1,000 ft AGL." : "Choose a controller frequency to send a request.";
  const sentRequest = [...exercise.messages].reverse().find(m => m.aircraftId === a.id && m.sender === "pilot" && !m.commandId && m.text === preview);
  const waiting = pendingCommands(exercise, a.id);
  const lastCommand = waiting.at(-1);
  const latestController = exercise.messages.filter(m => m.aircraftId === a.id && m.sender === "controller" && !m.retractedBy).at(-1);
  const radio = latestController?.instruction?.type === "radio" ? latestController.instruction.message : undefined;
  const assignmentError = lastCommand?.instruction ? validateInstruction(a, lastCommand.instruction, lastCommand.frequency) : "Older message: use flight controls to assign manually.";
  const canMessage = !!a.frequency && a.frequency !== "atis";
  const speechDraft = response.trim() ? `${response.trim()}, ${a.callsign}` : request ? preview : "";
  useEffect(() => {if (owner && canMessage && (section === "request" || section === "custom") && speechDraft) return prepareSpeech?.(speechDraft);}, [owner, canMessage, section, speechDraft, prepareSpeech]);
  const arrival = arrivalWorkflow(exercise, a);
  const reply = (unable = false, assign = false) => {if (lastCommand) dispatch({kind: "pilot", aircraftId: a.id, text: unable ? `Unable, ${a.callsign}` : readbackText(a.callsign, lastCommand.text, lastCommand.instruction), replyTo: lastCommand.id, assign});};
  return <fieldset disabled={!owner} className={`${styles.controlFields} ${workspace.fields}`}>
    {section === "expectations" && sequenceStatus(a, exercise.aircraft) ? <p className={styles.controlHint} role="status">{sequenceStatus(a, exercise.aircraft)}</p> : null}
    {section === "expectations" ? <>
      {arrival ? <section className={styles.arrivalExpectations} aria-label="Mentor arrival expectations"><strong>Expected replies · mentor only · runway {arrival.runway}</strong><ol><li>Pattern Entry · {arrival.entry ? "Sent" : "Awaiting"}</li><li>Sequence · {arrival.sequenceRequired ? arrival.sequence ? "Sent" : "Awaiting — aircraft is not first" : "Not required — aircraft is first"}</li><li>{arrival.option ? "Option" : "Landing"} Clearance · {arrival.clearance ? "Sent in order" : "Awaiting"}</li></ol></section> : null}
      {!arrival ? <p className={styles.controlHint}>No arrival expectations for this aircraft.</p> : null}
    </> : null}
    {section === "request" ? <>
      {!a.radar && request?.id === "report-position" ? <div className={styles.requestPreview}><label>Current position<output>{positionReportText(a, AIRPORT)}</output></label><button disabled={!a.active || a.frequency !== "tower" || !["pattern", "heading", "go-around"].includes(a.mode)} onClick={() => dispatch({kind: "report-position", aircraftId: a.id})}>Report current position</button></div> : null}
      <div className={styles.requestFields}><label>Request<select aria-label="Pilot request" disabled={!request} value={request?.id ?? ""} onChange={e => {setRequestId(e.target.value);setConfirmed(false);}}>{requests.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>{request?.id === "departure-direction" ? <label>Departure direction<select aria-label="Departure direction" value={direction} onChange={e => setDirection(e.target.value as Direction)}>{["north", "east", "south", "west"].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label> : request?.runway && (request.id !== "taxi-runway" || includeRunway) ? <label>Requested runway<select value={runway} onChange={e => setRunway(e.target.value as Runway)}>{runwayEnds(AIRPORT).map(end => <option key={end.id}>{end.id}</option>)}</select></label> : <span/>}</div>
      {request?.id === "inbound-land" || request?.id === "inbound-option" ? <label>Inbound call<select aria-label="Inbound call" value={inbound} onChange={e=>setInbound(e.target.value as typeof inbound)}><option value="default">Send</option><option value="runway">Request Specific Runway</option><option value="ils">On the ILS</option><option value="gps">On the GPS</option><option value="visual">On the Visual</option></select></label>:null}
      {request?.id === "altitude-change"?<label>Requested altitude<select value={requestAltitude} onChange={e=>setRequestAltitude(Number(e.target.value))}>{ALTITUDES.map(v=><option key={altitudeLabel(v)} value={v.unit==="feet"?v.value:v.value*100}>{altitudeLabel(v)}</option>)}</select></label>:null}
      {request?.id === "request-approach"?<label>Requested approach<select aria-label="Requested approach" value={approachId} onChange={e=>setApproachId(e.target.value)}><option value="">Pilot preference</option>{approaches.map(p=><option key={p.id} value={p.id}>{p.type.toUpperCase()} · {p.airportIcao??AIRPORT.icao} {p.runway}</option>)}</select></label>:null}
      {request?.id === "report-position" || request?.id === "unicom-position"?<><label>Position<select aria-label="Reported position" value={position} onChange={e=>setPosition(e.target.value as typeof position)}>{["Right Downwind","Left Downwind","Right Base","Left Base","Final",...(request?.id==="unicom-position"?["Left Crosswind","Right Crosswind"]:[])].map(p=><option key={p}>{p}</option>)}</select></label><label>Landing intention<select value={outcome??""} onChange={e=>setOutcome(e.target.value?e.target.value as Aircraft["landing"]:undefined)}><option value="">Send</option><option value="touch-and-go">Touch &amp; Go</option><option value="full-stop">Full Stop</option></select></label></>:null}
      {request?.id === "unicom-inbound" ? <><label>Landing intention<select value={outcome??"full-stop"} onChange={e=>setOutcome(e.target.value as Aircraft["landing"])}><option value="full-stop">Landing</option><option value="touch-and-go">Touch and Goes</option></select></label><label>Pattern entry<select value={entry} onChange={e=>setEntry(e.target.value as typeof entry)}>{["Left Traffic","Right Traffic","Straight In"].map(value=><option key={value}>{value}</option>)}</select></label></>:null}
      {request?.id === "unicom-takeoff" ? <><label><input type="checkbox" checked={remainingInPattern} onChange={e=>edit({intentions:{...intentionsOf(a),flight:e.target.checked?"pattern":"departure"}})}/>Remaining in the Pattern</label>{!remainingInPattern?<label>Departure direction<select value={takeoffDirection} onChange={e=>setTakeoffDirection(e.target.value as typeof takeoffDirection)}>{["north","east","south","west","Straight Out"].map(value=><option key={value}>{value}</option>)}</select></label>:null}</>:null}
      {request?.id === "minimum-fuel" || request?.id === "emergency-fuel"?<label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirm? (Warning: Remaining Fuel Quantity of {Math.round(a.fuel?.enduranceMinutes??0)} mn is known by ATC)</label>:null}
      {request?.id === "departure" ? <label className={styles.checkLabel}><input type="checkbox" checked={remainingInPattern} onChange={e => edit({intentions: {...intentionsOf(a), flight: e.target.checked ? "pattern" : "departure"}})}/>Remaining in the pattern</label> : null}
      {request?.id === "taxi-runway" ? <label className={styles.checkLabel}><input type="checkbox" checked={includeRunway} onChange={e => setIncludeRunway(e.target.checked)}/>Include requested runway</label> : null}
      {(request?.id === "taxi-runway" || request?.id === "pushback") && !exercise.publishedDraft ? <p className={styles.controlHint}>No ATIS published.</p> : null}
      <div className={styles.requestPreview}><label>Message preview<output>{preview}</output></label><button className={styles.primaryButton} disabled={!canMessage || !request || (["minimum-fuel","emergency-fuel"].includes(request.id)&&!confirmed)} onClick={() => request && dispatch({kind: "pilot", aircraftId: a.id, text: preview, request: {id: request.id, runway, direction, takeoffDirection, entry, remainingInPattern, includeRunway, inbound,altitude:ALTITUDES.find(v=>(v.unit==="feet"?v.value:v.value*100)===requestAltitude),position,outcome,confirmed,approachId:approachId||undefined}})}>{sentRequest ? "Send again" : "Send request"}</button></div>
    </> : null}
    {section === "reply" ? <>
      <div className={`${styles.controllerResponse} ${workspace.reply}`}><label>Last controller command{waiting.length > 1 ? ` · ${waiting.length} awaiting response` : ""}<output>{lastCommand?.text ?? (radio ? latestController?.text : undefined) ?? "No command awaiting response"}</output><small className={styles.controlHint}>Readback only leaves aircraft movement unchanged.</small></label><div className={`${styles.responseButtons} ${workspace.replyButtons}`}><button disabled={!lastCommand || !canMessage} title={lastCommand?.instruction?.type === "frequency" ? "Read back only; the aircraft stays on its current frequency." : "Read back without assigning the instruction"} onClick={() => reply()}>Readback only</button><button className={styles.primaryButton} disabled={!lastCommand || !canMessage || !!assignmentError} title={lastCommand ? assignmentError ?? "Acknowledge and follow this instruction" : undefined} onClick={() => reply(false, true)}>{lastCommand?.instruction?.type === "frequency" && lastCommand.instruction.frequency ? lastCommand.instruction.whenReady ? "Readback & queue switch" : "Readback & switch" : "Readback & follow"}</button><button disabled={!lastCommand || !canMessage} onClick={() => reply(true)}>Unable</button></div></div>
      {!canMessage || lastCommand && assignmentError ? <p className={styles.controlHint}>{!canMessage ? "Select a controller frequency to send messages." : assignmentError}</p> : null}
    </> : null}
    {section === "custom" ? <>
      <section className={workspace.customMessage}><h2>Custom pilot message</h2><div className={styles.buttonRow}><input aria-label="Other pilot response" placeholder="Enter a pilot message" maxLength={1000} value={response} onChange={e => setResponse(e.target.value)}/><button disabled={!canMessage || !response.trim()} onClick={() => {dispatch({kind: "pilot", aircraftId: a.id, text: `${response.trim()}, ${a.callsign}`}); setResponse("");}}>Send response</button></div></section>
    </> : null}
    {section === "intentions" ? a.radar ? <RadarSeedControls aircraft={a} airport={AIRPORT} environment={exercise.radarEnvironment ?? radarEnvironmentFor(AIRPORT)} onEdit={edit} staffCompact includeRoutes={false}/> : <IntentionsControls airport={AIRPORT} aircraft={a} onEdit={edit} staffCompact/> : null}
    {(section === "flight" || section === "navigation") && a.radar ? <RadarStaffControls aircraft={a} exercise={exercise} onManeuver={maneuver} staffView={section === "navigation" ? "navigation" : "flight"}/> : null}
    {section === "flight" && !a.radar ? <><div className={workspace.flightForm}>
      <div className={workspace.vectorGroup}><label>Heading (°M)<input aria-label="Heading override" type="number" min="0" max="360" step="10" value={heading} onChange={event => setHeading(event.target.value)}/></label><button className={workspace.primary} disabled={!heading.trim() || !!validateInstruction(a, {type: "heading", value: Number(heading)})} onClick={() => {maneuver({type: "heading", value: Number(heading)}); setHeading(null);}}>Set heading</button></div>
      <LocalSpeed aircraft={a} onSpeed={value => maneuver({type: "speed", value})}/>
    </div><p className={styles.controlHint}>Staff override · changes aircraft movement. Pattern controls are in More actions.</p></> : null}
    {section === "speeds" ? <PerformanceControls aircraft={a} onEdit={edit}/>:null}
    {section === "speeds" ? a.radar ? <RadarSeedControls aircraft={a} airport={AIRPORT} environment={exercise.radarEnvironment ?? radarEnvironmentFor(AIRPORT)} onEdit={edit}/> : <SpeedControls airport={AIRPORT} aircraft={a} onEdit={edit} onSpeed={value => maneuver({type: "speed", value})}/> : null}
    {section === "pattern" && !a.radar ? <div className={styles.flightLayout}>
      <section className={styles.patternControls} aria-label="Pattern controls">
      <h2>Pattern</h2>
      <div className={styles.flightGrid}><label>Assigned runway<select aria-label="Assigned runway" value={a.runway ?? defaultRunway(AIRPORT)} onChange={e => maneuver({type: "runway", runway: e.target.value as Runway})}>{runwayEnds(AIRPORT).map(end => <option key={end.id}>{end.id}</option>)}</select></label><label>Pattern direction<select value={a.hand} onChange={e => edit({hand: e.target.value as "left" | "right"})}><option value="left">Left traffic</option><option value="right">Right traffic</option></select></label><LandingOutcomeControl value={a.landing} onChange={outcome => maneuver({type: "outcome", outcome})}/></div>
      <div className={styles.patternLeg}><h3>Pattern leg</h3><div className={styles.legButtons}>{(["upwind", "crosswind", "downwind", "base", "final"] as Leg[]).map(leg => <button key={leg} disabled={!!validateInstruction(a, {type: "pattern", leg})} aria-pressed={a.mode === "pattern" && a.leg === leg} onClick={() => maneuver({type: "pattern", leg})}>{leg}</button>)}</div></div>
      <div className={styles.flightActions}><button disabled={!!validateInstruction(a, {type: "extend", leg: "upwind"})} onClick={() => maneuver({type: "extend", leg: "upwind"})}>Extend upwind</button><button disabled={!!validateInstruction(a, downwindAction)} onClick={() => maneuver(downwindAction)}>{extendingDownwind ? "Turn base" : "Extend downwind"}</button><button className={a.clearedToLand ? styles.cancelLanding : styles.allowLanding} disabled={!!validateInstruction(a, {type: "land"})} onClick={() => a.clearedToLand ? edit({clearedToLand: false, optionHand: undefined}) : maneuver({type: "land"})}>{a.clearedToLand ? "Cancel landing" : "Allow landing"}</button><button className={styles.goAround} disabled={!!validateInstruction(a, {type: "go-around"})} onClick={() => maneuver({type: "go-around"})}>Go around</button></div>
      <p className={styles.flightStatus} role="status">{a.clearedToLand ? a.clearedForOption ? "Option permitted" : "Landing permitted · full stop" : "Landing not permitted"} · {Math.round(a.altitude)} ft MSL{sequenceStatus(a, exercise.aircraft) ? ` · ${sequenceStatus(a, exercise.aircraft)}` : ""}</p>
      </section>
      <div className={styles.flightOverrides}>
      <SpeedControls airport={AIRPORT} aircraft={a} onEdit={edit} onSpeed={value => maneuver({type: "speed", value})}/>
      <section className={styles.headingControls} aria-label="Heading controls"><h2>Maneuver</h2><div className={styles.numberCommand}><label>Heading (°M)<input aria-label="Heading override" type="number" min="0" max="360" step="10" value={heading} onChange={e => setHeading(e.target.value)}/></label><button disabled={!!validateInstruction(a, {type: "heading", value: Number(heading)})} onClick={() => {maneuver({type: "heading", value: Number(heading)}); setHeading(null);}}>Set heading</button></div></section>
      </div>
    </div> : null}
    {section === "routes" && a.radar ? <RadarSeedControls aircraft={a} airport={AIRPORT} environment={exercise.radarEnvironment ?? radarEnvironmentFor(AIRPORT)} onEdit={edit}/> : null}
    {section === "routes" ? <>
      <div className={styles.routeGrid}>{!a.radar ? <section><h2>Taxi route</h2><div className={styles.numberCommand}><label>Taxi destination<select value={runway} onChange={e => setRunway(e.target.value as Runway)}>{runwayEnds(AIRPORT).map(end => <option key={end.id} value={end.id}>Runway {end.id}</option>)}</select></label><button disabled={!["parked", "pushback", "taxi", "rollout"].includes(a.mode)} onClick={() => {const route = planTaxiRoute(AIRPORT, a.position, runway); setRouteError(route.error ?? ""); if (route.path) {edit({taxiPath: route.path, taxiIndex: 0, holding: true, speed: 0, targetSpeed: 0, runway}); onEditMode("taxi-preview");}}}>Calculate route</button></div>{routeError ? <p className={styles.routeError} role="alert">{routeError}</p> : null}<div className={styles.buttonRow}><button aria-pressed={editMode === "taxi"} onClick={() => onEditMode(editMode === "taxi" ? "" : "taxi")}>{editMode === "taxi" ? "Done drawing" : "Draw taxi path"}</button><button onClick={() => edit({taxiPath: [], taxiIndex: 0, holding: true, speed: 0, targetSpeed: 0})}>Clear path</button></div><label className={styles.checkLabel}><input type="checkbox" checked={holdPoint} onChange={e => onHoldPoint(e.target.checked)}/>Hold-short at next point</label><div className={styles.buttonRow}>{([{type: "taxi", label: "Start taxi"}, {type: "stop", label: "Stop"}, {type: "cross", label: "Release crossing"}] as const).map(c => <button key={c.type} disabled={!!validateInstruction(a, {type: c.type})} onClick={() => maneuver({type: c.type})}>{c.label}</button>)}</div></section> : null}<section><h2>Flight plan <small>{a.flightPlan.length} points</small></h2><div className={styles.buttonRow}><button aria-pressed={editMode === "flightPlan"} onClick={() => onEditMode(editMode === "flightPlan" ? "" : "flightPlan")}>{editMode === "flightPlan" ? "Done drawing" : "Draw flight plan"}</button><button onClick={() => edit({flightPlan: []})}>Clear plan</button></div><small>{a.radar ? "Radar route" : "Display only"}</small></section><section><h2>Position</h2><div className={styles.buttonRow}><button aria-pressed={editMode === "position"} onClick={() => onEditMode(editMode === "position" ? "" : "position")}>Reposition on radar</button><button onClick={() => {const g = runwayGeometry(a.runway ?? defaultRunway(AIRPORT)); edit({position: g.threshold, heading: g.heading, targetHeading: g.heading});}}>At runway threshold</button></div>{editMode ? <p className={styles.controlHint}>{editMode === "taxi-preview" ? "Drag route to adjust." : "Click radar to place a point."}</p> : null}</section></div>
    </> : null}
    {section === "details" ? <>
      <dl className={workspace.operationalDetails}><div><dt>Frequency</dt><dd>{a.frequency ? `${frequenciesFor(AIRPORT)[a.frequency].label} ${frequenciesFor(AIRPORT)[a.frequency].value}` : "No frequency"}</dd></div><div><dt>Runway</dt><dd>{stripRunway(a)}</dd></div><div><dt>Next landing</dt><dd>{a.landing === "full-stop" ? "Full stop" : "Touch and go"}</dd></div>{a.radar ? <div><dt>Guidance</dt><dd>{radarGuidanceLabel(a, exercise.radarEnvironment ?? radarEnvironmentFor(AIRPORT))}</dd></div> : null}{a.radar?.flight ? <div><dt>Flight intention</dt><dd>{a.radar.flight === "departure" ? "Depart sector" : "Return for approach"}</dd></div> : null}{lastCommand?.instruction?.type === "frequency" && lastCommand.instruction.frequency ? <div><dt>{lastCommand.instruction.whenReady ? "Contact when ready" : "Awaiting switch"}</dt><dd>{frequenciesFor(AIRPORT)[lastCommand.instruction.frequency].label}</dd></div> : null}</dl>
      <div className={styles.detailsGrid}><label>Callsign<input aria-label="Callsign" defaultValue={a.callsign} maxLength={80} onBlur={e => edit({callsign: e.target.value.trim() || a.callsign})}/></label><label>Aircraft type<input aria-label="Aircraft type" defaultValue={a.type} maxLength={12} onBlur={e => edit({type: e.target.value.trim() || a.type})}/></label><label>Altitude (ft MSL)<input aria-label="Aircraft altitude" type="number" min="0" max="60000" defaultValue={Math.round(a.altitude)} onBlur={e => {if (e.target.value.trim() && e.currentTarget.checkValidity()) edit({altitude: Number(e.target.value)}); else if (!e.currentTarget.validity.valid) e.currentTarget.reportValidity();}}/></label></div>
      {deleteOpen ? <DeleteAircraftDialog aircraft={a} enabled={owner} dispatch={dispatch} onDeleted={() => {onSelect(null); onEditMode("");}} onClose={() => setDeleteOpen(false)}/> : null}<div className={styles.detailsFooter}><p className={styles.controlHint}>{AIRPORT.icao} elevation {AIRPORT.elevation} ft</p><button className={styles.removeButton} onClick={() => setDeleteOpen(true)}><X/>Remove aircraft</button></div>
    </> : null}
  </fieldset>;
}

function LocalSpeed({aircraft, onSpeed}: {aircraft: Aircraft; onSpeed: (speed: number) => void}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(Math.round(aircraft.targetSpeed));
  const valid = value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 600;
  return <div className={workspace.speedGroup}><label>Speed (kt)<input aria-label="Speed override" type="number" min="0" max="600" value={value} onChange={event => setDraft(event.target.value)}/></label><button disabled={!valid} onClick={() => {onSpeed(Number(value)); setDraft(null);}}>Set speed</button></div>;
}
