"use client";
import {facilities, insideAirspace} from "./aviation";
import {getAirport} from "./airports";
import {radarEnvironmentFor} from "./radar";
import type {Action,Exercise} from "./model";
/** Active controllers are exercise state, so handoff choices are the same for
 * both seats and during a replay, independent of live network occupancy. */
export default function FacilityControls({exercise,dispatch,connected}:{exercise:Exercise;dispatch:(a:Action)=>void;connected:boolean}){
 const airport=getAirport(exercise),environment=exercise.radarEnvironment??radarEnvironmentFor(airport);
 const nearby=facilities.filter(f=>f.airport===airport.icao || f.boundary&&insideAirspace(f.boundary,airport.origin.lat,airport.origin.lon) || Math.hypot((f.lat-airport.origin.lat)*60,(f.lon-airport.origin.lon)*60*Math.cos(airport.origin.lat*Math.PI/180))<70).filter((f,i,all)=>all.findIndex(e=>e.id===f.id)===i);
 const active=nearby.filter(f=>environment.facilityActivity?.[f.id]!==false).length;
 return <details><summary title="Handoff choices follow active facilities, aircraft position and destination.">Training facilities<small>{active} of {nearby.length} active</small></summary>{nearby.map(f=><label key={f.id}><input type="checkbox" disabled={!connected} checked={environment.facilityActivity?.[f.id]!==false} onChange={e=>dispatch({kind:"facilities",activity:{...environment.facilityActivity,[f.id]:e.target.checked}})}/>{f.name} · {f.mhz}</label>)}</details>;
}
