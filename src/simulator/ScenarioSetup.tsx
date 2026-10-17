"use client";
import {airportList, airportStations, airportSelection, getAirport, trainingMode, type AirportId} from "./airports";
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
    <h2 id="scenario-setup-title">Airport & frequency</h2>
    <div className={styles.fields}>
      <label>Airport<select value={airport.icao} disabled={locked} onChange={e => changeAirport(e.target.value as AirportId)} aria-describedby={locked ? "airport-locked" : undefined}>
        {airportList.map(a => <option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}
      </select></label>
      <label>Training frequencies<select disabled={locked} value={`${airport.icao}:local`} onChange={() => onChange({...definition, schema: 2, ...airportSelection(airport), radarEnvironment: undefined})}>
        {airportStations(airport).filter(s => s.service === "local").map(s => <option key={s.id} value={s.id}>Ground & Tower</option>)}
      </select></label>
    </div>
    {locked ? <p id="airport-locked" className={styles.help}>Remove traffic and events to change airport.</p> : null}
    <div className={styles.summary}><strong>{airport.icao} · {trainingMode(definition) === "local" ? "Ground & Tower" : trainingMode(definition) === "approach" ? "Approach" : "Center"}</strong><span>{airport.runways?.length ?? 1} runway {(airport.runways?.length ?? 1) === 1 ? "pair" : "pairs"} · {airport.elevation.toLocaleString()} ft elevation</span></div>
  </section>;
}
