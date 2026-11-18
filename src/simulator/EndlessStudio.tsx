
"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import SessionAccess from "./SessionAccess";
import {sessionJson} from "./shared-transport";
import {endlessEndpoint, endlessRequest} from "./endless/client";
import {sessionPath} from "./sessions";
import {endlessIssues, endlessKinds, endlessOperations, separationFor, type EndlessDefinition, type EndlessStream} from "./endless/definition";
import styles from "./EndlessStudio.module.css";

export interface EndlessPaths {home: string; sessions: string}
type Saved = {id: string; version: number; definition: EndlessDefinition};
type Library = {
  presets: Record<string, EndlessDefinition>;
  airports: {icao: string; sectors: {id: string; name: string}[]}[];
  custom: Saved[];
  runs: {id: string; title: string; airport: string}[];
  replays: {id: string; title: string; duration: number; ended_at: number}[];
};
type Selection = {key: string; definition: EndlessDefinition; custom?: Saved; dirty: boolean};

const modes = {local: "Ground & Tower", approach: "Approach", center: "Center"};
const kinds = {arrival: "Arrival", departure: "Departure", pattern: "Pattern", "intra-sector": "Intra-sector"};

export function EndlessBriefing({definition}: {definition: EndlessDefinition}) {
  const minimum = separationFor(definition.mode);
  return <section className={styles.brief} aria-label="Operational briefing">
    <h2>{definition.title || "Custom scenario"}</h2>
    <p className={styles.meta}>{definition.airport} · {modes[definition.mode]}</p>
    <p>{definition.briefing}</p>
    <ul>{endlessOperations(definition).map((label, i) => <li key={i}>{label}</li>)}</ul>
    {definition.issuePercent > 0 && definition.mode !== "local" ? <p>Possible inbound issues ({definition.issuePercent}% of recurring arrivals) include {endlessIssues.map(issue => issue[0].toLowerCase() + issue.slice(1)).join(", ")}.</p> : null}
    <p>{minimum ? `Simulated loss of separation is below ${minimum.nm} NM and ${minimum.feet.toLocaleString()} ft. ` : ""}{definition.mode !== "center" ? "A runway conflict is overlapping pavement occupancy during a takeoff or landing roll." : "Terminal runway operations are simulated outside your position."}</p>
  </section>;
}

function defaultStream(airport: string, mode: EndlessDefinition["mode"]): EndlessStream {
  return {name: mode === "local" ? "Gate departures" : "External arrivals", kind: mode === "local" ? "departure" : "arrival",
    rate: mode === "local" ? 12 : mode === "approach" ? 60 : 15,
    origin: mode === "local" ? airport : "EIDW", destination: mode === "local" ? "EIDW" : airport, runway: "24"};
}

function newDefinition(airport: string): EndlessDefinition {
  return {title: "Custom scenario", briefing: "", airport, mode: "local", issuePercent: 0, streams: [defaultStream(airport, "local")]};
}

export default function EndlessStudio({paths}: {paths: EndlessPaths}) {
  return <SessionAccess role="staff" returnTo={paths.home}>{csrf => <Studio csrf={csrf} paths={paths}/>}</SessionAccess>;
}

