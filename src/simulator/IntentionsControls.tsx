"use client";
import workspace from "./StaffWorkspace.module.css";
import {intentionsOf, type Aircraft, type Airport} from "./model";
import {defaultAirport, defaultRunway, runwayEnds} from "./airports";
import LandingOutcomeControl from "./LandingOutcomeControl";

/** Shared by live staff controls and scenario seeds; landing has one source of truth. */
export default function IntentionsControls({aircraft: a, airport: AIRPORT = defaultAirport, onEdit, staffCompact = false}: {aircraft: Aircraft; airport?: Airport; onEdit: (patch: Partial<Aircraft>) => void | boolean | Promise<boolean>; staffCompact?: boolean}) {
  const intentions = intentionsOf(a);
  const set = (patch: Partial<typeof intentions>) => onEdit({intentions: {...intentions, ...patch}});
  const ground = ["parked", "pushback", "taxi", "lineup", "rollout"].includes(a.mode);
  return <div className={staffCompact ? workspace.setupForm : undefined} aria-label="Aircraft intentions">
    {ground ? <label>Ground flight intention<select value={intentions.flight} onChange={e => set({flight: e.target.value as typeof intentions.flight})}><option value="pattern">Pattern work</option><option value="departure">Departure</option></select></label> : null}
    <LandingOutcomeControl compact={staffCompact} value={a.landing} onChange={landing => onEdit({landing})}/>
    <label>Taxi intention<select value={intentions.taxi} onChange={e => set({taxi: e.target.value as typeof intentions.taxi})}><option value="runway">Taxi to runway</option><option value="parking">Taxi to parking</option></select></label>
    {intentions.taxi === "runway" ? <label>Intended runway<select value={a.runway ?? defaultRunway(AIRPORT)} onChange={e => onEdit({runway: e.target.value})}>{runwayEnds(AIRPORT).map(end => <option key={end.id}>{end.id}</option>)}</select></label> : <label>Parking destination<select value={intentions.parkingStand ?? ""} onChange={e => set({parkingStand: e.target.value || undefined})}><option value="">Automatic · available mapped stand</option>{AIRPORT.features.filter(f => f.kind === "parking_position" && f.points.length > 1).map(f => <option key={f.id} value={f.id}>Gate {f.name || f.id}</option>)}</select></label>}
    {!ground ? <><label>After transition<select value={intentions.afterTransition} onChange={e => set({afterTransition: e.target.value as typeof intentions.afterTransition})}><option value="continue">Continue transition</option><option value="touch-and-go">Request touch and go overhead</option></select></label>{intentions.afterTransition === "touch-and-go" ? <label>Overhead radius (NM)<input type="number" min="0.1" max="5" step="0.1" value={intentions.overheadRadius ?? 1} onChange={e => {const radius = Number(e.target.value); if (radius >= .1 && radius <= 5) set({overheadRadius: radius});}}/></label> : null}</> : null}
  </div>;
}
