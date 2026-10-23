"use client";
import type {Aircraft, Airport, Direction, RadarEnvironment, RadarState} from "./model";
import {radarIntentionText} from "./radar";
import styles from "./RadarIntentions.module.css";
import LandingOutcomeControl, {type LandingChange} from "./LandingOutcomeControl";

/** Shared by live traffic creation, instructor controls and saved scenarios. */
export default function RadarIntentions({aircraft, airport, environment, onChange, onLandingChange, takeoff = false, showLanding = true}: {
  aircraft: Aircraft; airport: Airport; environment: RadarEnvironment; onChange: (radar: RadarState) => void; onLandingChange: LandingChange; takeoff?: boolean;
  /** Live staff Intentions already shows Next landing beside this form. */
  showLanding?: boolean;
}) {
  const r = aircraft.radar!;
  const flight = r.flight;
  const requestedApproach = r.requestedApproach ?? r.expected ?? environment.approaches[0]?.id;
  const preview = {...aircraft, radar: {...r, flight, requestedApproach: flight === "return" ? requestedApproach : r.requestedApproach}};
  return <section className={styles.intentions} aria-label="Radar flight intentions">
    <label>Flight intention<select aria-label="Flight intention" value={flight ?? ""} onChange={event => onChange({...r, flight: event.target.value as "departure" | "return", requestedApproach: event.target.value === "return" ? requestedApproach : undefined})}>
      {!flight ? <option value="">No request set</option> : null}<option value="departure">Depart the sector</option><option value="return" disabled={!environment.approaches.length}>Return for an approach</option>
    </select></label>
    {flight === "return" ? <label>Requested approach<select aria-label="Requested approach" value={requestedApproach ?? ""} onChange={event => onChange({...r, flight, requestedApproach: event.target.value})}>
      {!environment.approaches.length ? <option value="">No approaches available</option> : environment.approaches.map(p => <option key={p.id} value={p.id}>{p.type === "visual" ? "Visual" : p.type.toUpperCase()} · Runway {p.runway}</option>)}
    </select></label> : flight === "departure" ? <label>Departure direction<select aria-label="Departure direction" value={r.departureDirection ?? "north"} onChange={event => onChange({...r, flight: "departure", departureDirection: event.target.value as Direction})}>
      {(["north", "east", "south", "west"] as const).map(direction => <option key={direction} value={direction}>{direction[0].toUpperCase() + direction.slice(1)}</option>)}
    </select></label> : null}
    {showLanding ? <><LandingOutcomeControl value={aircraft.landing} onChange={onLandingChange}/>
    <small>After Tower handoff, aircraft follow this intention. Touch and go returns to Approach on runway heading at 1,000 ft AGL.</small></> : null}
    <div className={styles.preview}><span>{takeoff ? "After takeoff" : "Pilot intention"}</span><p>{radarIntentionText(preview, airport, environment)}</p>
      {takeoff ? <small>Automatic takeoff · pilot calls radar at 1,000 ft AGL when Automatic is on.</small> : <small>Requested by the pilot. The controller assigns and clears the approach separately.</small>}
    </div>
  </section>;
}
