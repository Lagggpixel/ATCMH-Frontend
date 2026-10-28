"use client";
import {randomCallsign} from "./callsigns";
import LocalAircraftDialog from "./LocalAircraftDialog";
import MentorContextMenu, {type ScopeContext} from "./MentorContextMenu";
import SpawnAircraftDialog from "./SpawnAircraftDialog";
import {addLocalScenarioAircraft} from "./local-aircraft";
import {memo, useCallback, useDeferredValue, useEffect, useMemo, useState, type CSSProperties} from "react";
import Link from "next/link";
import {Warning} from "@phosphor-icons/react/dist/csr/Warning";
import {ArrowCounterClockwise} from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import {ArrowUp} from "@phosphor-icons/react/dist/csr/ArrowUp";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretLeft} from "@phosphor-icons/react/dist/csr/CaretLeft";
import {CaretUp} from "@phosphor-icons/react/dist/csr/CaretUp";
import {Check} from "@phosphor-icons/react/dist/csr/Check";
import {GearSix} from "@phosphor-icons/react/dist/csr/GearSix";
import {Notepad} from "@phosphor-icons/react/dist/csr/Notepad";
import {Pause} from "@phosphor-icons/react/dist/csr/Pause";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {conditionLabel} from "./LiveScenarioPanel";
import live from "./LiveTheme.module.css";
import {brokenScenarioEvents} from "./scenario-dependencies";
import {useRouter} from "next/navigation";
import SessionAccess from "./SessionAccess";
import Scope from "./Scope";
import EditorScreen from "./EditorScreen";
import ScenarioAircraftInspector from "./ScenarioAircraftInspector";
import {applyEnvelope, autoReadbacks, engineFor} from "./engine";
import {getAirport, environmentLabel, trainingMode} from "./airports";
import ScenarioSetup from "./ScenarioSetup";
import {gateTargets, placeAircraftAtGate} from "./gate-placement";
import LearningFrame from "../learning/LearningFrame";
import {TrainingNav} from "./TrainingLibrary";
import library from "./LibraryPages.module.css";
import {advanceScenario, executeScenarioEvent} from "./scenario-engine";
import {blankScenario, normalizeScenario, normalizeScenarioAircraft, gatesFor, isGroundSpawn, createScenarioExercise, scenarioSchemaFor, seedFromAircraft, timeLabel, type ScenarioDefinition, type ScenarioEvent, type ScenarioRecord, type ScenarioRuntime} from "./scenarios";
import {sessionJson} from "./shared-transport";
import {trainingRequest} from "./TrainingLibrary";
import ScenarioEventEditor, {defaultEvent} from "./ScenarioEventEditor";
import {MAX_AIRCRAFT, intentionsOf, type Exercise, type Point, type Runway} from "./model";
import type {GroundClearance} from "./GroundRouteEditor";
import sim from "./Simulator.module.css";
import styles from "./Training.module.css";
const EditorScope = memo(Scope);
type Preview = {exercise: Exercise; runtime: ScenarioRuntime};
export default function ScenarioEditor({id}: {id: string}) {
  return <SessionAccess role="staff" returnTo={`/sweatbox/scenarios/${id}`}>{(csrf, accountId) => <Editor key={`${id}:${accountId}`} id={id} csrf={csrf} accountId={accountId}/>}</SessionAccess>;
}

