
"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useMemo, useRef, useState} from "react";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretLeft} from "@phosphor-icons/react/dist/csr/CaretLeft";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {Plus} from "@phosphor-icons/react/dist/csr/Plus";
import LearningFrame from "../learning/LearningFrame";
import SessionAccess from "./SessionAccess";
import {sessionJson} from "./shared-transport";
import {endlessEndpoint, endlessRequest} from "./endless/client";
import {sessionPath} from "./sessions";
import {endlessIssues, endlessKinds, maxEndlessStreams, radarStreamRunways, separationFor, type EndlessDefinition, type EndlessStream} from "./endless/definition";
import styles from "./EndlessStudio.module.css";
import ui from "./Sweatbox.module.css";

type Saved = {id: string; version: number; definition: EndlessDefinition};
type Mode = EndlessDefinition["mode"];
type Kind = EndlessStream["kind"];
type Airport = {icao: string; runways?: string[]; sectors: {id: string; name: string}[]};
export type EndlessReplayRow = {id: string; title: string; duration: number; ended_at: number; report?: {
  score: number | null; separation: number; runway: number; collisions: number; terrain: number; unresolved: number; airport?: string; mode?: Mode;
}};
type Library = {
  presets: Record<string, EndlessDefinition>;
  airports: Airport[];
  custom: Saved[];
  runs: {id: string; title: string; airport: string; elapsed?: number; completed?: number; released?: number}[];
  replays: EndlessReplayRow[];
};
type Entry = {key: string; definition: EndlessDefinition; custom?: Saved};
type Draft = {definition: EndlessDefinition; custom?: Saved};

export const modeLabels: Record<Mode, string> = {local: "Ground & Tower", approach: "Approach", center: "Center"};
const kindLabels: Record<Kind, string> = {arrival: "Arrival", departure: "Departure", pattern: "Pattern", "intra-sector": "Between airports"};
const kindFallback: Record<Kind, number> = {arrival: 10, departure: 15, pattern: 6, "intra-sector": 3};
const modeHints: Record<Mode, string> = {local: "Gates, taxi, runway, circuits", approach: "Sequence arrivals · 3 NM", center: "En route · 5 NM · needs a boundary"};
const dayFormat = new Intl.DateTimeFormat("en-GB", {weekday: "long", day: "numeric", month: "long", timeZone: "UTC"});
const timeFormat = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"});
const icaoPattern = /^[A-Z]{4}$/, runwayPattern = /^(0[1-9]|[12][0-9]|3[0-6])[LRC]?$/;

export const kindsFor = (mode: Mode) => endlessKinds.filter(kind =>
  mode === "center" ? kind !== "pattern" : mode === "approach" ? kind === "arrival" || kind === "departure" : kind !== "intra-sector");
export const scoreTone = (score: number | null | undefined) => score === null || score === undefined ? "none" : score >= 80 ? "good" : score >= 50 ? "fair" : "poor";
const perHour = (definition: EndlessDefinition) => definition.streams.reduce((sum, stream) => sum + stream.rate, 0);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const runwaysText = (runways: string[]) => runways.length > 1 ? `${runways.slice(0, -1).join(", ")} or ${runways.at(-1)}` : runways[0] ?? "";
const cardRunways = (definition: EndlessDefinition) => {
  const used = [...new Set(definition.streams.filter(stream => stream.rate > 0).map(stream => stream.runway))];
  return used.length ? used.slice(0, 2).join(" + ") : definition.streams[0]?.runway ?? "";
};

