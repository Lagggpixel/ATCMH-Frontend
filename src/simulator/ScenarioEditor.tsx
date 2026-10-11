"use client";
import {useEffect, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import SessionAccess from "./SessionAccess";
import Scope from "./Scope";
import {AIRPORT, applyEnvelope, autoReadbacks, newAircraft, runwayGeometry} from "./engine";
import {planTaxiRoute} from "./taxi-routing";
import {advanceScenario, executeScenarioEvent} from "./scenario-engine";
import {blankScenario, normalizeScenario, normalizeScenarioAircraft, scenarioGates, isGroundSpawn, createScenarioExercise, scenarioSchema, seedFromAircraft, standPlacement, timeLabel, type ScenarioDefinition, type ScenarioRecord, type ScenarioRuntime} from "./scenarios";
import {sessionJson} from "./shared-transport";
import {trainingRequest} from "./TrainingLibrary";
import IntentionsControls from "./IntentionsControls";
import ScenarioEventEditor, {defaultEvent} from "./ScenarioEventEditor";
import {SpeedTargetsEditor} from "./SpeedControls";
import type {Aircraft, Exercise, Frequency, Leg, Point, Runway} from "./model";
import sim from "./Simulator.module.css";
import styles from "./Training.module.css";
type Preview = {exercise: Exercise; runtime: ScenarioRuntime};
export default function ScenarioEditor({id}: {id: string}) {
  return <SessionAccess role="staff" returnTo={`/simulator/scenarios/${id}`}>{csrf => <Editor key={id} id={id} csrf={csrf}/>}</SessionAccess>;
}

function Editor({id, csrf}: {id: string; csrf: string}) {
  const router = useRouter();
  const [record, setRecord] = useState<ScenarioRecord | null>(null), [draft, setDraft] = useState<ScenarioDefinition>(() => blankScenario());
  const [loading, setLoading] = useState(id !== "new"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(""), [eventId, setEventId] = useState(""), [briefing, setBriefing] = useState(false), [editMode, setEditMode] = useState(""), [hold, setHold] = useState(false), [timeline, setTimeline] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null), [altitudeReference, setAltitudeReference] = useState<"agl" | "msl">("agl");
  const [saved, setSaved] = useState(() => JSON.stringify(blankScenario()));
  const dirty = JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (id === "new") return;
    const controller = new AbortController();
    fetch(`/api/simulator/training/scenarios/${id}`, {cache: "no-store", signal: controller.signal}).then(sessionJson).then(value => {setRecord(value.scenario); setDraft(normalizeScenario(value.scenario.draft)); setSaved(JSON.stringify(normalizeScenario(value.scenario.draft))); setSelected(value.scenario.draft.aircraft[0]?.key ?? "");}).catch(reason => {if (!controller.signal.aborted) setError(reason.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [id]);
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
  const aircraft = draft.aircraft.map(a => ({...newAircraft(a.key, false), ...a.seed}));
  const spec = draft.aircraft.find(a => a.key === selected), a = aircraft.find(a => a.id === selected), event = draft.events.find(e => e.id === eventId);
  const ground = !!spec && isGroundSpawn(spec.seed);
  const patchAircraft = (patch: Partial<Aircraft>) => setDraft(d => ({...d, aircraft: d.aircraft.map(a => a.key === selected ? {...a, seed: {...a.seed, ...patch}} : a)}));
  const select = (key: string | null) => {setSelected(key ?? ""); setEventId(""); setBriefing(false); setEditMode("");};
  const save = async () => {
    setError(""); setNotice(""); const result = scenarioSchema.safeParse(draft);
    if (!result.success) {setError(result.error.issues.map(i => i.message).join(" ")); return null;}
    setBusy(true);
    try {
      const value = await trainingRequest(csrf, id === "new" ? "scenarios" : `scenarios/${id}`, id === "new" ? {draft: result.data} : {action: "save", draft: result.data, version: record!.version});
      setSaved(JSON.stringify(value.scenario.draft)); setRecord(value.scenario); setNotice("Draft saved.");
      if (id === "new") router.replace(`/simulator/scenarios/${value.scenario.id}`);
      return value.scenario as ScenarioRecord;
    } catch (reason) {setError((reason as Error).message); return null;} finally {setBusy(false);}
  };
  const publish = async () => {
    const current = dirty || !record ? await save() : record; if (!current) return;
    setBusy(true);
    try {const value = await trainingRequest(csrf, `scenarios/${current.id}`, {action: "publish", version: current.version}); setRecord(value.scenario); setNotice(`Revision ${value.scenario.publishedRevision} published. Existing assignments keep their original revision.`);}
    catch (reason) {setError((reason as Error).message);} finally {setBusy(false);}
  };
  const addAircraft = (air: boolean) => {
    const key = `traffic-${crypto.randomUUID().slice(0, 8)}`, next = newAircraft(key, air); next.callsign = `${air ? "Speedbird" : "Easy"} ${100 + draft.aircraft.length}`;
    setDraft(d => ({...d, aircraft: [...d.aircraft, {key, initial: true, seed: seedFromAircraft(next), ...(!air ? {gateId: scenarioGates.find(g => !d.aircraft.some(a => a.gateId === g.id))?.id ?? scenarioGates[0].id} : {})}].map(normalizeScenarioAircraft)})); select(key);
  };
  const scheduleAircraft = (initial: boolean) => {
    if (!spec) return;
    setDraft(d => ({...d, aircraft: d.aircraft.map(a => a.key === selected ? {...a, initial} : a), events: initial ? d.events.map(e => ({...e, actions: e.actions.filter(a => a.type !== "spawn" || a.aircraftKey !== selected)})).filter(e => e.actions.length) : [...d.events, {id: crypto.randomUUID().slice(0, 32), title: `Spawn ${spec.seed.callsign}`, trigger: {type: "time", at: 120}, actions: [{type: "spawn", aircraftKey: selected}]}]}));
  };
  const point = (p: Point) => {
    if (editMode === "condition" && event?.trigger.type === "condition" && event.trigger.condition.type === "position") {
      const trigger = {...event.trigger, condition: {...event.trigger.condition, point: p}};
      setDraft(d => ({...d, events: d.events.map(e => e.id === event.id ? {...e, trigger} : e)})); setEditMode(""); return;
    }
    if (!a || ground && editMode === "position") return;
    patchAircraft(editMode === "position" ? {position: p} : editMode === "taxi" ? {taxiPath: [...a.taxiPath, {...p, hold}]} : {flightPlan: [...a.flightPlan, p]});
    if (editMode === "position") setEditMode("");
  };
  const test = () => {
    const result = scenarioSchema.safeParse(draft); if (!result.success) {setError(result.error.issues.map(i => i.message).join(" ")); return;}
    setPreview(createScenarioExercise(result.data, "scenario-preview", crypto.randomUUID())); setEditMode(""); setError("");
  };
  const previewCommand = (command: "play" | "pause") => setPreview(current => {
    if (!current) return current; const runtime = structuredClone(current.runtime), result = applyEnvelope(current.exercise, {id: crypto.randomUUID(), time: Date.now(), action: {kind: command}});
    return {runtime, exercise: advanceScenario(result.state, runtime, 0, Date.now()).exercise};
  });
  if (loading) return <main className={styles.library}><p role="status">Loading scenario…</p></main>;
  return <main className={`${sim.simulator} ${styles.editor}`}>
    <header className={styles.editorHeader}><Link href="/simulator/scenarios" onClick={e => {if (dirty && !window.confirm("Leave without saving your draft?")) e.preventDefault();}}>← Scenarios</Link><input aria-label="Scenario name" maxLength={80} value={draft.title} disabled={!!preview} onChange={e => setDraft({...draft, title: e.target.value})}/><span role="status">{preview ? `Test · ${timeLabel(preview.exercise.elapsed)}` : dirty ? "Unsaved changes" : "Saved"}</span>{preview ? <><button onClick={() => previewCommand(preview.exercise.running ? "pause" : "play")}>{preview.exercise.running ? "Pause test" : "Start test"}</button><button onClick={() => setPreview(null)}>Back to editor</button></> : <><button disabled={busy} onClick={() => void save()}>Save draft</button><button disabled={busy} onClick={test}>Test</button><button className={styles.primary} disabled={busy} onClick={() => void publish()}>Publish{record?.publishedRevision ? ` v${record.publishedRevision + 1}` : ""}</button></>}</header>
    <aside className={styles.outline}><button aria-pressed={briefing} onClick={() => {setBriefing(true); setEventId(""); select(null); setBriefing(true);}}>Briefing & instructor notes</button><div className={styles.outlineHeading}><h2>Traffic <small>{draft.aircraft.length}</small></h2></div>{!preview ? <div className={styles.actions}><button disabled={draft.aircraft.length >= 50} onClick={() => addAircraft(false)}>+ Ground</button><button disabled={draft.aircraft.length >= 50} onClick={() => addAircraft(true)}>+ Airborne</button></div> : null}<div className={styles.outlineList}>{draft.aircraft.map(p => <button key={p.key} aria-pressed={selected === p.key && !eventId} onClick={() => select(p.key)}><strong>{p.seed.callsign}</strong><small>{p.seed.type} · {p.seed.frequency ?? "No frequency"}</small><small>{p.initial ? "Present at Start" : "Scheduled spawn"}{preview && !preview.exercise.aircraft.some(a => a.id === preview.runtime.aircraftIds[p.key]) ? " · Not present" : ""}</small></button>)}</div><footer>EGPH · Edinburgh<br/>{record ? <>Created by {record.ownerName || record.ownerId}<br/></> : null}Shared staff scenario</footer></aside>
    <div className={styles.editorScope}><Scope autoReadback={preview?.exercise.autoReadback} aircraft={preview?.exercise.aircraft ?? aircraft} running={preview?.exercise.running ?? false} frequency="all" selected={preview ? preview.runtime.aircraftIds[selected] ?? null : selected || null} onSelect={id => select(preview ? Object.entries(preview.runtime.aircraftIds).find(([, value]) => value === id)?.[0] ?? null : id)} editMode={preview ? "" : editMode} onPoint={point}/></div>
    <aside className={styles.inspector} aria-label="Scenario settings">
    {preview ? <div className={styles.inspectorFields}><p className={styles.eyebrow}>Isolated rehearsal</p><h2>{draft.title}</h2><p>This test has no mentee, database writes or live-session effects. It previews movement and scheduled requests.</p><button onClick={test}>Restart test from 00:00</button><label><input type="checkbox" checked={!!preview.exercise.autoReadback} onChange={e => {const enabled = e.target.checked; setPreview(current => current ? {...current, exercise: applyEnvelope(current.exercise, {id: crypto.randomUUID(), time: Date.now(), action: {kind: "auto-readback", enabled}}).state} : current);}}/>Automatic during rehearsal</label><h3>Messages</h3>{preview.exercise.messages.slice(-15).map(m => <p key={m.id} className={styles.previewMessage}>{m.text}</p>)}<p>Publish and launch a session to test the full controller/readback workflow.</p>{record?.publishedRevision ? <button disabled={busy} onClick={async () => {setBusy(true); try {const value = await trainingRequest(csrf, `scenarios/${record.id}`, {action: "launch", revision: record.publishedRevision}); router.push(`/simulator/staff?session=${value.sessionId}`);} catch (e) {setError((e as Error).message); setBusy(false);}}}>Create session from revision {record.publishedRevision}</button> : null}</div> : briefing ? <div className={styles.inspectorFields}><h2>Exercise briefing</h2><p>Use fictional callsigns and training events. Include only content you own or may reuse; avoid personal or sensitive data and copied manuals or exam questions.</p><label>Mentee briefing<textarea rows={8} maxLength={6000} value={draft.briefing} onChange={e => setDraft({...draft, briefing: e.target.value})}/></label><label>Private instructor notes<textarea rows={8} maxLength={6000} value={draft.instructorNotes} onChange={e => setDraft({...draft, instructorNotes: e.target.value})}/></label><small>Instructor notes and future events are never sent to mentees.</small></div> : event ? <ScenarioEventEditor event={event} definition={draft} onChange={value => setDraft(d => ({...d, events: d.events.map(e => e.id === value.id ? value : e)}))} onRemove={() => {setDraft(d => ({...d, events: d.events.filter(e => e.id !== event.id)})); setEventId("");}} onPickPosition={() => setEditMode("condition")}/> : a && spec ? <div className={styles.inspectorFields}><p className={styles.eyebrow}>Aircraft setup</p><label>Callsign<input value={a.callsign} maxLength={80} onChange={e => patchAircraft({callsign: e.target.value || "Aircraft"})}/></label><div className={styles.pair}><label>Type<input value={a.type} maxLength={12} onChange={e => patchAircraft({type: e.target.value || "A320"})}/></label><label>Frequency<select value={a.frequency ?? "none"} onChange={e => patchAircraft({frequency: e.target.value === "none" ? null : e.target.value as Frequency})}><option value="ground">Ground</option><option value="tower">Tower</option><option value="none">None</option></select></label></div>
    <label>Appears<select value={spec.initial ? "initial" : "scheduled"} onChange={e => scheduleAircraft(e.target.value === "initial")}><option value="initial">At Start</option><option value="scheduled">From a timeline event</option></select></label>
    <label>Initial behaviour<select value={a.mode} onChange={e => {const mode = e.target.value as Aircraft["mode"]; setDraft(d => ({...d, aircraft: d.aircraft.map(p => p.key === selected ? normalizeScenarioAircraft({...p, seed: {...p.seed, mode, speed: mode === "parked" ? 0 : 160, targetSpeed: mode === "parked" ? 0 : 160, altitude: mode === "parked" ? AIRPORT.elevation : AIRPORT.elevation + 1500}}) : p)}));}}><option value="parked">At a gate</option><option value="heading">Fly heading</option><option value="pattern">Fly pattern</option>{!["parked", "taxi", "heading", "pattern"].includes(a.mode) ? <option value={a.mode}>{a.mode}</option> : null}</select></label>
    <div className={styles.pair}><label>Heading °<input type="number" min={0} max={360} value={a.heading} onChange={e => patchAircraft({heading: Number(e.target.value), targetHeading: Number(e.target.value)})}/></label><label>Initial IAS (kt)<input disabled={ground} type="number" min={0} max={600} value={a.speed} onChange={e => patchAircraft({speed: Number(e.target.value), targetSpeed: Number(e.target.value)})}/></label></div>
    <div className={styles.pair}><label>Altitude ft<input disabled={ground} type="number" min={altitudeReference === "agl" ? 1 : AIRPORT.elevation + 1} max={altitudeReference === "agl" ? 60000 - AIRPORT.elevation : 60000} value={Math.round(a.altitude - (altitudeReference === "agl" ? AIRPORT.elevation : 0))} onChange={e => patchAircraft({altitude: Math.max(AIRPORT.elevation + 1, Number(e.target.value) + (altitudeReference === "agl" ? AIRPORT.elevation : 0))})}/></label><label>Reference<select value={altitudeReference} onChange={e => setAltitudeReference(e.target.value as "agl" | "msl")}><option value="agl">AGL</option><option value="msl">MSL</option></select></label></div>
    <div className={styles.pair}><label>Runway<select value={a.runway ?? "24"} onChange={e => patchAircraft({runway: e.target.value as Runway})}><option>24</option><option>06</option></select></label><label>Traffic<select value={a.hand} onChange={e => patchAircraft({hand: e.target.value as "left" | "right"})}><option>left</option><option>right</option></select></label></div><label>Pattern leg<select value={a.leg} onChange={e => patchAircraft({leg: e.target.value as Leg})}>{["upwind", "crosswind", "downwind", "base", "final"].map(leg => <option key={leg}>{leg}</option>)}</select></label><label>Landing outcome<select value={a.landing} onChange={e => patchAircraft({landing: e.target.value as "full-stop" | "touch-and-go"})}><option value="touch-and-go">Touch and go</option><option value="full-stop">Full stop</option></select></label>
    <h3>Intentions</h3><IntentionsControls aircraft={a} onEdit={patchAircraft}/>{!ground ? <button onClick={() => setDraft(d => {const id = `transition-${selected}`.slice(0, 32); return {...d, events: [...d.events.filter(event => event.id !== id), {id, title: "Request transition at Start", trigger: {type: "time", at: 0}, actions: [{type: "request", aircraftKey: selected, requestId: "transition", runway: a.runway ?? "24"}]}]};})}>Request Transition at Start</button> : null}<h3>Phase speeds <small>IAS · Blank = automatic</small></h3><SpeedTargetsEditor compact targets={a.speedTargets} onChange={speedTargets => patchAircraft({speedTargets, speedMode: "auto"})}/><h3>Spawn position</h3>{ground ? <><label>Gate<select value={spec.gateId ?? ""} onChange={e => {const p = standPlacement(e.target.value); if (p) setDraft(d => ({...d, aircraft: d.aircraft.map(a => a.key === selected ? normalizeScenarioAircraft({...a, gateId: e.target.value, seed: {...a.seed, ...p, targetHeading: p.heading}}) : a)}));}}>{scenarioGates.map(f => <option key={f.id} value={f.id}>Gate {f.name || f.id}</option>)}</select></label><small>Ground aircraft spawn parked at this gate. Taxi and pushback are controlled after the session starts.</small></> : <small>Airborne aircraft spawn at the position and altitude configured below.</small>}<button onClick={() => patchAircraft({heading: (a.heading + 180) % 360, targetHeading: (a.heading + 180) % 360})}>Reverse heading</button>{!ground ? <><div className={styles.pair}><label>East (NM)<input type="number" step=".01" value={a.position.x} onChange={e => patchAircraft({position: {...a.position, x: Number(e.target.value)}})}/></label><label>North (NM)<input type="number" step=".01" value={a.position.y} onChange={e => patchAircraft({position: {...a.position, y: Number(e.target.value)}})}/></label></div><button aria-pressed={editMode === "position"} onClick={() => setEditMode(editMode === "position" ? "" : "position")}>Place on scope</button><button onClick={() => {const g = runwayGeometry(a.runway ?? "24"); patchAircraft({position: {x: g.threshold.x - g.vector.x * 5, y: g.threshold.y - g.vector.y * 5}, heading: g.heading, targetHeading: g.heading, speed: 160, targetSpeed: 160, altitude: AIRPORT.elevation + 1500, mode: "heading"});}}>Place on runway approach</button></> : null}
    <h3>Taxi route <small>Controls ground movement</small></h3><button onClick={() => {const route = planTaxiRoute(AIRPORT, a.position, a.runway ?? "24"); if (route.error) setError(route.error); else {patchAircraft({taxiPath: route.path}); setError("");}}}>Calculate A* route to Runway {a.runway}</button><button aria-pressed={editMode === "taxi"} onClick={() => setEditMode(editMode === "taxi" ? "" : "taxi")}>{editMode === "taxi" ? "Done drawing taxi route" : "Draw taxi route"}</button><label className={styles.check}><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)}/>Next point is hold short</label><button onClick={() => patchAircraft({taxiPath: []})}>Clear {a.taxiPath.length} taxi points</button><h3>Flight plan <small>Display only; does not steer</small></h3><button aria-pressed={editMode === "flightplan"} onClick={() => setEditMode(editMode === "flightplan" ? "" : "flightplan")}>{editMode === "flightplan" ? "Done drawing flight plan" : "Draw flight plan"}</button><button onClick={() => patchAircraft({flightPlan: []})}>Clear {a.flightPlan.length} flight-plan points</button><button className={styles.danger} onClick={() => {if (!window.confirm("Remove this aircraft and all events that reference it?")) return; setDraft(d => ({...d, aircraft: d.aircraft.filter(p => p.key !== selected), events: d.events.filter(e => !(e.trigger.type === "condition" && "aircraftKey" in e.trigger.condition && e.trigger.condition.aircraftKey === selected)).map(e => ({...e, actions: e.actions.filter(a => !("aircraftKey" in a) || a.aircraftKey !== selected)})).filter(e => e.actions.length)})); select(null);}}>Remove aircraft</button></div> : <div className={styles.inspectorFields}><h2>Build your exercise</h2><p>Add traffic, place it on the scope, then schedule pilot requests below.</p><p>Changes remain in this draft until you publish a revision.</p></div>}
    </aside>
    <section className={`${styles.timeline} ${timeline ? "" : styles.collapsed}`} aria-label="Scenario timeline"><header><button onClick={() => setTimeline(!timeline)} aria-expanded={timeline}>Timeline · {draft.events.length} events {timeline ? "⌄" : "⌃"}</button>{!preview ? <button disabled={draft.events.length >= 200} onClick={() => {const next = defaultEvent(draft); setDraft(d => ({...d, events: [...d.events, next]})); setEventId(next.id); setBriefing(false); setEditMode(""); setTimeline(true);}}>+ Add event</button> : null}<small>{preview ? "Test events are independent of the saved draft" : "Same-time events run in this list order"}</small></header>{timeline ? <div className={styles.eventList}>{draft.events.length ? draft.events.map((e, index) => {
      const state = preview?.runtime.events[e.id];
      return <div className={styles.eventRow} key={e.id}><button aria-pressed={eventId === e.id} onClick={() => {setEventId(e.id); setBriefing(false); setEditMode("");}}><time>{e.trigger.type === "time" ? timeLabel(e.trigger.at) : e.trigger.type === "manual" ? "Manual" : "Condition"}</time><strong>{e.title}</strong><span>{state?.status ?? `${e.actions.length} action${e.actions.length === 1 ? "" : "s"}`}</span></button>{preview ? state && ["waiting", "blocked"].includes(state.status) ? <button disabled={!preview.exercise.running || e.trigger.type !== "manual" && state.status !== "blocked"} onClick={() => setPreview(current => {if (!current) return current; const runtime = structuredClone(current.runtime); return {runtime, exercise: executeScenarioEvent(current.exercise, runtime, e.id, Date.now())};})}>{state.status === "blocked" ? "Retry" : "Run"}</button> : null : <button disabled={index === 0} aria-label={`Move ${e.title} earlier in list`} onClick={() => setDraft(d => {const events = [...d.events]; [events[index - 1], events[index]] = [events[index], events[index - 1]]; return {...d, events};})}>↑</button>}{state?.error ? <small className={styles.eventError}>{state.error}</small> : null}</div>;
    }) : <p>Add a timed request, aircraft spawn or instructor note.</p>}</div> : null}</section>
    {editMode ? <div className={styles.pickHint}>{editMode === "condition" ? "Click the condition location" : editMode === "position" ? "Click to place aircraft" : `Click to add ${editMode === "taxi" ? "taxi" : "flight plan"} waypoints`}<button onClick={() => setEditMode("")}>Done</button></div> : null}
    {error || notice ? <div className={`${styles.editorNotice} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}>{error || notice}<button aria-label="Dismiss notice" onClick={() => {setError(""); setNotice("");}}>×</button></div> : null}
    <div className={styles.rotate}><p>Use fictional callsigns and training events. Include only content you own or may reuse; avoid personal or sensitive data and copied manuals or exam questions.</p><h1>Scenario editor</h1><p>Use a larger screen or rotate your tablet to landscape.</p><Link href="/simulator/scenarios">Back to scenarios</Link></div>
  </main>;
}
