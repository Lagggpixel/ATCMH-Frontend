"use client";
import {LETTERS, REMARKS} from "./catalog";
import {currentAtisOptions} from "./atis-options";
import {EXERCISE_WEATHER, METAR, type Action, type Atis, type Exercise} from "./model";
import styles from "./Simulator.module.css";

export default function AtisPanel({exercise, dispatch, connected}: {exercise: Exercise; dispatch: (a: Action) => void; connected: boolean}) {
  const draft = currentAtisOptions(exercise.atis);
  const dirty = JSON.stringify(exercise.publishedDraft) !== JSON.stringify(draft);
  const toggle = (field: "departures" | "arrivals" | "expectations" | "remarks" | "notams" | "procedures", value: string) => {
    const values: string[] = draft[field];
    dispatch({kind: "atis", draft: {...draft, [field]: values.includes(value) ? values.filter(x => x !== value) : [...values, value]} as Atis});
  };
  return <section className={`${styles.atis} ${styles.trainingAtis}`} aria-label="ATIS editor">
    <header><div><h1>Exercise information</h1><p>{METAR}<br/>{EXERCISE_WEATHER.reference}</p></div><button disabled={!connected || !dirty} onClick={() => dispatch({kind: "publish-atis"})}>Publish ATIS</button></header>
    <label>Information letter<select aria-label="Information letter" value={draft.letter} disabled={!connected} onChange={e => dispatch({kind: "atis", draft: {...draft, letter: e.target.value}})}>{[...new Set([...LETTERS, draft.letter])].map(letter => <option key={letter}>{letter}</option>)}</select></label>
    <div className={styles.atisFields}>
      {(["departures", "arrivals"] as const).map(field => <fieldset key={field}><legend>{field === "departures" ? "Departure runways" : "Arrival runways"}</legend>{["06", "24"].map(runway => <label key={runway}><input type="checkbox" disabled={!connected} checked={draft[field].includes(runway as "06" | "24")} onChange={() => toggle(field, runway)}/>Runway {runway}</label>)}</fieldset>)}
      <fieldset><legend>Expected approach</legend>{[...new Set(["ILS", "GPS", "VISUAL", ...draft.expectations])].map(value => <label key={value}><input type="checkbox" disabled={!connected} checked={draft.expectations.includes(value)} onChange={() => toggle("expectations", value)}/>{value}</label>)}</fieldset>
      <fieldset><legend>Remarks</legend>{([{field: "remarks", choices: REMARKS}, {field: "notams", choices: ["Low Visibility"]}] as const).flatMap(({field, choices}) => [...new Set([...choices, ...draft[field]])].map(value => <label key={`${field}-${value}`}><input type="checkbox" disabled={!connected} checked={draft[field].includes(value)} onChange={() => toggle(field, value)}/>{value}</label>))}</fieldset>
      {draft.procedures.length ? <fieldset><legend>Saved exercise references</legend><p>Historical labels are preserved. No charted route is drawn; use the instructor’s flight-plan waypoints.</p>{draft.procedures.map(value => <label key={value}><input type="checkbox" checked disabled={!connected} onChange={() => toggle("procedures", value)}/>{value}</label>)}</fieldset> : null}
    </div>
    <section className={styles.atisPublished} aria-live="polite"><h2>Published radio text</h2>{exercise.publishedAtis}</section>
  </section>;
}