/** One plain-language line per safety count, used by Past runs and the results page. */
export function incidentText(report: NonNullable<EndlessReplayRow["report"]>) {
  const parts = [
    report.separation ? plural(report.separation, "loss of separation", "losses of separation") : "",
    report.runway ? plural(report.runway, "runway conflict") : "",
    report.collisions ? plural(report.collisions, "collision") : "",
    report.terrain ? plural(report.terrain, "terrain impact") : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No incidents";
}

export function ScoreRules() {
  return <details className={styles.score} open>
    <summary>How the score works<span>out of 100</span></summary>
    <div className={styles.scoreBody}>
      <div className={styles.split} aria-hidden="true"><span/><span/></div>
      <div className={styles.scorePart}>
        <div><strong><span className={styles.safetyKey} aria-hidden="true"/>Safety</strong><b>75</b></div>
        <p>You start with all 75 and lose points for each incident.</p>
        <dl className={styles.penalties}>
          <div><dt>Loss of separation</dt><dd>−10</dd></div>
          <div><dt>Runway conflict</dt><dd>−15</dd></div>
          <div><dt>Collision or terrain impact</dt><dd>Score capped at 49</dd></div>
        </dl>
      </div>
      <div className={styles.scorePart}>
        <div><strong><span className={styles.completionKey} aria-hidden="true"/>Completion</strong><b>up to 25</b></div>
        <p>Your share of released aircraft that you finished, times 25.</p>
        <p className={`${styles.example} ${styles.mono}`}>21 of 30 finished → 18 points</p>
      </div>
      <div className={styles.worked}>
        <b>Example: 1 loss of separation, 21 of 30 finished</b>
        <span className={styles.mono}>75 − 10 + 18 = 83</span>
        <span className={styles.muted}>Aircraft still with you when you end the run count as unfinished.</span>
      </div>
    </div>
  </details>;
}

function defaultStream(airport: string, mode: Mode, kind?: Kind): EndlessStream {
  const chosen = kind ?? (mode === "local" ? "departure" : "arrival");
  const outbound = chosen === "departure" || chosen === "pattern";
  return {name: `${kindLabels[chosen]}s`, kind: chosen, rate: kindFallback[chosen] * (mode === "approach" && chosen === "arrival" ? 3 : 1),
    origin: outbound ? airport : "EIDW", destination: chosen === "pattern" ? airport : outbound ? "EIDW" : airport, runway: "24"};
}

function newDefinition(airport: string): EndlessDefinition {
  return {title: "Custom scenario", briefing: "", airport, mode: "local", issuePercent: 0, streams: [{...defaultStream(airport, "local"), name: "Gate departures"}]};
}

export default function EndlessStudio({home, replays}: {home: string; replays: boolean}) {
  const history = `${home}?view=replays`;
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo={replays ? history : home}>
    {csrf => <Studio csrf={csrf} home={home} history={history} replays={replays}/>}
  </SessionAccess></LearningFrame>;
}

function Studio({csrf, home, history, replays}: {csrf: string; home: string; history: string; replays: boolean}) {
  const [library, setLibrary] = useState<Library>();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const launchIds = useRef(new Map<string, string>());
  useEffect(() => {
    const request = new AbortController();
    void fetch(endlessEndpoint, {signal: request.signal, cache: "no-store"}).then(sessionJson).then((data: Library) => {
      setLibrary(data);
      setLoading(false);
    }).catch(error => {
      if (!request.signal.aborted) {setLoading(false); setError(error.message);}
    });
    return () => request.abort();
  }, [retry]);
  const launch = async (definition: EndlessDefinition) => {
    const key = JSON.stringify(definition);
    const id = launchIds.current.get(key) ?? crypto.randomUUID();
    launchIds.current.set(key, id);
    const result = await endlessRequest(csrf, {action: "launch", id, definition}) as {id: string};
    window.location.assign(sessionPath("staff", result.id));
  };

  if (library && draft && !replays) return <div className={`${ui.page} ${styles.page}`}><main className={`${ui.content} ${styles.wide}`}>
    <Builder key={draft.custom?.id ?? "new"} draft={draft} airports={library.airports} csrf={csrf} launch={launch} onBack={() => setDraft(undefined)}
      onSaved={saved => setLibrary(current => current ? {...current, custom: [saved, ...current.custom.filter(row => row.id !== saved.id)]} : current)}/>
  </main></div>;

  return <div className={`${ui.page} ${styles.page}`}><main className={`${ui.content} ${styles.wide}`}>
    <header className={ui.heading}>
      <div className={styles.intro}>
        <h1>Endless practice</h1>
        <p>Traffic keeps coming until you stop it. Work it on your own, then get a scored replay.</p>
      </div>
      <nav className={styles.views} aria-label="Endless views">
        <Link href={home} aria-current={!replays ? "page" : undefined}>Practice</Link>
        <Link href={history} aria-current={replays ? "page" : undefined}>Past runs</Link>
      </nav>
    </header>
    {loading ? <p role="status" className={ui.status}>{replays ? "Loading past runs…" : "Loading scenarios…"}</p> : null}
    {!loading && !library ? <div className={styles.card}><p role="alert" className={styles.error}>{error}</p><p><button className={ui.btn} type="button" onClick={() => {setLoading(true); setError(""); setRetry(value => value + 1);}}>Try again</button></p></div> : null}
    {library && replays ? <PastRuns library={library} home={home}/> : null}
    {library && !replays ? <Home library={library} csrf={csrf} home={home} launch={launch} edit={setDraft}/> : null}
  </main></div>;
}

function Home({library, csrf, home, launch, edit}: {library: Library; csrf: string; home: string; launch: (definition: EndlessDefinition) => Promise<void>; edit: (draft: Draft) => void}) {
  const router = useRouter();
  const entries = useMemo<Entry[]>(() => [
    ...Object.entries(library.presets).map(([key, definition]) => ({key, definition})),
    ...library.custom.map(custom => ({key: custom.id, definition: custom.definition, custom})),
  ], [library]);
  const [filter, setFilter] = useState<Mode | "all">("all");
  const [selected, setSelected] = useState(entries[0]?.key ?? "");
  const [switches, setSwitches] = useState<Record<string, Record<number, boolean>>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const bests = useMemo(() => {
    const result = new Map<string, number>();
    for (const replay of library.replays) {
      const score = replay.report?.score;
      if (typeof score === "number") result.set(replay.title, Math.max(score, result.get(replay.title) ?? -1));
    }
    return result;
  }, [library.replays]);
  const entry = entries.find(item => item.key === selected) ?? entries[0];
  const effective = (item: Entry): EndlessDefinition => ({...item.definition, streams: item.definition.streams.map((stream, index) => {
    const on = switches[item.key]?.[index] ?? stream.rate > 0;
    return {...stream, rate: on ? stream.rate || kindFallback[stream.kind] : 0};
  })});
  const shown = entries.filter(item => filter === "all" || item.definition.mode === filter);
  const groups = [
    {title: "Prebuilt scenarios", items: shown.filter(item => !item.custom)},
    {title: "Your scenarios", items: shown.filter(item => item.custom)},
  ].filter(group => group.items.length);
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key); setError("");
    try {await task();} catch (error) {setError(error instanceof Error ? error.message : "Try again."); setBusy("");}
  };
  const endRun = (id: string) => run(`end:${id}`, async () => {
    const result = await endlessRequest(csrf, {id, action: "end"}) as {replayId?: string};
    if (!result.replayId) throw new Error("The replay could not be opened. Try again.");
    router.push(`${home}/replays/${result.replayId}`);
  });

  return <>
    {library.runs.map(item => <section className={styles.resume} key={item.id} aria-label="Run in progress">
      <span className={styles.live}>Still running</span>
      <div className={styles.resumeMain}>
        <strong>{item.title}</strong>
        <span>{[item.airport, item.elapsed ? `${minutes(item.elapsed)} min in` : "", item.released ? `${item.completed ?? 0} of ${item.released} aircraft handled` : ""].filter(Boolean).join(" · ")}</span>
      </div>
      <div className={styles.row}>
        <button className={ui.btn} type="button" disabled={!!busy} onClick={() => void endRun(item.id)}>{busy === `end:${item.id}` ? "Saving…" : "End and see results"}</button>
        <a className={`${ui.btn} ${ui.primary}`} href={sessionPath("staff", item.id)}>Return to run<span className={ui.srOnly}> {item.title}</span></a>
      </div>
    </section>)}
    <div className={styles.filterBar}>
      <div className={styles.chips} role="group" aria-label="Filter by position">
        {(["all", "local", "approach", "center"] as const).map(mode => <button key={mode} type="button" aria-pressed={filter === mode} onClick={() => setFilter(mode)}>
          <span className={`${styles.swatch} ${mode === "all" ? "" : styles[mode]}`} aria-hidden="true"/>{mode === "all" ? "All" : modeLabels[mode]}
        </button>)}
      </div>
      <button className={`${ui.linkButton} ${styles.buildLink}`} type="button" onClick={() => edit({definition: newDefinition("EGPH")})}><Plus size={16} aria-hidden="true"/> Build your own</button>
    </div>
    {error ? <p role="alert" className={ui.error}>{error}</p> : null}
    <div className={styles.home}>
      <div className={styles.cardsColumn}>
        {groups.length ? groups.map(group => <section className={styles.cardGroup} key={group.title} aria-label={group.title}>
          <h2 className={styles.sectionTitle}>{group.title}</h2>
          <div className={styles.cardGrid}>{group.items.map(item => {
            const definition = effective(item), best = bests.get(item.definition.title), rate = perHour(definition);
            return <button className={styles.scenario} type="button" key={item.key} aria-pressed={entry?.key === item.key} onClick={() => setSelected(item.key)}>
              <span className={styles.scenarioTop}>
                <span className={`${styles.tag} ${styles[item.definition.mode]}`}>{modeLabels[item.definition.mode]}</span>
                <span className={styles.mono}>{item.definition.airport} · {cardRunways(definition)}</span>
                <span className={styles.best} data-none={best === undefined || undefined}>{best === undefined ? "Not tried yet" : `Best ${best}`}</span>
              </span>
              <strong>{item.definition.title}</strong>
              <span className={styles.scenarioFoot}><span>{rate} aircraft / hour</span><span>{plural(item.definition.streams.length, "stream")}</span></span>
            </button>;
          })}</div>
        </section>) : <div className={ui.emptyCard}><p>No scenarios for this position yet.</p></div>}
        <button className={styles.buildCard} type="button" onClick={() => edit({definition: newDefinition("EGPH")})}>
          <span aria-hidden="true"><Plus size={18}/></span>
          <span><strong>Build your own scenario</strong><small>Pick an airport and position, then set up the traffic streams.</small></span>
        </button>
      </div>
      {entry ? <Briefing entry={entry} definition={effective(entry)} busy={!!busy} launching={busy === "launch"}
        toggle={(index, on) => setSwitches(current => ({...current, [entry.key]: {...current[entry.key], [index]: on}}))}
        start={() => void run("launch", () => launch(effective(entry)))}
        edit={() => edit(entry.custom ? {definition: entry.custom.definition, custom: entry.custom}
          : {definition: {...entry.definition, title: `${entry.definition.title} copy`.slice(0, 80)}})}/> : null}
    </div>
  </>;
}

