"use client";
import {airportList, airportStations, airportSelection, getAirport, trainingMode, type AirportId} from "./airports";
import {radarEnvironmentFor} from "./radar";
import RadarEnvironmentEditor from "./RadarEnvironmentEditor";
import type {ScenarioDefinition} from "./scenarios";
import styles from "./ScenarioSetup.module.css";

export default function ScenarioSetup({definition, onChange, locked = false, compact = false}: {
  definition: ScenarioDefinition; onChange: (definition: ScenarioDefinition) => void; locked?: boolean; compact?: boolean;
}) {
  const airport = getAirport(definition);
  const changeAirport = (id: AirportId) => {
    const next = getAirport({airport: id});
    onChange({...definition, schema: 2, ...airportSelection(next), radarEnvironment: undefined, airportDataDate: next.sourceDate});
  };
  return <section className={`${styles.setup} ${compact ? styles.compact : ""}`} aria-labelledby="scenario-setup-title">
    <p className={styles.eyebrow}>Training environment</p>
    <h2 id="scenario-setup-title">Airport & frequency</h2>
    <p>Choose where the exercise takes place and the controller frequencies to practise.</p>
    <div className={styles.fields}>
      <label>Airport<select value={airport.icao} disabled={locked} onChange={e => changeAirport(e.target.value as AirportId)} aria-describedby={locked ? "airport-locked" : undefined}>
        {airportList.map(a => <option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}
      </select></label>
      <label>Training frequencies<select disabled={locked} value={`${airport.icao}:${trainingMode(definition)}`} onChange={e => {const radar = e.target.value.endsWith(":approach") || e.target.value.endsWith(":center"); onChange({...definition, schema: 2, ...airportSelection(airport), trainingStation: e.target.value, radarEnvironment: radar ? radarEnvironmentFor(airport) : undefined});}} aria-describedby="frequency-help">
        {airportStations(airport).filter(s => ["local", "approach", "center"].includes(s.service)).map(s => <option key={s.id} value={s.id} disabled={!s.available}>{s.service === "local" ? "Ground & Tower" : s.service[0].toUpperCase() + s.service.slice(1)}{s.available ? "" : " · Coming soon"}</option>)}
      </select></label>
    </div>
    {locked ? <p id="airport-locked" className={styles.help}>The airport is fixed while this scenario has traffic or events. Create a new scenario to use another airport.</p> : null}
    <p id="frequency-help" className={styles.help}>Choose Ground & Tower, Approach or Center. Transfers leave the selected controller&apos;s traffic; the exercise stays in its training mode.</p>
    <div className={styles.summary}><strong>{airport.icao} · {trainingMode(definition) === "local" ? "Ground & Tower" : trainingMode(definition) === "approach" ? "Approach" : "Center"}</strong><span>{airport.runways?.length ?? 1} runway {(airport.runways?.length ?? 1) === 1 ? "pair" : "pairs"} · {airport.elevation.toLocaleString()} ft elevation</span></div>
    {trainingMode(definition) !== "local" ? <RadarEnvironmentEditor value={definition.radarEnvironment ?? radarEnvironmentFor(airport)} onChange={radarEnvironment => onChange({...definition, radarEnvironment})}/> : null}
  </section>;
}
