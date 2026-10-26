"use client";
import {airportList, airportSelection, getAirport, trainingMode, type AirportId} from "./airports";
import {radarEnvironmentFor} from "./radar";
import PositionSetup from "./PositionSetup";
import RadarEnvironmentEditor from "./RadarEnvironmentEditor";
import type {ScenarioDefinition} from "./scenarios";
import styles from "./ScenarioSetup.module.css";

/** Aircraft each position owns when the session starts, by position id. */
const startingAircraft = (definition: ScenarioDefinition) => {
  const positions = definition.positions ?? [];
  return Object.fromEntries(positions.map(p => [p.id, definition.aircraft.filter(a => a.initial && a.seed.frequency === "approach" && (a.seed.positionId ?? positions[0].id) === p.id).length]));
};
export default function ScenarioSetup({definition, onChange, locked = false, compact = false}: {
  definition: ScenarioDefinition; onChange: (definition: ScenarioDefinition) => void; locked?: boolean; compact?: boolean;
}) {
  const airport = getAirport(definition);
  const mode = trainingMode(definition);
  const changeAirport = (id: AirportId) => {
    const next = getAirport({airport: id});
    onChange({...definition, positions: undefined, schema: 2, ...airportSelection(next, mode), radarEnvironment: radarEnvironmentFor(next), airportDataDate: next.sourceDate});
  };
  return <section className={`${styles.setup} ${compact ? styles.compact : ""}`} aria-labelledby="scenario-setup-title">
    <h2 id="scenario-setup-title">Frequency & airport</h2>
    <div className={styles.fields}>
      <label>Training frequency<select disabled={locked} value={mode} onChange={e => {const service = e.target.value as "local"; onChange({...definition, positions: undefined, schema: 2, ...airportSelection(airport, service), radarEnvironment: definition.radarEnvironment ?? radarEnvironmentFor(airport)});}}>
        <option value="local">Ground &amp; Tower</option>
      </select></label>
      <label>Airport<select value={airport.icao} disabled={locked} onChange={e => changeAirport(e.target.value as AirportId)} aria-describedby={locked ? "airport-locked" : undefined}>
        {airportList.map(a => <option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}
      </select></label>
    </div>
    {locked ? <p id="airport-locked" className={styles.help}>Remove traffic and events to change frequency or airport.</p> : null}
    <div className={styles.summary}><strong>{airport.icao} · {trainingMode(definition) === "local" ? "Ground & Tower" : trainingMode(definition) === "approach" ? "Approach" : "Center"}</strong><span>{airport.runways?.length ?? 1} runway {(airport.runways?.length ?? 1) === 1 ? "pair" : "pairs"} · {airport.elevation.toLocaleString()} ft elevation</span></div>
    <PositionSetup selection={definition} value={definition.positions} aircraft={startingAircraft(definition)} onChange={positions => onChange({...definition, positions, aircraft: definition.aircraft.map(a => ({...a, seed: {...a.seed, positionId: positions.some(p => p.id === a.seed.positionId) ? a.seed.positionId : positions[0].id}}))})}/>
    {trainingMode(definition) !== "local" ? <RadarEnvironmentEditor airport={airport} value={definition.radarEnvironment ?? radarEnvironmentFor(airport)} onChange={radarEnvironment => onChange({...definition, radarEnvironment})}/> : null}
  </section>;
}