function Briefing({entry, definition, busy, launching, toggle, start, edit}: {
  entry: Entry; definition: EndlessDefinition; busy: boolean; launching: boolean; toggle: (index: number, on: boolean) => void; start: () => void; edit: () => void;
}) {
  const rate = perHour(definition), mode = definition.mode;
  return <aside className={styles.briefing} aria-labelledby="endless-briefing">
    <div>
      <div className={styles.scenarioTop}>
        <span className={`${styles.tag} ${styles[mode]}`}>{modeLabels[mode]}</span>
        <span className={styles.mono}>{definition.airport}</span>
      </div>
      <h2 id="endless-briefing">{definition.title}</h2>
    </div>
    <div>
      <div className={styles.briefHead}><h3 id="endless-briefing-traffic">Traffic</h3><span>{rate ? `${rate} an hour · about one every ${Math.round(600 / rate) / 10} min` : "All traffic is off"}</span></div>
      <div className={styles.streams} role="region" aria-labelledby="endless-briefing-traffic" tabIndex={0}>{definition.streams.map((stream, index) => {
        const on = stream.rate > 0;
        return <div className={`${styles.streamRow} ${styles[stream.kind]}`} key={index} data-off={!on || undefined}>
          <span className={styles.kindDot} aria-hidden="true"/>
          <span className={styles.streamText}><strong>{stream.name}</strong><span className={styles.mono}>{stream.origin} → {stream.destination} · RWY {stream.runway}</span></span>
          <span className={styles.rate}>{on ? stream.rate : entry.definition.streams[index]!.rate || kindFallback[stream.kind]}/h</span>
          <button className={styles.switch} type="button" role="switch" aria-checked={on} aria-label={stream.name} disabled={busy} onClick={() => toggle(index, !on)}/>
        </div>;
      })}</div>
    </div>
    <ScoreRules/>
    <div className={styles.startActions}>
      {!rate ? <p className={styles.error}>Turn on at least one traffic stream.</p> : null}
      <button className={`${ui.btn} ${ui.primary} ${ui.large}`} type="button" disabled={busy || !rate} onClick={start}><Play size={16} weight="fill" aria-hidden="true"/>{launching ? "Preparing traffic…" : "Start practice run"}</button>
      <button className={ui.btn} type="button" disabled={busy} onClick={edit}>{entry.custom ? "Edit scenario" : "Copy and edit"}</button>
    </div>
  </aside>;
}

