"use client";
import type {ReactNode} from "react";
import type {Airport, Point} from "./model";
import type {vectorPreview} from "./radar";
import {terrainCoordinates} from "./terrain";
import VectorTerrain from "./VectorTerrain";
import styles from "./Simulator.module.css";

/** Keep the drag-to-vector box anchored to its point; the scope clips its edges. */
export default function VectorPreviewBox({point, children, className, label = "Vector details"}: {point: Point; children: ReactNode; className?: string; label?: string}) {
  return <div style={{left: point.x, top: point.y}} className={`${styles.vectorPreviewBox} ${className ?? ""}`} role="status" aria-label={label}>{children}</div>;
}

/** What the box says: the same lines on the controller's radar and on a staff radar showing the trainee's drag. */
export function VectorDetails({initial, callsign, vector, airport, aircraftId}: {initial?: boolean; callsign: string; vector: ReturnType<typeof vectorPreview> | null; airport: Airport; aircraftId: string}) {
  if (initial) return <><span>Drag to Vector</span><span>{callsign.slice(0, 10)}</span></>;
  if (!vector) return <span>Cancel</span>;
  const terrain = terrainCoordinates(airport, vector.point);
  return <>
    <span>{String(vector.heading || 360).padStart(3, "0")}° {String(Math.floor(vector.nm)).padStart(3, "0")}NM</span>
    <span>{vector.minutes === null ? "—mn" : `${Math.ceil(vector.minutes)}mn`} - {terrain && <VectorTerrain key={`${airport.icao}:${aircraftId}`} {...terrain}/>}</span>
    {vector.target ? <span>Direct To {vector.target.name}</span> : vector.fix ? <span>{vector.fix}</span> : null}
  </>;
}
