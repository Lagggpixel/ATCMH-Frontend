"use client";
import {useLayoutEffect, useRef, type ReactNode} from "react";
import type {Airport, Point} from "./model";
import type {vectorPreview} from "./radar";
import {terrainCoordinates} from "./terrain";
import VectorTerrain from "./VectorTerrain";
import styles from "./Simulator.module.css";

/** The drag-to-vector box beside the pointer, kept inside the scope. */
export default function VectorPreviewBox({point, size, children, className, label = "Vector details"}: {point: Point; size: {width: number; height: number}; children: ReactNode; className?: string; label?: string}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = box.current, scope = element?.parentElement;
    if (!element || !scope) return;
    const position = () => {
      element.style.left = `${point.x}px`; element.style.top = `${point.y}px`;
      const bounds = element.getBoundingClientRect(), map = scope.getBoundingClientRect();
      const dx = bounds.left < map.left ? map.left - bounds.left : Math.min(0, map.right - bounds.right);
      const dy = bounds.top < map.top ? map.top - bounds.top : Math.min(0, map.bottom - bounds.bottom);
      element.style.left = `${point.x + dx}px`; element.style.top = `${point.y + dy}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    return () => observer.disconnect();
  }, [point.x, point.y, size.width, size.height]);
  return <div ref={box} className={`${styles.vectorPreviewBox} ${className ?? ""}`} role="status" aria-label={label}>{children}</div>;
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