type Check = {ok: boolean; text: string};
function streamRunways(stream: EndlessStream, mode: Mode, airport: string): {airport: string; runway: string | undefined}[] {
  if (mode === "local") return [{airport, runway: stream.runway}];
  const {departure, arrival} = radarStreamRunways(stream);
  return [{airport: stream.origin, runway: departure}, {airport: stream.destination, runway: arrival}];
}

function changeScopeRunway(stream: EndlessStream, mode: Mode, airport: string, runway: string): EndlessStream {
  if (mode === "local") return {...stream, runway};
  const updated = {...stream};
  if (stream.origin === airport) {
    if (stream.kind === "arrival" || stream.departureRunway) updated.departureRunway = runway;
    else updated.runway = runway;
  }
  if (stream.destination === airport) {
    if (stream.kind !== "arrival" || stream.arrivalRunway) updated.arrivalRunway = runway;
    else updated.runway = runway;
  }
  return updated;
}

function streamProblem(stream: EndlessStream, definition: EndlessDefinition, airports: Airport[]) {
  if (!icaoPattern.test(stream.origin) || !icaoPattern.test(stream.destination)) return "Enter four-letter airport codes for both ends.";
  if ([stream.runway, stream.departureRunway, stream.arrivalRunway].some(runway => runway !== undefined && !runwayPattern.test(runway)))
    return "Enter a runway end such as 27L.";
  for (const {airport, runway} of streamRunways(stream, definition.mode, definition.airport)) {
    const runways = airports.find(item => item.icao === airport)?.runways;
    if (runway && runways?.length && !runways.includes(runway)) return `${airport} has no runway ${runway}. Pick ${runwaysText(runways)}.`;
  }
  return "";
}

