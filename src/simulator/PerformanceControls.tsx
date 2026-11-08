"use client";
import {useId} from "react";
import {Info} from "@phosphor-icons/react/dist/csr/Info";
import {AIRCRAFT_PERFORMANCE, performanceFor} from "./aircraft-performance";
import {fuelForState, type Aircraft} from "./model";
import styles from "./PerformanceControls.module.css";
type FuelState=NonNullable<Aircraft["fuel"]>["state"];
const FUEL_STATES:readonly {id:FuelState;label:string}[]=[{id:"unknown",label:"Unknown"},{id:"normal",label:"Normal"},{id:"minimum",label:"Minimum"},{id:"emergency",label:"Emergency"}];
const ceilingLabel=(feet:number)=>feet>=18000?`FL${Math.round(feet/100)}`:`${feet.toLocaleString()} ft`;
const enduranceLabel=(minutes:number)=>`${Math.floor(minutes/60)} h ${minutes%60} m left`;
/** Choosing a type swaps the motion profile and restarts automatic speeds from its inbound target. */
export function AircraftTypeSelect({aircraft:a,onEdit,label="Aircraft type"}:{aircraft:Aircraft;onEdit:(patch:Partial<Aircraft>)=>void;label?:string}){
 return <label>{label}<select aria-label={label} value={a.performanceProfile??""} onChange={e=>{const p=AIRCRAFT_PERFORMANCE.find(p=>p.id===e.target.value);if(p)onEdit({performanceProfile:p.id,type:p.id,targetSpeed:p.inbound,speedMode:"auto",speedTargets:{},...(a.radar?{radar:{...a.radar,inboundSpeed:p.inbound,speed:undefined}}:{})});}}><option value="" disabled>{a.type} · legacy motion</option>{AIRCRAFT_PERFORMANCE.map(p=><option key={p.id} value={p.id} disabled={a.altitude>p.ceiling}>{p.name}{a.altitude>p.ceiling?" · above ceiling":""}</option>)}</select></label>;
}
/** Read-only card for the motion profile the aircraft flies with. */
export function PerformanceSummary({aircraft:a}:{aircraft:Aircraft}){
 const p=performanceFor(a);
 if(!p)return <p className={styles.generic}><Info size={16} aria-hidden="true"/><span><strong>Generic motion.</strong> This type has no performance profile yet, so it climbs and slows like a generic aircraft.</span></p>;
 return <div className={styles.profile}>
  <p className={styles.profileHead}><span className={styles.chip}>{p.propulsion}</span>Performance profile</p>
  <dl className={styles.stats}><div><dt>Rotate</dt><dd>{p.rotation} kt</dd></div><div><dt>Final</dt><dd>{p.landing} kt</dd></div><div><dt>Maximum</dt><dd>{p.max} kt{p.mach?` · M${p.mach}`:""}</dd></div><div><dt>Ceiling</dt><dd>{ceilingLabel(p.ceiling)}</dd></div></dl>
  <details className={styles.about}><summary>About this profile</summary><p>{p.assumptions}</p><a href={p.source} target="_blank" rel="noreferrer">Profile source</a></details>
 </div>;
}
export function FuelControls({aircraft:a,onEdit}:{aircraft:Aircraft;onEdit:(patch:Partial<Aircraft>)=>void}){
 const name=useId(),state=a.fuel?.state??"normal",endurance=Math.round(a.fuel?.enduranceMinutes??120);
 return <div className={styles.fuel}>
  <fieldset className={styles.segments}><legend>Fuel state</legend><div>{FUEL_STATES.map(s=><label key={s.id} data-state={s.id}><input type="radio" name={name} value={s.id} checked={state===s.id} onChange={()=>onEdit({fuel:fuelForState(s.id,a.fuel)})}/>{s.label}</label>)}</div></fieldset>
  <div className={styles.endurance}><label>Endurance<span className={styles.unit}><input aria-label="Fuel endurance (minutes)" type="number" min={0} max={10000} step={1} value={endurance} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0&&value<=10000)onEdit({fuel:{state:a.fuel?.state??"normal",...a.fuel,enduranceMinutes:value}});}}/><span aria-hidden="true">min</span></span></label><output>{enduranceLabel(endurance)}</output></div>
  <p className={styles.note}><Info size={16} aria-hidden="true"/><span>With Minimum or Emergency fuel, the pilot can ask for priority after one minute airborne. Endurance counts down during flight.</span></p>
 </div>;
}
export default function PerformanceControls({aircraft:a,onEdit,typeSelect=true}:{aircraft:Aircraft;onEdit:(patch:Partial<Aircraft>)=>void;typeSelect?:boolean}){
 return <section aria-label="Aircraft performance and fuel" className={styles.controls}>{typeSelect?<AircraftTypeSelect aircraft={a} onEdit={onEdit} label="Aircraft performance"/>:null}<PerformanceSummary aircraft={a}/><FuelControls aircraft={a} onEdit={onEdit}/></section>;
}
