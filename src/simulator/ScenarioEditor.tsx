"use client";
import {randomCallsign} from "./callsigns";
import LocalAircraftDialog from "./LocalAircraftDialog";
import {addLocalScenarioAircraft} from "./local-aircraft";
import {memo, useCallback, useDeferredValue, useEffect, useMemo, useState} from "react";
import Link from "next/link";
import {Warning} from "@phosphor-icons/react/dist/csr/Warning";
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
import {blankScenario, normalizeScenario, normalizeScenarioAircraft, gatesFor, isGroundSpawn, createScenarioExercise, scenarioSchemaFor, seedFromAircraft, timeLabel, type ScenarioDefinition, type ScenarioRecord, type ScenarioRuntime} from "./scenarios";
import {sessionJson} from "./shared-transport";
import {trainingRequest} from "./TrainingLibrary";
import ScenarioEventEditor, {defaultEvent} from "./ScenarioEventEditor";
import type {Exercise, Point, Runway} from "./model";
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
  return <EditorScreen><main className={`${sim.simulator} ${styles.editor}`}>
    <header className={styles.editorHeader}><Link href="/sweatbox/scenarios" onClick={e => {if (dirty && !window.confirm("Leave without saving your draft?")) e.preventDefault();}}>← Scenarios</Link><input aria-label="Scenario name" maxLength={80} value={draft.title} disabled={!!preview} onChange={e => setDraft({...draft, title: e.target.value})}/><span role="status">{preview ? `Test · ${timeLabel(preview.exercise.elapsed)}` : !record ? "Not saved yet" : dirty ? "Unsaved changes" : "Saved"}</span>{preview ? <><button onClick={() => previewCommand(preview.exercise.running ? "pause" : "play")}>{preview.exercise.running ? "Pause test" : "Start test"}</button><button onClick={() => setPreview(null)}>Back to editor</button></> : <><button disabled={busy} onClick={() => void save()}>Save draft</button><button disabled={busy} onClick={test}>Test</button><button className={styles.primary} disabled={busy} onClick={() => void publish()}>Publish{record?.publishedRevision ? ` v${record.publishedRevision + 1}` : ""}</button></>}</header>
    <aside className={styles.outline}><button onClick={() => {select(null); setNotes(false);}}>Airport & frequency</button><button aria-pressed={notes} onClick={() => {setNotes(true); setEventId(""); select(null); setNotes(true);}}>Instructor notes</button><div className={styles.outlineHeading}><h2>Traffic <small>{draft.aircraft.length}</small></h2></div>{!preview ? <div className={styles.actions}>{radarMode === "local" ? <button disabled={draft.aircraft.length >= 50} onClick={() => setAddingAircraft(true)}>+ Add aircraft</button> : <><button disabled={draft.aircraft.length >= 50} onClick={() => addAircraft(true)}>+ Airborne</button></>}</div> : null}<div className={styles.outlineList}>{draft.aircraft.map(p => <button key={p.key} aria-pressed={selected === p.key && !eventId} onClick={() => select(p.key)}><strong>{p.seed.callsign}</strong><small>{p.seed.type} · {(preview ? preview.exercise.aircraft.find(a => a.id === preview.runtime.aircraftIds[p.key])?.frequency : p.seed.frequency) ?? "No frequency"}</small><small>{p.initial ? "Present at Start" : "Scheduled spawn"}{preview && !preview.exercise.aircraft.some(a => a.id === preview.runtime.aircraftIds[p.key]) ? " · Not present" : ""}</small></button>)}</div><footer>{environmentLabel(draft)}<br/>{record ? <>Created by {record.ownerName || record.ownerId}<br/></> : null}</footer></aside>
    <div className={styles.editorScope}><EditorScope messages={preview?.exercise.messages} accountId={accountId} key={`${AIRPORT.icao}:${radarMode}`} airport={AIRPORT} radarEnvironment={draft.radarEnvironment} radarMode={radarMode === "local" ? undefined : radarMode} autoReadback={preview?.exercise.autoReadback} aircraft={preview?.exercise.aircraft ?? scopeAircraft} running={preview?.exercise.running ?? false} frequency="all" gates={!preview && ground && !editMode ? scopeGates : undefined} selectedGate={spec?.gateId} onGateSelect={selectGate} onGateDrop={placeAtGate} selected={preview ? preview.runtime.aircraftIds[selected] ?? null : selected || null} onSelect={selectOnScope} editMode={preview ? "" : editMode} onPoint={point} groundRouteMode="scenario" groundRouteRequest={preview ? undefined : taxiRequest} onGroundClearance={preview ? undefined : saveTaxiRoute}/></div>
    <aside className={styles.inspector} aria-label="Scenario settings">
    {event && brokenEvents.has(event.id) ? <p role="alert" className={styles.error}>{brokenEvents.get(event.id)}</p> : null}
    {preview ? <div className={styles.inspectorFields}><h2>{draft.title}</h2><p>Preview movement and scheduled requests. This does not change any training session.</p><button onClick={test}>Restart test from 00:00</button><label><input type="checkbox" checked={!!preview.exercise.autoReadback} onChange={e => {const enabled = e.target.checked; setPreview(current => current ? {...current, exercise: applyEnvelope(current.exercise, {id: crypto.randomUUID(), time: Date.now(), action: {kind: "auto-readback", enabled}}).state} : current);}}/>Automatic during rehearsal</label><h3>Messages</h3>{preview.exercise.messages.slice(-15).map(m => <p key={m.id} className={styles.previewMessage}>{m.text}</p>)}{record?.publishedRevision ? <button disabled={busy} onClick={async () => {setBusy(true); try {const value = await trainingRequest(csrf, `scenarios/${record.id}`, {action: "launch", revision: record.publishedRevision}); router.push(`/sweatbox/staff?session=${value.sessionId}`);} catch (e) {setError((e as Error).message); setBusy(false);}}}>Create session from revision {record.publishedRevision}</button> : null}</div> : notes ? <div className={styles.inspectorFields}><h2>Instructor notes</h2><label>Instructor notes<textarea rows={8} maxLength={6000} value={draft.instructorNotes} onChange={e => setDraft({...draft, instructorNotes: e.target.value})}/></label></div> : event ? <ScenarioEventEditor event={event} definition={draft} onChange={value => setDraft(d => ({...d, events: d.events.map(e => e.id === value.id ? value : e)}))} onRemove={() => {setDraft(d => ({...d, events: d.events.filter(e => e.id !== event.id)})); setEventId("");}} onPickPosition={() => setEditMode("condition")}/> : a && spec ? <ScenarioAircraftInspector key={selected} definition={draft} aircraft={a} onChange={setDraft} onRemove={removeAircraft} editMode={editMode} onEditMode={setEditMode} onPlanTaxi={runway => setTaxiRequest({aircraftId: selected, runway, serial: Date.now()})} onError={setError}/> : <ScenarioSetup compact definition={draft} onChange={setDraft} locked={!!draft.aircraft.length || !!draft.events.length}/>}
    </aside>
    <section className={`${styles.timeline} ${timeline ? "" : styles.collapsed}`} aria-label="Scenario timeline"><header><button onClick={() => setTimeline(!timeline)} aria-expanded={timeline}>Timeline · {draft.events.length} events {timeline ? "⌄" : "⌃"}</button>{!preview ? <button disabled={draft.events.length >= 200} onClick={() => {const next = defaultEvent(draft); setDraft(d => ({...d, events: [...d.events, next]})); setEventId(next.id); setNotes(false); setEditMode(""); setTimeline(true);}}>+ Add event</button> : null}</header>{timeline ? <div className={styles.eventList}>{draft.events.length ? draft.events.map((e, index) => {
      const state = preview?.runtime.events[e.id], dependencyError = brokenEvents.get(e.id);
      return <div className={`${styles.eventRow} ${dependencyError ? styles.brokenEvent : ""}`} key={e.id}><button aria-pressed={eventId === e.id} onClick={() => {setEventId(e.id); setNotes(false); setEditMode("");}}><time>{e.trigger.type === "time" ? timeLabel(e.trigger.at) : e.trigger.type === "manual" ? "Manual" : "Condition"}</time><strong>{e.title}</strong>{dependencyError ? <span title={dependencyError}><Warning weight="fill" aria-label={`Broken event: ${dependencyError}`} className={styles.dependencyWarning}/></span> : null}<span>{state?.status ?? `${e.actions.length} action${e.actions.length === 1 ? "" : "s"}`}</span></button>{preview ? state && ["waiting", "blocked"].includes(state.status) ? <button disabled={!preview.exercise.running || e.trigger.type !== "manual" && state.status !== "blocked"} onClick={() => setPreview(current => {if (!current) return current; const runtime = structuredClone(current.runtime); return {runtime, exercise: executeScenarioEvent(current.exercise, runtime, e.id, Date.now())};})}>{state.status === "blocked" ? "Retry" : "Run"}</button> : null : <button disabled={index === 0} aria-label={`Move ${e.title} earlier in list`} onClick={() => setDraft(d => {const events = [...d.events]; [events[index - 1], events[index]] = [events[index], events[index - 1]]; return {...d, events};})}>↑</button>}{state?.error ? <small className={styles.eventError}>{state.error}</small> : null}</div>;
    }) : <p>No events</p>}</div> : null}</section>
    {addingAircraft && !preview ? <LocalAircraftDialog selection={draft} aircraft={aircraft} callsigns={draft.aircraft.map(a => a.seed.callsign)} scenario enabled onAdd={(next, gateId, at) => {
      const updated = addLocalScenarioAircraft(draft, next, gateId, at); setDraft(updated); select(next.id); return true;
    }} onClose={() => setAddingAircraft(false)}/> : null}
    {editMode ? <div className={styles.pickHint}>{editMode === "condition" ? "Click the condition location" : "Click to place aircraft"}<button onClick={() => setEditMode("")}>Done</button></div> : null}
    {error || notice ? <div className={`${styles.editorNotice} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}>{error || notice}<button aria-label="Dismiss notice" onClick={() => {setError(""); setNotice("");}}>×</button></div> : null}
  </main></EditorScreen>;
}