function Builder({draft, airports, csrf, launch, onBack, onSaved}: {
  draft: Draft; airports: Airport[]; csrf: string; launch: (definition: EndlessDefinition) => Promise<void>; onBack: () => void; onSaved: (saved: Saved) => void;
}) {
  const [definition, setDefinition] = useState(draft.definition);
  const [saved, setSaved] = useState(draft.custom);
  const [dirty, setDirty] = useState(!draft.custom);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<"save" | "start">();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const airport = airports.find(item => item.icao === definition.airport);
  const runways = airport?.runways;
  const sectors = airport?.sectors ?? [];
  const update = (next: EndlessDefinition) => {setDefinition(next); setDirty(true); setNotice("");};
  const changeStream = (index: number, patch: Partial<EndlessStream>) =>
    update({...definition, streams: definition.streams.map((item, i) => i === index ? {...item, ...patch} : item)});
  const changeAirport = (icao: string) => update({...definition, airport: icao, sector: undefined, streams: definition.streams.map(stream => ({
    ...stream, origin: stream.origin === definition.airport ? icao : stream.origin, destination: stream.destination === definition.airport ? icao : stream.destination,
  }))});
  const changeMode = (mode: Mode) => update({...definition, mode, sector: undefined, issuePercent: mode === "local" ? 0 : 20, streams: [defaultStream(definition.airport, mode)]});
  const common = new Set(definition.streams.flatMap(stream => streamRunways(stream, definition.mode, definition.airport))
    .filter(end => end.airport === definition.airport && end.runway).map(end => end.runway!));
  const runwayInUse = common.size === 1 ? [...common][0]! : "";
  const problems = definition.streams.map(stream => streamProblem(stream, definition, airports));
  const rate = perHour({...definition, streams: definition.streams.filter((_, i) => !problems[i])});
  const checks: Check[] = [
    {ok: !!definition.title.trim(), text: definition.title.trim() ? "Scenario has a name" : "Give the scenario a name"},
    problems.some(Boolean)
      ? {ok: false, text: `${plural(problems.filter(Boolean).length, "stream needs", "streams need")} fixing: ${definition.streams.filter((_, i) => problems[i]).map(stream => stream.name).join(", ")}`}
      : {ok: true, text: "Runways match the available airport data"},
    {ok: definition.streams.some(stream => stream.rate > 0), text: definition.streams.some(stream => stream.rate > 0) ? "At least one stream is on" : "Turn on at least one stream"},
    ...(definition.mode === "center" ? [{ok: !!definition.sector, text: definition.sector ? "Center boundary chosen" : "Choose a Center boundary"}] : []),
    {ok: !!definition.briefing.trim(), text: definition.briefing.trim() ? "Briefing written" : "Write a short briefing"},
    {ok: definition.streams.length <= maxEndlessStreams, text: `${definition.streams.length} of ${maxEndlessStreams} streams`},
  ];
  const valid = checks.every(check => check.ok);
  const save = async (start: boolean) => {
    setBusy(start ? "start" : "save"); setError(""); setNotice("");
    try {
      let current = saved;
      if (dirty || !current) {
        current = await endlessRequest(csrf, {action: "save", id: saved?.id, version: saved?.version ?? 0, definition}) as Saved;
        setSaved(current); setDefinition(current.definition); setDirty(false); onSaved(current);
      }
      if (start) await launch(current.definition);
      else {setNotice("Scenario saved."); setBusy(undefined);}
    } catch (error) {setError(error instanceof Error ? error.message : "Try again."); setBusy(undefined);}
  };
  const minimum = separationFor(definition.mode);

  return <form onSubmit={event => {event.preventDefault(); void save(false);}}>
    <div className={styles.builderBar}>
      <button className={ui.linkButton} type="button" onClick={onBack}><CaretLeft size={16} aria-hidden="true"/> Endless</button>
      <input className={styles.nameInput} aria-label="Scenario name" required maxLength={80} value={definition.title} disabled={!!busy} onChange={event => update({...definition, title: event.target.value})}/>
      {dirty ? <span className={styles.unsaved}>Unsaved changes</span> : null}
      {notice ? <span role="status" className={styles.muted}>{notice}</span> : null}
      <button className={ui.btn} type="submit" disabled={!!busy || !valid || (!dirty && !!saved)}>{busy === "save" ? "Saving…" : "Save"}</button>
      <button className={`${ui.btn} ${ui.primary}`} type="button" disabled={!!busy || !valid} onClick={() => void save(true)}>{busy === "start" ? "Preparing traffic…" : "Save and start"}</button>
    </div>
    {error ? <p role="alert" className={ui.error} style={{marginTop: 18}}>{error}</p> : null}
    <div className={styles.builder} style={{marginTop: 24}}>
      <div className={styles.builderMain}><fieldset disabled={!!busy}>
        <section className={styles.panel} aria-labelledby="endless-where">
          <h2 id="endless-where">Where you&apos;ll work</h2>
          <div className={styles.modes} role="radiogroup" aria-label="Position">
            {(["local", "approach", "center"] as const).map(mode => <button key={mode} type="button" role="radio" aria-checked={definition.mode === mode} className={styles[mode]}
              onClick={() => definition.mode !== mode && changeMode(mode)}>
              <span><span className={styles.swatch} aria-hidden="true"/>{modeLabels[mode]}</span><span>{modeHints[mode]}</span>
            </button>)}
          </div>
          <div className={styles.fieldGrid}>
            <label className={styles.label}>Airport
              <select className={styles.input} value={definition.airport} onChange={event => changeAirport(event.target.value)}>
                {airports.map(item => <option key={item.icao}>{item.icao}</option>)}
              </select></label>
            {runways?.length ? <label className={styles.label}>Runway in use
              <select className={styles.input} value={runways.includes(runwayInUse) ? runwayInUse : ""} onChange={event => event.target.value && update({...definition,
                streams: definition.streams.map(stream => changeScopeRunway(stream, definition.mode, definition.airport, event.target.value))})}>
                {!runways.includes(runwayInUse) ? <option value="">Choose runway</option> : null}
                {runways.map(runway => <option key={runway}>{runway}</option>)}
              </select></label> : null}
            {definition.mode === "center" ? <label className={styles.label}>Center boundary
              <select className={styles.input} required value={definition.sector ?? ""} onChange={event => update({...definition, sector: event.target.value || undefined})}>
                <option value="">{sectors.length ? "Choose a boundary" : "No mapped boundary"}</option>
                {sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
              </select></label> : null}
            {definition.mode !== "local" ? <label className={styles.label}>Inbound issues (%)
              <input className={styles.input} type="number" min={0} max={100} required value={definition.issuePercent} onChange={event => update({...definition, issuePercent: Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0)))})}/>
              <small>Share of arrivals that turn up with {endlessIssues.map(issue => issue.toLowerCase()).join(", ")}.</small></label> : null}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="endless-streams">
          <div className={styles.panelHead}><h2 id="endless-streams">Traffic streams</h2><span>Up to {maxEndlessStreams} streams · 0 to 120 aircraft an hour each</span></div>
          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHead}`} aria-hidden="true"><span>Type</span><span>Name</span><span>From → to</span><span>Runway</span><span>Per hour</span><span>On</span><span/></div>
            {definition.streams.map((stream, index) => {
              const patch = (value: Partial<EndlessStream>) => changeStream(index, value), expanded = open === index, problem = problems[index];
              const runwayAirport = definition.mode === "local" ? definition.airport : stream.kind === "arrival" ? stream.destination : stream.origin;
              return <div className={`${styles.tableItem} ${styles[stream.kind]}`} key={index}>
                <div className={styles.tableRow}>
                  <select className={`${styles.input} ${styles.kindSelect}`} aria-label={`Type of ${stream.name}`} value={stream.kind} onChange={event => patch({kind: event.target.value as Kind})}>
                    {kindsFor(definition.mode).map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
                  </select>
                  <input className={styles.input} aria-label="Stream name" required maxLength={100} value={stream.name} onChange={event => patch({name: event.target.value})}/>
                  <span className={styles.route}>
                    <input className={styles.input} aria-label={`${stream.name} origin`} required maxLength={4} value={stream.origin} onChange={event => patch({origin: event.target.value.toUpperCase()})}/>
                    <span aria-hidden="true">→</span>
                    <input className={styles.input} aria-label={`${stream.name} destination`} required maxLength={4} value={stream.destination} onChange={event => patch({destination: event.target.value.toUpperCase()})}/>
                  </span>
                  <input className={`${styles.input} ${styles.mono}`} aria-label={`${stream.name} runway`} aria-invalid={problem ? true : undefined} required maxLength={3} value={stream.runway} list={`endless-runways-${runwayAirport}`} onChange={event => patch({runway: event.target.value.toUpperCase()})}/>
                  <span className={styles.stepper}>
                    <button type="button" aria-label={`Fewer ${stream.name}`} onClick={() => patch({rate: Math.max(0, Math.round(stream.rate) - 1)})}>−</button>
                    <input type="number" aria-label={`${stream.name} aircraft per hour`} min={0} max={120} step="any" required value={stream.rate} onChange={event => patch({rate: Math.max(0, Math.min(120, Number(event.target.value) || 0))})}/>
                    <button type="button" aria-label={`More ${stream.name}`} onClick={() => patch({rate: Math.min(120, Math.round(stream.rate) + 1)})}>+</button>
                  </span>
                  <button className={styles.switch} type="button" role="switch" aria-checked={stream.rate > 0} aria-label={`${stream.name} on`} onClick={() => patch({rate: stream.rate > 0 ? 0 : kindFallback[stream.kind]})}/>
                  <button className={styles.caret} type="button" aria-expanded={expanded} aria-label={`More options for ${stream.name}`} onClick={() => setOpen(expanded ? null : index)}><CaretDown size={16} aria-hidden="true"/></button>
                </div>
                {problem ? <p className={styles.rowError}>{problem}</p> : null}
                {expanded ? <div className={styles.advanced}>
                  {definition.mode !== "local" ? <div className={styles.advancedGrid}>
                    <label className={styles.label}>Departure runway<input className={styles.input} maxLength={3} value={stream.departureRunway ?? ""} list={`endless-runways-${stream.origin}`} placeholder={stream.kind === "arrival" ? "Choose automatically" : "Same as runway"} onChange={event => patch({departureRunway: event.target.value.toUpperCase() || undefined})}/></label>
                    <label className={styles.label}>Arrival runway<input className={styles.input} maxLength={3} value={stream.arrivalRunway ?? ""} list={`endless-runways-${stream.destination}`} placeholder={stream.kind === "arrival" ? "Same as runway" : "Choose automatically"} onChange={event => patch({arrivalRunway: event.target.value.toUpperCase() || undefined})}/></label>
                    <label className={styles.label}>SID<input className={styles.input} maxLength={100} value={stream.sid ?? ""} placeholder="Choose automatically" onChange={event => patch({sid: event.target.value || undefined})}/></label>
                    <label className={styles.label}>STAR<input className={styles.input} maxLength={100} value={stream.star ?? ""} placeholder="Choose automatically" onChange={event => patch({star: event.target.value || undefined})}/></label>
                    <label className={styles.label} style={{gridColumn: "span 2"}}>En-route fixes<input className={styles.input} maxLength={400} value={stream.via ?? ""} placeholder="Space-separated identifiers" onChange={event => patch({via: event.target.value || undefined})}/></label>
                  </div> : <p className={styles.muted} style={{margin: 0}}>Ground & Tower streams have no route options.</p>}
                  <div className={styles.row}>
                    <button className={`${ui.btn} ${ui.small}`} type="button" disabled={definition.streams.length >= maxEndlessStreams}
                      onClick={() => {update({...definition, streams: [...definition.streams.slice(0, index + 1), {...stream, name: `${stream.name} copy`.slice(0, 100)}, ...definition.streams.slice(index + 1)]}); setOpen(index + 1);}}>Duplicate stream</button>
                    <button className={`${ui.btn} ${ui.small} ${ui.quiet} ${ui.danger}`} type="button" disabled={definition.streams.length < 2}
                      onClick={() => {update({...definition, streams: definition.streams.filter((_, i) => i !== index)}); setOpen(null);}}>Remove stream</button>
                  </div>
                </div> : null}
              </div>;
            })}
          </div>
          {airports.map(item => <datalist key={item.icao} id={`endless-runways-${item.icao}`}>
            {item.runways?.map(runway => <option key={runway} value={runway}/>)}
          </datalist>)}
          <div className={styles.adds}>
            <span>Add</span>
            {kindsFor(definition.mode).map(kind => <button key={kind} type="button" className={styles[kind]} disabled={definition.streams.length >= maxEndlessStreams}
              onClick={() => {update({...definition, streams: [...definition.streams, {...defaultStream(definition.airport, definition.mode, kind), runway: runwayInUse || definition.streams[0]?.runway || "24"}]}); setOpen(definition.streams.length);}}>
              <span className={styles.kindDot} aria-hidden="true"/>{kindLabels[kind]}
            </button>)}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="endless-brief">
          <h2 id="endless-brief">Briefing</h2>
          <label className={styles.label} style={{fontWeight: 400, color: "var(--dashboard-muted)"}}>What should this run practise? Shown before you start and on the results page.
            <textarea className={styles.input} required maxLength={4000} rows={3} value={definition.briefing} onChange={event => update({...definition, briefing: event.target.value})}/></label>
        </section>
      </fieldset></div>

      <aside className={styles.preview} aria-label="Preview">
        <section className={styles.panel}>
          <h2>Your first hour</h2>
          <div className={styles.total}>{plural(Math.round(rate), "aircraft", "aircraft")}{rate ? <span> · about one every {Math.round(600 / rate) / 10} min</span> : null}</div>
          {problems.some(Boolean) ? <p className={styles.muted} style={{margin: 0, fontSize: 13}}>Streams with problems are left out until they&apos;re fixed.</p> : null}
          <div className={styles.lanes}>
            {definition.streams.map((stream, index) => ({stream, index})).filter(({stream, index}) => stream.rate > 0 && !problems[index]).map(({stream, index}) => {
              const count = Math.min(120, Math.max(1, Math.round(stream.rate))), step = 100 / count, offset = (index * 7) % step;
              return <div className={`${styles.lane} ${styles[stream.kind]}`} key={index}>
                <div><span>{stream.name}</span><span className={styles.muted}>{stream.rate}/h</span></div>
                <div className={styles.laneTrack} aria-hidden="true">{Array.from({length: count}, (_, i) => <span key={i} style={{left: `${Math.min(98, 2 + i * step + offset * .9)}%`}}/>)}</div>
              </div>;
            })}
            <div className={`${styles.axis} ${styles.mono}`} aria-hidden="true"><span>0 min</span><span>30</span><span>60</span></div>
          </div>
          {minimum ? <p className={styles.muted} style={{margin: 0, fontSize: 13}}>Separation minimum: {minimum.nm} NM and {minimum.feet.toLocaleString()} ft.</p> : null}
        </section>
        <section className={styles.panel}>
          <h2>Checks</h2>
          <ul className={styles.checks}>{checks.map(check => <li key={check.text} data-bad={!check.ok || undefined}><span aria-hidden="true">{check.ok ? "✓" : "!"}</span><span>{check.text}</span></li>)}</ul>
        </section>
      </aside>
    </div>
  </form>;
}

function PastRuns({library, home}: {library: Library; home: string}) {
  const [today] = useState(() => dayFormat.format(new Date()));
  const bests = useMemo(() => {
    const result = new Map<string, {score: number | null; runs: number}>();
    for (const replay of library.replays) {
      const current = result.get(replay.title) ?? {score: null, runs: 0};
      const score = replay.report?.score ?? null;
      result.set(replay.title, {runs: current.runs + 1, score: score === null ? current.score : Math.max(score, current.score ?? -1)});
    }
    return [...result.entries()].slice(0, 8);
  }, [library.replays]);
  const days = useMemo(() => {
    const groups: {day: string; replays: EndlessReplayRow[]}[] = [];
    for (const replay of library.replays) {
      const formatted = dayFormat.format(replay.ended_at), day = formatted === today ? "Today" : formatted;
      const last = groups.at(-1);
      if (last?.day === day) last.replays.push(replay); else groups.push({day, replays: [replay]});
    }
    return groups;
  }, [library.replays, today]);
  if (!library.replays.length) return <div className={ui.emptyCard}><h2>No past runs yet</h2><p>End a practice run to save its scored replay here.</p><Link className={ui.btn} href={home}>Go to practice</Link></div>;
  return <>
    <section aria-labelledby="endless-bests" style={{display: "flex", flexDirection: "column", gap: 10}}>
      <h2 id="endless-bests" className={styles.sectionTitle}>Your bests</h2>
      <div className={styles.bests}>{bests.map(([title, best]) => <div key={title}>
        <span title={title}>{title}</span>
        <div><strong className={styles[scoreTone(best.score)]}>{best.score ?? "—"}</strong><span>{plural(best.runs, "run")}</span></div>
      </div>)}</div>
    </section>
    {days.map(group => <section key={group.day} aria-label={group.day} style={{display: "flex", flexDirection: "column", gap: 10}}>
      <h2 className={styles.sectionTitle}>{group.day}</h2>
      <div className={styles.runs}>{group.replays.map(replay => {
        const report = replay.report, tone = scoreTone(report?.score);
        const incidents = report ? incidentText(report) : "";
        return <article className={styles.run} key={replay.id}>
          <span className={`${styles.badge} ${styles[tone]}`} aria-label={report?.score === null || report?.score === undefined ? "No score" : `Score ${report.score}`}>{report?.score ?? "—"}</span>
          <div><strong>{replay.title}</strong><small>{[report?.airport, report?.mode ? modeLabels[report.mode] : "", `${timeFormat.format(replay.ended_at)} UTC`, `${minutes(replay.duration)} min`].filter(Boolean).join(" · ")}</small></div>
          <span className={`${styles.incidents} ${incidents === "No incidents" ? styles.good : styles.poor}`}>{incidents}</span>
          <Link className={ui.btn} href={`${home}/replays/${replay.id}`}>See results<span className={ui.srOnly}> {replay.title}</span></Link>
        </article>;
      })}</div>
    </section>)}
  </>;
}