function Studio({csrf, paths}: {csrf: string; paths: EndlessPaths}) {
  const [library, setLibrary] = useState<Library>();
  const [selection, setSelection] = useState<Selection>();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<"save" | "launch">();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [launchId, setLaunchId] = useState("");
  useEffect(() => {
    const request = new AbortController();
    void fetch(endlessEndpoint, {signal: request.signal, cache: "no-store"}).then(sessionJson).then((data: Library) => {
      setLibrary(data);
      setSelection(current => current ?? {key: "edinburgh", definition: data.presets.edinburgh, dirty: false});
      setLoading(false);
    }).catch(error => {
      if (!request.signal.aborted) {setLoading(false); setError(error.message);}
    });
    return () => request.abort();
  }, [retry]);
  const choose = (value: Selection, edit = false) => {setSelection(value); setEditing(edit); setLaunchId(""); setError(""); setSaved("");};
  const update = (definition: EndlessDefinition) => {
    setSelection(current => current ? {...current, definition, dirty: true} : undefined);
    setLaunchId("");
    setSaved("");
  };
  const submit = async (action: "save" | "launch") => {
    if (!selection) return;
    setBusy(action);
    setError("");
    setSaved("");
    try {
      if (action === "launch") {
        const id = launchId || crypto.randomUUID();
        setLaunchId(id);
        const result = await endlessRequest(csrf, {action, id, definition: selection.definition}) as {id: string};
        window.location.assign(sessionPath("staff", result.id));
      } else {
        const result = await endlessRequest(csrf, {action, id: selection.custom?.id, version: selection.custom?.version ?? 0, definition: selection.definition}) as Saved;
        setLibrary(current => current ? {...current, custom: [result, ...current.custom.filter(row => row.id !== result.id)]} : current);
        setSelection({key: result.id, custom: result, definition: result.definition, dirty: false});
        setSaved("Scenario saved.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Try again.");
    } finally {setBusy(undefined);}
  };

  return <main className={styles.page}>
    <header className={styles.header}><Link href={paths.sessions}>Sweatbox sessions</Link><h1>Endless practice</h1></header>
    {loading ? <p role="status">Loading scenarios…</p> : null}
    {!loading && !library ? <div><p role="alert">{error}</p><button type="button" onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></div> : null}
    {library && selection ? <>
      <div className={styles.workbench}>
        <aside aria-label="Traffic scenarios">
          <h2>Prebuilt scenarios</h2>
          <div className={styles.choices}>{Object.entries(library.presets).map(([key, definition]) =>
            <button type="button" key={key} disabled={!!busy} aria-pressed={selection.key === key} onClick={() => choose({key, definition, dirty: false})}>{definition.title}</button>)}</div>
          <h2>My scenarios</h2>
          <div className={styles.choices}>{library.custom.map(custom => <button type="button" key={custom.id} disabled={!!busy}
            aria-pressed={selection.key === custom.id} onClick={() => choose({key: custom.id, custom, definition: custom.definition, dirty: false})}>{custom.definition.title}</button>)}</div>
          <button type="button" disabled={!!busy} onClick={() => choose({key: "new", dirty: true, definition: newDefinition("EGPH")}, true)}>New custom scenario</button>
        </aside>
        <div className={styles.main}>
          <EndlessBriefing definition={selection.definition}/>
          {selection.key === "heathrow-single" ? <p><label>
            <input type="checkbox" checked={selection.definition.streams.some(stream => stream.kind === "departure" && stream.rate > 0)}
              disabled={!!busy} onChange={event => update({...selection.definition, streams: selection.definition.streams.map(stream =>
                stream.kind === "departure" ? {...stream, rate: event.target.checked ? 15 : 0} : stream)})}/> Enable runway 27R departures
          </label></p> : null}
          <div className={styles.actions}>
            <button className={styles.primary} type="button" disabled={!!busy} onClick={() => void submit("launch")}>{busy === "launch" ? "Preparing traffic…" : "Open practice run"}</button>
            {!editing ? <button type="button" disabled={!!busy} onClick={() => {
              if (selection.custom) setEditing(true);
              else choose({key: "new", definition: {...selection.definition, title: `${selection.definition.title} copy`.slice(0, 80)}, dirty: true}, true);
            }}>{selection.custom ? "Edit scenario" : "Duplicate and edit"}</button> : null}
          </div>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          {saved ? <p role="status">{saved}</p> : null}
          {editing ? <Editor definition={selection.definition} airports={library.airports} update={update} busy={!!busy} saving={busy === "save"}
            dirty={selection.dirty} save={() => void submit("save")}/> : null}
        </div>
      </div>
      <section className={styles.collections} aria-label="Saved activity">
        <div><h2>In progress</h2>{library.runs.length ? <ul>{library.runs.map(run => <li key={run.id}><a href={sessionPath("staff", run.id)}>{run.title}</a><small>{run.airport}</small></li>)}</ul> : <p>No open practice runs.</p>}</div>
        <div><h2>Endless replays</h2>{library.replays.length ? <ul>{library.replays.map(replay => <li key={replay.id}><Link href={`${paths.home}/replays/${replay.id}`}>{replay.title}</Link><small>{Math.floor(replay.duration / 60)} min</small></li>)}</ul> : <p>No recorded runs yet.</p>}</div>
      </section>
    </> : null}
  </main>;
}

function Editor({definition, airports, update, busy, saving, dirty, save}: {
  definition: EndlessDefinition; airports: Library["airports"]; update: (d: EndlessDefinition) => void; busy: boolean; saving: boolean; dirty: boolean; save: () => void;
}) {
  const sectors = airports.find(airport => airport.icao === definition.airport)?.sectors ?? [];
  const changeStream = (index: number, patch: Partial<EndlessStream>) =>
    update({...definition, streams: definition.streams.map((item, i) => i === index ? {...item, ...patch} : item)});
  const changeAirport = (airport: string) => {
    update({...definition, airport, sector: undefined, streams: definition.streams.map(stream => ({
      ...stream, origin: stream.origin === definition.airport ? airport : stream.origin, destination: stream.destination === definition.airport ? airport : stream.destination,
    }))});
  };
  return <form className={styles.editor} onSubmit={event => {event.preventDefault(); save();}}>
    <fieldset disabled={busy}>
      <legend>Scenario editor</legend>
      <div className={styles.fields}>
        <label>Scenario name<input required maxLength={80} value={definition.title} onChange={event => update({...definition, title: event.target.value})}/></label>
        <label>Position<select value={definition.mode} onChange={event => {
          const mode = event.target.value as EndlessDefinition["mode"];
          update({...definition, mode, sector: undefined, issuePercent: mode === "local" ? 0 : 20, streams: [defaultStream(definition.airport, mode)]});
        }}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Scope airport<select value={definition.airport} onChange={event => changeAirport(event.target.value)}>
          {airports.map(airport => <option key={airport.icao}>{airport.icao}</option>)}
        </select></label>
        {definition.mode === "center" ? <label>Center boundary<select required value={definition.sector ?? ""} onChange={event => update({...definition, sector: event.target.value || undefined})}>
          <option value="">{sectors.length ? "Choose a boundary" : "No mapped boundary"}</option>
          {sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
        </select></label> : null}
        {definition.mode !== "local" ? <label>Inbound issues (%)<input type="number" min={0} max={100} required value={definition.issuePercent}
          onChange={event => update({...definition, issuePercent: Number(event.target.value)})}/></label> : null}
      </div>
      <label>Briefing<textarea required maxLength={4000} rows={4} value={definition.briefing} onChange={event => update({...definition, briefing: event.target.value})}/></label>
      <h3>Traffic streams</h3>
      {definition.streams.map((stream, index) => {
        const patch = (value: Partial<EndlessStream>) => changeStream(index, value);
        return <details className={styles.stream} key={index} open={index === 0 || undefined}>
          <summary>{stream.name || `Stream ${index + 1}`} · {stream.rate ? `${stream.rate}/hour` : "Off"}</summary>
          <div className={styles.fields}>
            <label>Name<input required maxLength={100} value={stream.name} onChange={event => patch({name: event.target.value})}/></label>
            <label>Type<select value={stream.kind} onChange={event => patch({kind: event.target.value as EndlessStream["kind"]})}>
              {endlessKinds.filter(kind => definition.mode === "center" ? kind !== "pattern" : definition.mode === "approach" ? kind === "arrival" || kind === "departure" : kind !== "intra-sector")
                .map(kind => <option key={kind} value={kind}>{kinds[kind]}</option>)}
            </select></label>
            <label>Aircraft per hour<input required type="number" min={0} max={120} step="any" value={stream.rate} onChange={event => patch({rate: Number(event.target.value)})}/></label>
            <label>Runway end<input required maxLength={3} value={stream.runway} onChange={event => patch({runway: event.target.value.toUpperCase()})}/></label>
            <label>Origin ICAO<input required maxLength={4} value={stream.origin} onChange={event => patch({origin: event.target.value.toUpperCase()})}/></label>
            <label>Destination ICAO<input required maxLength={4} value={stream.destination} onChange={event => patch({destination: event.target.value.toUpperCase()})}/></label>
            {definition.mode !== "local" ? <>
              <label>Departure runway<input maxLength={3} value={stream.departureRunway ?? ""} onChange={event => patch({departureRunway: event.target.value.toUpperCase() || undefined})}/></label>
              <label>Arrival runway<input maxLength={3} value={stream.arrivalRunway ?? ""} onChange={event => patch({arrivalRunway: event.target.value.toUpperCase() || undefined})}/></label>
              <label>SID<input maxLength={100} value={stream.sid ?? ""} placeholder="Choose automatically" onChange={event => patch({sid: event.target.value || undefined})}/></label>
              <label>STAR<input maxLength={100} value={stream.star ?? ""} placeholder="Choose automatically" onChange={event => patch({star: event.target.value || undefined})}/></label>
              <label>En-route fixes<input maxLength={400} value={stream.via ?? ""} placeholder="Space-separated identifiers" onChange={event => patch({via: event.target.value || undefined})}/></label>
            </> : null}
          </div>
          <button type="button" disabled={definition.streams.length < 2}
            onClick={() => update({...definition, streams: definition.streams.filter((_, i) => i !== index)})}>Remove stream</button>
        </details>;
      })}
      <div className={styles.actions}>
        <button type="button" disabled={definition.streams.length >= 24}
          onClick={() => update({...definition, streams: [...definition.streams, defaultStream(definition.airport, definition.mode)]})}>Add stream</button>
        <button className={styles.primary} type="submit" disabled={!dirty}>{saving ? "Validating…" : "Save scenario"}</button>
      </div>
    </fieldset>
  </form>;
}
