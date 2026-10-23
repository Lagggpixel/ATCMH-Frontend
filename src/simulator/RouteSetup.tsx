"use client";
import styles from "./RouteSetup.module.css";
import {ALTITUDES, altitudeFeet, altitudeLabel} from "./radar";
import type {Aircraft} from "./model";

/** Instructor-authored coordinates and constraints belong to the pinned exercise. */
export default function RouteSetup({aircraft: a, onEdit, includeWaypoints = true}: {aircraft: Aircraft; onEdit: (patch: Partial<Aircraft>) => void; includeWaypoints?: boolean}) {
  return <div className={styles.setup}>
    {(["destination", "diversionDestination"] as const).map(key => {
      const target = a[key], label = key === "destination" ? "Destination" : "Diversion destination";
      const update = (patch: Partial<NonNullable<Aircraft[typeof key]>>) => onEdit({[key]: {name: target?.name ?? label, point: target?.point ?? a.flightPlan.at(-1) ?? {x: 0, y: 0}, ...patch}});
      return <fieldset className={styles.destination} key={key}><legend>{label}</legend>
        <label>Name<input maxLength={100} key={`${a.id}:${target?.name}`} defaultValue={target?.name ?? ""} onBlur={event => event.target.value.trim() ? update({name: event.target.value.trim()}) : onEdit({[key]: null})}/></label>
        <label>East (NM)<input type="number" min={-2000} max={2000} step="any" key={`${a.id}:${target?.point.x}`} defaultValue={target?.point.x ?? ""} onBlur={event => {if (event.target.value && event.currentTarget.validity.valid) update({point: {x: Number(event.target.value), y: target?.point.y ?? 0}});}}/></label>
        <label>North (NM)<input type="number" min={-2000} max={2000} step="any" key={`${a.id}:${target?.point.y}`} defaultValue={target?.point.y ?? ""} onBlur={event => {if (event.target.value && event.currentTarget.validity.valid) update({point: {x: target?.point.x ?? 0, y: Number(event.target.value)}});}}/></label>
      </fieldset>;
    })}
    {includeWaypoints ? <ol className={styles.waypoints}>{a.flightPlan.map((point, index) => {
      const update = (patch: Partial<typeof point>) => onEdit({flightPlan: a.flightPlan.map((p, i) => i === index ? {...p, ...patch} : p)});
      return <li className={styles.waypoint} key={index}><span>{point.name ?? `Waypoint ${index + 1}`}: {point.x.toFixed(1)} E, {point.y.toFixed(1)} N</span>
        {a.radar ? <label className={styles.check}><input type="checkbox" checked={!!point.finalApproachFix} onChange={event => onEdit({flightPlan: a.flightPlan.map((p, i) => ({...p, finalApproachFix: i === index && event.target.checked ? true : undefined}))})}/>Final approach fix (GPS)</label> : null}
        <label>Crossing altitude<select value={point.altitude ?? ""} onChange={event => update({altitude: event.target.value ? Number(event.target.value) : undefined})}><option value="">Unrestricted</option>{ALTITUDES.map(altitude => <option key={altitudeLabel(altitude)} value={altitudeFeet(altitude)}>{altitudeLabel(altitude)}</option>)}</select></label>
        <label>Speed (knots)<input type="number" min={80} max={600} key={`${a.id}:${index}:${point.speed}`} defaultValue={point.speed ?? ""} onBlur={event => {const speed = event.target.value ? Number(event.target.value) : undefined; if (speed === undefined || speed >= 80 && speed <= 600) update({speed});}}/></label>
        <button type="button" onClick={() => onEdit({flightPlan: a.flightPlan.filter((_, i) => i !== index), ...(a.radar ? {radar: {...a.radar, routeIndex: 0}} : {})})}>Remove</button>
      </li>;
    })}</ol> : null}
  </div>;
}