function Editor({id, csrf, accountId}: {id: string; csrf: string; accountId: string}) {
  const router = useRouter();
  const [record, setRecord] = useState<ScenarioRecord | null>(null), [draft, setDraft] = useState<ScenarioDefinition>(() => blankScenario());
  const [creating, setCreating] = useState(id === "new");
  const AIRPORT = getAirport(draft), {newAircraft} = engineFor(draft), scenarioGates = gatesFor(AIRPORT);
  const normalizeAircraft = (spec: ScenarioDefinition["aircraft"][number]) => normalizeScenarioAircraft(spec, AIRPORT);
  const groundSpawn = (seed: ScenarioDefinition["aircraft"][number]["seed"]) => isGroundSpawn(seed, AIRPORT);
  const [loading, setLoading] = useState(id !== "new"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(""), [eventId, setEventId] = useState(""), [notes, setNotes] = useState(false), [editMode, setEditMode] = useState(""), [timeline, setTimeline] = useState(true);
  const [taxiRequest, setTaxiRequest] = useState<{aircraftId: string; runway?: string; serial: number}>();
  const [addingAircraft, setAddingAircraft] = useState(false);
  const [scopeMenu, setScopeMenu] = useState<ScopeContext | null>(null), [spawnAt, setSpawnAt] = useState<{point?: Point; originIcao?: string} | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState(() => JSON.stringify(blankScenario()));
  const dirty = JSON.stringify(draft) !== saved;
  const brokenEvents = useMemo(() => brokenScenarioEvents(draft), [draft]);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (id === "new") return;
    const controller = new AbortController();
    fetch(`/api/simulator/training/scenarios/${id}`, {cache: "no-store", signal: controller.signal}).then(sessionJson).then(value => {if (controller.signal.aborted) return; setRecord(value.scenario); setDraft(normalizeScenario(value.scenario.draft)); setSaved(JSON.stringify(normalizeScenario(value.scenario.draft))); setSelected(value.scenario.draft.aircraft[0]?.key ?? "");}).catch(reason => {if (!controller.signal.aborted) setError(reason.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [id, retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {e.preventDefault(); e.returnValue = "";}; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!preview?.exercise.running) return;
    let previous = performance.now();
    const timer = setInterval(() => {const now = performance.now(), dt = Math.min(.5, (now - previous) / 1000); previous = now; setPreview(current => {
      if (!current?.exercise.running) return current;
      const runtime = structuredClone(current.runtime); const exercise = advanceScenario(current.exercise, runtime, dt, Date.now()).exercise; return {runtime, exercise: autoReadbacks(exercise, Date.now(), () => crypto.randomUUID())};
    });}, 100);
    return () => clearInterval(timer);
  }, [preview?.exercise.running]);
  const aircraft = useMemo(() => draft.aircraft.map(a => ({...newAircraft(a.key, false), ...a.seed})), [draft.aircraft, newAircraft]);
  // Keep input/draft updates immediate; the expensive map can catch up between keystrokes.
  const scopeAircraft = useDeferredValue(aircraft);
  const scopeGates = useMemo(() => gateTargets(getAirport({airport: draft.airport})), [draft.airport]);
  const spec = draft.aircraft.find(a => a.key === selected), a = aircraft.find(a => a.id === selected), event = draft.events.find(e => e.id === eventId);
  const radarMode = trainingMode(draft);
  const ground = !!spec && groundSpawn(spec.seed);
  const select = useCallback((key: string | null) => {setSelected(key ?? ""); setEventId(""); setNotes(false); setEditMode("");}, [setSelected, setEventId, setNotes, setEditMode]);
  const previewIds = preview?.runtime.aircraftIds;
  const selectOnScope = useCallback((id: string | null) => select(previewIds ? Object.entries(previewIds).find(([, value]) => value === id)?.[0] ?? null : id), [previewIds, select]);
  const save = async () => {
    setError(""); setNotice(""); const result = scenarioSchemaFor(record?.draft).safeParse(draft);
    if (!result.success) {setError(result.error.issues.map(i => i.message).join(" ")); return null;}
    const submitted = JSON.stringify(draft);
    setBusy(true);
    try {
      const value = await trainingRequest(csrf, id === "new" ? "scenarios" : `scenarios/${id}`, id === "new" ? {draft: result.data} : {action: "save", draft: result.data, version: record!.version});
      const canonical = normalizeScenario(value.scenario.draft);
      setDraft(current => JSON.stringify(current) === submitted ? canonical : current);
      setSaved(JSON.stringify(canonical)); setRecord(value.scenario); setNotice("Draft saved.");
      if (id === "new") router.replace(`/sweatbox/scenarios/${value.scenario.id}`);
      return value.scenario as ScenarioRecord;
    } catch (reason) {setError((reason as Error).message); return null;} finally {setBusy(false);}
  };
  const publish = async () => {
    const current = dirty || !record ? await save() : record; if (!current) return;
    setBusy(true);
    try {const value = await trainingRequest(csrf, `scenarios/${current.id}`, {action: "publish", version: current.version}); setRecord(value.scenario); setNotice(`Revision ${value.scenario.publishedRevision} published. Existing sessions keep their original revision.`);}
    catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}
  };
  const addAircraft = (air: boolean) => {
    const key = `traffic-${crypto.randomUUID().slice(0, 8)}`, next = newAircraft(key, air), rolls = [Math.random(), Math.random()];
    setDraft(d => {
      let roll = 0;
      const callsign = randomCallsign(d.aircraft.map(a => a.seed.callsign), () => rolls[roll++ % rolls.length]);
      return ({...d, aircraft: [...d.aircraft, {key, initial: true, seed: seedFromAircraft({...next, callsign}), ...(!air ? {gateId: scenarioGates.find(g => !d.aircraft.some(a => a.gateId === g.id))?.id ?? scenarioGates[0].id} : {})}].map(normalizeAircraft)});
    }); select(key);
  };
  const placeAtGate = useCallback((aircraftId: string, gateId: string) => setDraft(d => ({...d, aircraft: d.aircraft.map(spec => spec.key === aircraftId ? placeAircraftAtGate(spec, gateId, AIRPORT) : spec)})), [AIRPORT]);
  const selectGate = useCallback((gateId: string) => placeAtGate(selected, gateId), [placeAtGate, selected]);
  const removeAircraft = () => {
    if (!window.confirm("Remove this aircraft and all events that reference it?")) return;
    setDraft(d => ({...d, aircraft: d.aircraft.filter(p => p.key !== selected), events: d.events.filter(e => !(e.trigger.type === "condition" && "aircraftKey" in e.trigger.condition && e.trigger.condition.aircraftKey === selected)).map(e => ({...e, actions: e.actions.filter(a => !("aircraftKey" in a) || a.aircraftKey !== selected)})).filter(e => e.actions.length)})); select(null);
  };
  const point = useCallback((p: Point) => {
    if (editMode === "condition" && event?.trigger.type === "condition" && event.trigger.condition.type === "position") {
      const trigger = {...event.trigger, condition: {...event.trigger.condition, point: p}};
      setDraft(d => ({...d, events: d.events.map(e => e.id === event.id ? {...e, trigger} : e)})); setEditMode(""); return;
    }
    if (!selected || editMode !== "position" || ground && !!spec?.gateId) return;
    setDraft(d => ({...d, aircraft: d.aircraft.map(spec => spec.key !== selected ? spec : {...spec, seed: {...spec.seed, position: p}})}));
    setEditMode("");
  }, [editMode, event, ground, spec?.gateId, selected, setDraft, setEditMode]);
  // Drag-and-taxi on the scope saves the reviewed route as the aircraft's seeded taxi path.
  const saveTaxiRoute = useCallback(async (aircraftId: string, command: GroundClearance) => {
    const route = command.route; if (!route) return false;
    const runway = route.destination.type === "runway" ? route.destination.id as Runway : undefined;
    setDraft(d => ({...d, aircraft: d.aircraft.map(spec => spec.key !== aircraftId ? spec : {...spec, seed: {...spec.seed, taxiPath: route.points.map(p => ({...p})), ...(runway ? {runway} : {})}})}));
    return true;
  }, [setDraft]);
  const test = () => {
    const result = scenarioSchemaFor(record?.draft).safeParse(draft); if (!result.success) {setError(result.error.issues.map(i => i.message).join(" ")); return;}
    setPreview(createScenarioExercise(result.data, "scenario-preview", crypto.randomUUID())); setEditMode(""); setError("");
  };
  const previewCommand = (command: "play" | "pause") => setPreview(current => {
    if (!current) return current; const runtime = structuredClone(current.runtime), result = applyEnvelope(current.exercise, {id: crypto.randomUUID(), time: Date.now(), action: {kind: command}});
    return {runtime, exercise: advanceScenario(result.state, runtime, 0, Date.now()).exercise};
  });
  if (loading) return <main className={styles.library}><p role="status">Loading scenario…</p></main>;
  if (id !== "new" && !record) return <LearningFrame product="Sweatbox"><main className={library.library}><Link href="/sweatbox/scenarios">← Scenarios</Link><p role="alert">{error || "This scenario is unavailable."}</p><button onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></main></LearningFrame>;
  if (creating) return <EditorScreen><LearningFrame product="Sweatbox"><main className={library.library}><TrainingNav active="scenarios"/><div className={library.libraryContent}><div className={library.heading}><div><h1>New scenario</h1></div></div><ScenarioSetup definition={draft} onChange={setDraft}/><div className={library.actions} style={{marginTop: 28}}><Link href="/sweatbox/scenarios">Cancel</Link><button className={library.primary} onClick={() => {setSaved(JSON.stringify(draft)); setCreating(false);}}>Open editor</button></div></div></main></LearningFrame></EditorScreen>;
  const runAt = (eventId: string) => setPreview(current => {if (!current) return current; const runtime = structuredClone(current.runtime); return {runtime, exercise: executeScenarioEvent(current.exercise, runtime, eventId, Date.now())};});
  const addEvent = () => {const next = defaultEvent(draft); setDraft(d => ({...d, events: [...d.events, next]})); setEventId(next.id); setNotes(false); setEditMode(""); setTimeline(true);};
  const openEvent = (id: string) => {setEventId(id); setNotes(false); setEditMode("");};
  const spawnTimes = new Map(draft.events.flatMap(e => e.trigger.type === "time" ? e.actions.flatMap(a => a.type === "spawn" ? [[a.aircraftKey, e.trigger.type === "time" ? e.trigger.at : 0] as const] : []) : []));
  const present = (key: string) => !preview || preview.exercise.aircraft.some(a => a.id === preview.runtime.aircraftIds[key]);
  // The pilot's plan as a chip, so the traffic list reads like the scenario.
  const plan = (seed: ScenarioDefinition["aircraft"][number]["seed"]) => {
    if (seed.radar || isGroundSpawn(seed, AIRPORT)) return "";
    const intentions = intentionsOf(seed);
    return intentions.call === "quiet" ? "Quiet" : intentions.call === "transition" ? intentions.afterTransition === "continue" ? "Transit" : `Transit → ${intentions.afterTransition === "land" ? "Land" : "T&G"}` : seed.landing === "touch-and-go" ? "T&G" : "Land";
  };
  const closeSpawn = () => {setAddingAircraft(false); setSpawnAt(null);};
  // Radar spawns are validated against the scenario as it would start.
  const spawnExercise = (() => {if (!spawnAt || radarMode === "local") return null; try {return createScenarioExercise(draft, "scenario-spawn", "spawn").exercise;} catch {return null;}})();
  const trafficRow = (p: ScenarioDefinition["aircraft"][number]) => {
    const live = preview?.exercise.aircraft.find(a => a.id === preview.runtime.aircraftIds[p.key]), frequency = preview ? live?.frequency : p.seed.frequency, at = spawnTimes.get(p.key);
    return <button key={p.key} className={styles.trafficRow} data-absent={!present(p.key) || undefined} aria-pressed={selected === p.key && !eventId} onClick={() => select(p.key)}>
      <span><strong>{p.seed.callsign}</strong><small>{!present(p.key) ? "Not here yet" : `${p.seed.type}${p.gateId && !preview ? ` · Gate ${gateName(AIRPORT, p.gateId)}` : ""}${p.seed.originDeparture && !p.seed.radar ? ` · From ${p.seed.originDeparture.icao}` : ""}`}</small></span>
      {!preview && plan(p.seed) ? <em className={styles.planChip}>{plan(p.seed)}</em> : null}
      {!p.initial && at !== undefined && !preview ? <time>{timeLabel(at)}</time> : frequency ? <span className={styles.chip}>{FREQUENCY_SHORT[frequency]}</span> : null}
    </button>;
  };
  const initialTraffic = draft.aircraft.filter(p => p.initial), scheduledTraffic = draft.aircraft.filter(p => !p.initial);
  const notesPreview = draft.instructorNotes.trim().split("\n")[0];
  return <EditorScreen><main className={`${sim.simulator} ${styles.editor} ${live.theme}`}>
    <header className={styles.editorHeader}>
      <Link className={styles.backLink} href="/sweatbox/scenarios" onClick={e => {if (dirty && !window.confirm("Leave without saving your draft?")) e.preventDefault();}}><CaretLeft aria-hidden="true"/>Scenarios</Link>
      <span className={styles.headerDivider} aria-hidden="true"/>
      {preview ? <strong className={styles.headerTitle}>{draft.title}</strong> : <input className={styles.headerTitle} aria-label="Scenario name" maxLength={80} value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})}/>}
      {preview ? <><span className={styles.testState}>Testing</span><time className={styles.testClock}>{timeLabel(preview.exercise.elapsed)}</time>
        <button className={styles.button} onClick={() => previewCommand(preview.exercise.running ? "pause" : "play")}>{preview.exercise.running ? <><Pause aria-hidden="true"/>Pause</> : <><Play aria-hidden="true"/>Start</>}</button>
        <button className={styles.ghostButton} onClick={test}><ArrowCounterClockwise aria-hidden="true"/>Restart</button>
        <button className={styles.primary} onClick={() => setPreview(null)}>Back to editing</button></>
      : <><span className={styles.chip}>{environmentLabel(draft)}</span>
        <span role="status" className={styles.headerStatus}>{!record ? "Not saved yet" : dirty ? "Unsaved changes" : "Saved"}{record ? record.publishedRevision ? ` · Published r${record.publishedRevision}` : " · Not published" : ""}</span>
        <button className={styles.ghostButton} disabled={busy} onClick={test}><Play aria-hidden="true"/>Test</button>
        <button className={styles.button} disabled={busy} onClick={() => void save()}>Save draft</button>
        <button className={styles.primary} disabled={busy} onClick={() => void publish()}>Publish r{(record?.publishedRevision ?? 0) + 1}</button></>}
    </header>
    <aside className={styles.outline} aria-label="Scenario outline">
      {preview ? <p className={styles.outlineNote}>Nothing you do in a test changes the scenario or any session.</p> : <>
        <button className={styles.outlineItem} aria-pressed={!selected && !eventId && !notes} onClick={() => {select(null); setNotes(false);}}><GearSix aria-hidden="true"/><span><strong>Setup</strong><small>{environmentLabel(draft)}</small></span></button>
        <button className={styles.outlineItem} aria-pressed={notes} onClick={() => {select(null); setNotes(true);}}><Notepad aria-hidden="true"/><span><strong>Mentor notes</strong><small>{notesPreview || "Add notes only mentors see"}</small></span></button></>}
      <div className={styles.outlineHeading}><h2 className={styles.kicker}>Traffic · {draft.aircraft.length}</h2>{!preview ? radarMode === "local" ? <button className={styles.smallButton} disabled={draft.aircraft.length >= MAX_AIRCRAFT} onClick={() => setAddingAircraft(true)}><Plus aria-hidden="true"/>Add</button> : <button className={styles.smallButton} disabled={draft.aircraft.length >= MAX_AIRCRAFT} onClick={() => addAircraft(true)}><Plus aria-hidden="true"/>Airborne</button> : null}</div>
      <div className={styles.outlineList}>
        {initialTraffic.length && scheduledTraffic.length ? <p className={styles.outlineGroup}>At start</p> : null}{initialTraffic.map(trafficRow)}
        {scheduledTraffic.length ? <p className={styles.outlineGroup}>Scheduled</p> : null}{scheduledTraffic.map(trafficRow)}
        {!draft.aircraft.length ? <p className={styles.outlineNote}>No traffic yet.</p> : null}
      </div>
      {record ? <footer>Created by {record.ownerName || record.ownerId}</footer> : null}
    </aside>
    <div className={styles.editorScope}><EditorScope onScopeContextMenu={true && !preview && !editMode ? setScopeMenu : undefined} messages={preview?.exercise.messages} accountId={accountId} key={`${AIRPORT.icao}:${radarMode}`} airport={AIRPORT} radarEnvironment={draft.radarEnvironment} radarMode={radarMode === "local" ? undefined : radarMode} autoReadback={preview?.exercise.autoReadback} aircraft={preview?.exercise.aircraft ?? scopeAircraft} running={preview?.exercise.running ?? false} frequency="all" gates={!preview && ground && !editMode ? scopeGates : undefined} selectedGate={spec?.gateId} onGateSelect={selectGate} onGateDrop={placeAtGate} selected={preview ? preview.runtime.aircraftIds[selected] ?? null : selected || null} onSelect={selectOnScope} editMode={preview ? "" : editMode} onPoint={point} groundRouteMode="scenario" groundRouteRequest={preview ? undefined : taxiRequest} onGroundClearance={preview ? undefined : saveTaxiRoute}/></div>
    <aside className={styles.inspector} aria-label="Scenario settings">
    {event && brokenEvents.has(event.id) ? <p role="alert" className={styles.error}>{brokenEvents.get(event.id)}</p> : null}
    {preview ? <div className={styles.testPanel}>
      <h2 className={styles.kicker}>Test run</h2>
      <label className={styles.switchRow}>Automatic readbacks<input type="checkbox" checked={!!preview.exercise.autoReadback} onChange={e => {const enabled = e.target.checked; setPreview(current => current ? {...current, exercise: applyEnvelope(current.exercise, {id: crypto.randomUUID(), time: Date.now(), action: {kind: "auto-readback", enabled}}).state} : current);}}/></label>
      <h3 className={styles.kicker}>Radio</h3>
      <ol className={styles.radioLog}>{preview.exercise.messages.slice(-15).map(m => <li key={m.id}><small>{preview.exercise.aircraft.find(a => a.id === m.aircraftId)?.callsign ?? (m.sender === "controller" ? "Controller" : "Pilot")}</small>{m.text}</li>)}{!preview.exercise.messages.length ? <li className={styles.outlineNote}>{preview.exercise.running ? "No radio calls yet." : "Start the test to see radio calls here."}</li> : null}</ol>
      {record?.publishedRevision ? <footer><button className={styles.button} disabled={busy} onClick={async () => {setBusy(true); try {const value = await trainingRequest(csrf, `scenarios/${record.id}`, {action: "launch", revision: record.publishedRevision}); router.push(`/sweatbox/staff?session=${value.sessionId}`);} catch (e) {setError((e as Error).message); setBusy(false);}}}>Start a session from r{record.publishedRevision}</button><small>Uses the published revision, not this draft</small></footer> : null}
    </div> : notes ? <div className={styles.inspectorFields}><p className={styles.kicker}>Mentor notes</p><label>Notes only mentors see during the session<textarea rows={10} maxLength={6000} value={draft.instructorNotes} onChange={e => setDraft({...draft, instructorNotes: e.target.value})}/></label></div> : event ? <ScenarioEventEditor event={event} definition={draft} onChange={value => setDraft(d => ({...d, events: d.events.map(e => e.id === value.id ? value : e)}))} onRemove={() => {setDraft(d => ({...d, events: d.events.filter(e => e.id !== event.id)})); setEventId("");}} onPickPosition={() => setEditMode("condition")}/> : a && spec ? <ScenarioAircraftInspector key={selected} definition={draft} aircraft={a} onChange={setDraft} onRemove={removeAircraft} editMode={editMode} onEditMode={setEditMode} onPlanTaxi={runway => setTaxiRequest({aircraftId: selected, runway, serial: Date.now()})} onError={setError}/> : <ScenarioSetup compact definition={draft} onChange={setDraft} locked={!!draft.aircraft.length || !!draft.events.length}/>}
    </aside>
    <ScenarioTimeline events={draft.events} selected={eventId} broken={brokenEvents} preview={preview} open={timeline} onToggle={() => setTimeline(!timeline)} onSelect={openEvent} onAdd={addEvent} onRun={runAt} onMove={index => setDraft(d => {const events = [...d.events]; [events[index - 1], events[index]] = [events[index], events[index - 1]]; return {...d, events};})}/>
    {scopeMenu && !preview ? <MentorContextMenu target={scopeMenu} enabled={true && draft.aircraft.length < MAX_AIRCRAFT} onConflict={() => undefined} onDelete={() => undefined} onClose={() => setScopeMenu(null)}
      onSpawn={() => {setSpawnAt({point: scopeMenu.point}); setScopeMenu(null);}} onSpawnAirport={originIcao => {setSpawnAt({originIcao}); setScopeMenu(null);}}/> : null}
    {(addingAircraft || spawnAt) && !preview && radarMode === "local" ? <LocalAircraftDialog selection={draft} accountId={accountId} position={spawnAt?.point} originIcao={spawnAt?.originIcao} aircraft={aircraft} callsigns={draft.aircraft.map(a => a.seed.callsign)} scenario enabled onAdd={(next, gateId, at) => {
      const updated = addLocalScenarioAircraft(draft, next, gateId, at); setDraft(updated); select(next.id); return true;
    }} onClose={closeSpawn}/> : null}
    {spawnAt && spawnExercise && !preview && radarMode !== "local" ? <SpawnAircraftDialog accountId={accountId} exercise={spawnExercise} position={spawnAt.point} originIcao={spawnAt.originIcao} enabled={true} onSpawned={() => undefined} onClose={closeSpawn} dispatch={action => {
      if (action.kind !== "spawn") return false;
      const key = `traffic-${crypto.randomUUID().slice(0, 8)}`;
      setDraft(addLocalScenarioAircraft(draft, {...action.aircraft, id: key}, undefined, 0)); select(key); return true;
    }}/> : null}
    {editMode ? <div className={styles.pickHint}>{editMode === "condition" ? "Click the condition location" : "Click to place aircraft"}<button onClick={() => setEditMode("")}>Done</button></div> : null}
    {error || notice ? <div className={`${styles.editorNotice} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}>{error || notice}<button aria-label="Dismiss notice" onClick={() => {setError(""); setNotice("");}}><X aria-hidden="true"/></button></div> : null}
  </main></EditorScreen>;
}

const gateName = (airport: ReturnType<typeof getAirport>, gateId: string) => gatesFor(airport).find(g => g.id === gateId)?.name || gateId;
const FREQUENCY_SHORT: Record<string, string> = {ground: "GND", tower: "TWR", approach: "APP", center: "CTR"};
const triggerText = (e: ScenarioEvent) => e.trigger.type === "time" ? timeLabel(e.trigger.at) : e.trigger.type === "manual" ? "Mentor release" : "Condition";

// Timed events sit on a minute ruler; condition and Mentor release events get their own lanes.
function ScenarioTimeline({events, selected, broken, preview, open, onToggle, onSelect, onAdd, onRun, onMove}: {events: ScenarioEvent[]; selected: string; broken: Map<string, string>; preview: Preview | null; open: boolean; onToggle: () => void; onSelect: (id: string) => void; onAdd: () => void; onRun: (id: string) => void; onMove: (index: number) => void}) {
  const [view, setView] = useState<"track" | "list">("track");
  const timed = events.filter(e => e.trigger.type === "time").sort((a, b) => (a.trigger.type === "time" ? a.trigger.at : 0) - (b.trigger.type === "time" ? b.trigger.at : 0));
  const latest = Math.max(0, ...timed.map(e => e.trigger.type === "time" ? e.trigger.at : 0), preview?.exercise.elapsed ?? 0);
  const span = Math.max(900, Math.ceil((latest + 60) / 300) * 300), step = span / 5;
  const states = preview?.runtime.events;
  const counts = states ? {done: Object.values(states).filter(s => s.status === "completed" || s.status === "skipped").length, blocked: Object.values(states).filter(s => s.status === "blocked").length} : null;
  const pill = (e: ScenarioEvent, style?: CSSProperties) => {
    const state = states?.[e.id], finished = state?.status === "completed" || state?.status === "skipped", bad = !!broken.get(e.id) || state?.status === "blocked";
    const action = preview && state && (state.status === "blocked" || e.trigger.type === "manual" && state.status === "waiting") ? state.status === "blocked" ? "Retry" : "Run" : null;
    return <span key={e.id} className={styles.pill} style={style} data-done={finished || undefined} data-bad={bad || undefined} title={broken.get(e.id) ?? state?.error}>
      <button aria-pressed={selected === e.id} onClick={() => onSelect(e.id)}>{bad ? <Warning weight="fill" aria-hidden="true"/> : finished ? <Check aria-hidden="true"/> : e.trigger.type === "time" ? <time>{timeLabel(e.trigger.at)}</time> : null}<span>{e.title}</span>{e.trigger.type === "condition" && !finished ? <small>{state?.status === "waiting" ? "waiting" : conditionLabel(e, events)}</small> : null}</button>
      {action ? <button className={styles.pillAction} disabled={!preview?.exercise.running} onClick={() => onRun(e.id)}>{action}</button> : null}
    </span>;
  };
  const conditional = events.filter(e => e.trigger.type === "condition"), manual = events.filter(e => e.trigger.type === "manual");
  // Place labels greedily in two rows; events whose label would collide keep only their marker.
  const [lane, setLane] = useState<HTMLDivElement | null>(null), [width, setWidth] = useState(0);
  useEffect(() => {
    if (!lane) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(lane);
    return () => observer.disconnect();
  }, [lane]);
  const rows = new Map<string, number>(), taken: [number, number][][] = [[], []];
  const place = (e: ScenarioEvent) => {
    const x = (e.trigger.type === "time" ? e.trigger.at : 0) / span * width, w = Math.min(280, 64 + e.title.length * 6.6), start = x / width > .75 ? x - w : x - 6, end = start + w;
    const row = taken.findIndex(spans => spans.every(([a, b]) => end + 6 < a || start > b + 6));
    if (row >= 0) {rows.set(e.id, row); taken[row].push([start, end]);}
  };
  const chosen = timed.find(e => e.id === selected);
  if (width) {if (chosen) place(chosen); for (const e of timed) if (e !== chosen) place(e);}
  return <section className={`${styles.timeline} ${open ? "" : styles.collapsed}`} aria-label="Scenario timeline">
    <header>
      <strong>Timeline</strong><span>{counts ? `${counts.done} done${counts.blocked ? ` · ${counts.blocked} blocked` : ""} · ${events.length - counts.done} to go` : `${events.length} event${events.length === 1 ? "" : "s"}`}</span>
      {!preview && broken.size ? <span className={styles.timelineWarning}><Warning weight="fill" aria-hidden="true"/>{broken.size} need{broken.size === 1 ? "s" : ""} fixing</span> : null}
      <span className={styles.spacer}/>
      {open ? <div className={styles.segmented} role="group" aria-label="Timeline view"><button aria-pressed={view === "track"} onClick={() => setView("track")}>Track</button><button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button></div> : null}
      {!preview ? <button className={styles.smallButton} disabled={events.length >= 200} onClick={onAdd}><Plus aria-hidden="true"/>Add event</button> : null}
      <button className={styles.iconButton} aria-expanded={open} aria-label={open ? "Collapse timeline" : "Expand timeline"} onClick={onToggle}>{open ? <CaretDown aria-hidden="true"/> : <CaretUp aria-hidden="true"/>}</button>
    </header>
    {!open ? null : !events.length ? <p className={styles.outlineNote}>No events yet. Add one to make pilots call, aircraft appear or notes show up at the right moment.</p> : view === "track" ? <div className={styles.track}>
      <span/><div className={styles.ruler} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <time key={i} style={i === 5 ? {right: 0} : {left: `${i * 20}%`}}>{timeLabel(i * step)}</time>)}</div>
      <span className={styles.laneLabel}>Timed</span>
      <div ref={setLane} className={styles.timedLane}>{[1, 2, 3, 4].map(i => <span key={i} className={styles.tick} style={{left: `${i * 20}%`}} aria-hidden="true"/>)}
        {timed.map(e => {const at = e.trigger.type === "time" ? e.trigger.at : 0, row = rows.get(e.id); return row === undefined ? null : pill(e, {...(at / span > .75 ? {right: `${(1 - at / span) * 100}%`} : {left: `${at / span * 100}%`}), top: row ? 34 : 4});})}
        {timed.map(e => {const at = e.trigger.type === "time" ? e.trigger.at : 0, state = states?.[e.id]; return <button key={e.id} className={styles.marker} style={{left: `${at / span * 100}%`}} aria-pressed={selected === e.id} data-done={state?.status === "completed" || state?.status === "skipped" || undefined} data-bad={!!broken.get(e.id) || state?.status === "blocked" || undefined} title={`${timeLabel(at)} · ${e.title}`} aria-label={`${timeLabel(at)} ${e.title}`} onClick={() => onSelect(e.id)}/>;})}
        {preview ? <span className={styles.playhead} style={{left: `${Math.min(1, preview.exercise.elapsed / span) * 100}%`}} aria-hidden="true"/> : null}
      </div>
      {conditional.length ? <><span className={styles.laneLabel}>On condition</span><div className={styles.flowLane}>{conditional.map(e => pill(e))}</div></> : null}
      {manual.length ? <><span className={styles.laneLabel}>Mentor release</span><div className={styles.flowLane}>{manual.map(e => pill(e))}</div></> : null}
    </div> : <div className={styles.eventList}>{events.map((e, index) => {
      const state = states?.[e.id], dependencyError = broken.get(e.id);
      return <div className={`${styles.eventRow} ${dependencyError ? styles.brokenEvent : ""}`} key={e.id}><button aria-pressed={selected === e.id} onClick={() => onSelect(e.id)}><time>{triggerText(e)}</time><strong>{e.title}</strong>{dependencyError ? <span title={dependencyError}><Warning weight="fill" aria-label={`Broken event: ${dependencyError}`} className={styles.dependencyWarning}/></span> : null}<span>{state?.status ?? `${e.actions.length} action${e.actions.length === 1 ? "" : "s"}`}</span></button>{preview ? state && ["waiting", "blocked"].includes(state.status) ? <button disabled={!preview.exercise.running || e.trigger.type !== "manual" && state.status !== "blocked"} onClick={() => onRun(e.id)}>{state.status === "blocked" ? "Retry" : "Run"}</button> : null : <button disabled={index === 0} aria-label={`Move ${e.title} earlier in list`} onClick={() => onMove(index)}><ArrowUp aria-hidden="true"/></button>}{state?.error ? <small className={styles.eventError}>{state.error}</small> : null}</div>;
    })}</div>}
  </section>;
}
