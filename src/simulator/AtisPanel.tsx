"use client";
import {LETTERS} from "./catalog";
import {ATIS_REMARKS, ATIS_NOTAMS, ATIS_DIRECTIONS, atisFrequencies, atisRunwayWind, currentAtisOptions, type AtisDirection} from "./atis-options";
import {EXERCISE_WEATHER, type Action, type Atis, type Exercise, type ExerciseWeather} from "./model";
import {getAirport, runwayEnds, simulatedMetar} from "./airports";
import {trueToMagnetic} from "./magnetic-headings";
import {useNavigationCatalog} from "./use-navigation-catalog";
import styles from "./AtisPanel.module.css";

type Selection = "departures" | "arrivals" | "expectations" | "remarks" | "notams" | "procedures";
export default function AtisPanel({exercise, dispatch, connected}: {exercise: Exercise; dispatch: (a: Action) => void; connected: boolean}) {
  const airport = getAirport(exercise), weather: ExerciseWeather = exercise.weather ?? EXERCISE_WEATHER;
  const {catalog, error, retry} = useNavigationCatalog(airport.icao);
  const draft = currentAtisOptions(exercise.atis), editable = connected && !draft.publicText;
  const frequencies = atisFrequencies(airport, exercise.radarEnvironment);
  const procedures = [...new Set([...(catalog?.procedures.filter(p => p.type !== "Approach").map(p => `${p.name}\n${p.type}`) ?? []), ...draft.procedures])];
  const toggle = (field: Selection, value: string) => {
    const values = draft[field];
    dispatch({kind: "atis", draft: {...draft, [field]: values.includes(value) ? values.filter(x => x !== value) : field === "expectations" ? [value] : [...values, value]} as Atis});
  };
  const toggleDirection = (facilityId: string, direction: AtisDirection) => {
    const assignments = draft.frequencyAssignments ?? [], directions = assignments.find(a => a.facilityId === facilityId)?.directions ?? [];
    dispatch({kind: "atis", draft: {...draft, frequencyAssignments: [...assignments.filter(a => a.facilityId !== facilityId), {facilityId, directions: directions.includes(direction) ? directions.filter(d => d !== direction) : [...directions, direction]}]}});
  };
  const tiles = (field: "remarks" | "notams", options: readonly {label: string}[]) => [...new Set([...options.map(o => o.label), ...draft[field]])].map(value =>
    <button type="button" key={value} disabled={!editable} aria-pressed={draft[field].includes(value)} onClick={() => toggle(field, value)}>{value.toUpperCase()}</button>);
  const wind = weather.windSpeed < 3 && (weather.windGust ?? 0) < 3 ? "CALM" : `${weather.variableWind ? "Wind Variable" : `${Math.floor(trueToMagnetic(weather.windDirection, airport) / 10) * 10}°(M)`} at ${weather.windSpeed}${(weather.windGust ?? 0) > 3 ? ` Gust ${weather.windGust}` : ""}`;
  return <section className={styles.panel} aria-label="ATIS editor">
    <div className={styles.weather}>{simulatedMetar(airport, exercise.weather)}</div>
    <header className={styles.toolbar}>
      <span>WIND: {wind}</span>
      <label>ATIS INFORMATION<select aria-label="ATIS information" value={draft.letter} disabled={!editable} onChange={e => dispatch({kind: "atis", draft: {...draft, letter: e.target.value}})}>{[...new Set([...LETTERS.map(letter => letter === "XRAY" ? "X-RAY" : letter), draft.letter])].map(letter => <option key={letter}>{letter}</option>)}</select></label>
      <button type="button" disabled={!connected} onClick={() => dispatch({kind: "publish-atis"})}>PUBLISH</button>
    </header>
    <div className={styles.grid}>
      <section className={styles.runways} aria-labelledby="atis-runways"><h2 id="atis-runways">RUNWAYS</h2><div className={styles.runwayChoices}>
        {runwayEnds(airport).toSorted((a, b) => a.id.localeCompare(b.id)).flatMap(runway => (["departures", "arrivals"] as const).map(field => <button type="button" key={`${runway.id}-${field}`} aria-label={`${runway.id} ${field === "departures" ? "DEP" : "LDG"}`} disabled={!editable} className={styles[atisRunwayWind(runway.heading, weather)]} aria-pressed={draft[field].includes(runway.id)} onClick={() => toggle(field, runway.id)}>{runway.id}<br/>{field === "departures" ? "DEP" : "LDG"}</button>))}
        {["ILS", "GPS", "VISUAL"].map(value => <button type="button" key={value} aria-label={`EXP ${value}`} disabled={!editable} aria-pressed={draft.expectations.includes(value)} onClick={() => toggle("expectations", value)}>EXP<br/>{value}</button>)}
      </div></section>
      <div className={styles.middle}>
        <section aria-labelledby="atis-remarks"><h2 id="atis-remarks">REMARKS</h2><div className={styles.tiles}>{tiles("remarks", ATIS_REMARKS)}</div></section>
        <section className={styles.procedures} aria-labelledby="atis-procedures"><h2 id="atis-procedures">PROCEDURES</h2><div className={styles.procedureChoices}>{procedures.map(value => <button type="button" key={value} disabled={!editable} aria-pressed={draft.procedures.includes(value)} onClick={() => toggle("procedures", value)}>{value}</button>)}</div>{!catalog ? <p role="status">{error ?? "Loading procedures…"}{error ? <button disabled={!connected} onClick={retry}>Retry</button> : null}</p> : null}</section>
      </div>
      <div className={styles.right}>
        <section aria-labelledby="atis-notams"><h2 id="atis-notams">NOTAMS</h2><div className={styles.tiles}>{tiles("notams", ATIS_NOTAMS)}</div></section>
        <section className={styles.frequencies} aria-labelledby="atis-frequencies"><h2 id="atis-frequencies">FREQUENCIES</h2>{frequencies.length ? <div className={styles.frequencyCards}>{frequencies.map(f => <div key={f.id} className={styles.frequencyCard}><header>{f.name.toUpperCase()}<br/>{f.mhz}MHz</header><div className={styles.compass}>{ATIS_DIRECTIONS.map(direction => <button type="button" key={direction} className={styles[direction.toLowerCase()]} disabled={!editable} aria-label={`${f.name} ${f.mhz} ${direction}`} aria-pressed={draft.frequencyAssignments?.some(a => a.facilityId === f.id && a.directions.includes(direction)) ?? false} onClick={() => toggleDirection(f.id, direction)}>{direction.toUpperCase()}</button>)}</div></div>)}</div> : <p className={styles.noFrequencies}>NO MULTIPLE FREQUENCIES IN USE</p>}</section>
      </div>
    </div>
    <section className={styles.published} aria-label="Published ATIS" aria-live="polite">{exercise.publishedAtis}</section>
  </section>;
}
