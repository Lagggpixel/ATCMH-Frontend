"use client";
import {airportList, airportSelection, getAirport, trainingMode, type AirportId} from "./airports";
import {radarEnvironmentFor} from "./radar";
import RadarEnvironmentEditor from "./RadarEnvironmentEditor";
import type {ScenarioDefinition} from "./scenarios";
import styles from "./ScenarioSetup.module.css";

export default function ScenarioSetup({definition, onChange, locked = false, compact = false}: {
  definition: ScenarioDefinition; onChange: (definition: ScenarioDefinition) => void; locked?: boolean; compact?: boolean;
}) {
  const airport = getAirport(definition);
  const mode = trainingMode(definition);
  const changeAirport = (id: AirportId) => {
    const next = getAirport({airport: id});
    onChange({...definition, schema: 2, ...airportSelection(next, mode), radarEnvironment: radarEnvironmentFor(next), airportDataDate: next.sourceDate});
  };
  return <section className={`${styles.setup} ${compact ? styles.compact : ""}`} aria-labelledby="scenario-setup-title">
    <h2 id="scenario-setup-title">Frequency & airport</h2>
    <div className={styles.fields}>
      <label>Training frequency<select disabled={locked} value={mode} onChange={e => {const service = e.target.value as "approach" | "center"; onChange({...definition, schema: 2, ...airportSelection(airport, service), radarEnvironment: definition.radarEnvironment ?? radarEnvironmentFor(airport)});}}>
        <option value="approach">Approach</option>
        <option value="center">Center</option>
      </select></label>
      <label>Airport<select value={airport.icao} disabled={locked} onChange={e => changeAirport(e.target.value as AirportId)} aria-describedby={locked ? "airport-locked" : undefined}>
        {airportList.map(a => <option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}
      </select></label>
    </div>
    {locked ? <p id="airport-locked" className={styles.help}>Remove traffic and events to change frequency or airport.</p> : null}
    <div className={styles.summary}><strong>{airport.icao} · {trainingMode(definition) === "local" ? "Ground & Tower" : trainingMode(definition) === "approach" ? "Approach" : "Center"}</strong><span>{airport.runways?.length ?? 1} runway {(airport.runways?.length ?? 1) === 1 ? "pair" : "pairs"} · {airport.elevation.toLocaleString()} ft elevation</span></div>
    {trainingMode(definition) !== "local" ? <RadarEnvironmentEditor airport={airport} value={definition.radarEnvironment ?? radarEnvironmentFor(airport)} onChange={radarEnvironment => onChange({...definition, radarEnvironment})}/> : null}
  </section>;
}
