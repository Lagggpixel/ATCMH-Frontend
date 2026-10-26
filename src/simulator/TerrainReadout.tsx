"use client";
import {useEffect, useState, type RefObject} from "react";
import styles from "./TerrainReadout.module.css";
import type {MapCamera, MapSize} from "./scope-camera";
import type {ScopeTerrain} from "./scope-map-data";
import {TERRAIN_COLORS, TERRAIN_REFERENCE_MAX, terrainElevationAt, terrainFigureColor, terrainHundreds} from "./terrain-display";

/** The ND's TERR ON ND pushbutton: label plus an ON light. Staff radar only. */
export function TerrainButton({on, onToggle}: {on: boolean; onToggle: () => void}) {
  return <button type="button" className={styles.button} aria-label="Terrain display" aria-pressed={on} title={on ? "Hide terrain" : "Show terrain"} onClick={onToggle}>
    <span>TERR</span><i data-on={on || undefined} aria-hidden="true"/>
  </button>;
}

const relativeKey = [["+2000", TERRAIN_COLORS.red, 1], ["+1000", TERRAIN_COLORS.amber, 1], ["-500", TERRAIN_COLORS.amber, 2],
  ["-1000", TERRAIN_COLORS.green, 1], ["-2000", TERRAIN_COLORS.green, 2]] as const;
const peaksKey = [["high", TERRAIN_COLORS.green, 1], ["mid", TERRAIN_COLORS.green, 2], ["low", TERRAIN_COLORS.green, 3]] as const;

/** Elevation under the mouse, kept inside the readout so pointer moves do not re-render the scope. */
function usePointerElevation(scope: RefObject<HTMLElement | null>, grid: ScopeTerrain | undefined, camera: MapCamera, size: MapSize) {
  const [elevation, setElevation] = useState<number | null>();
  useEffect(() => {
    const node = scope.current;
    if (!node || !grid) return;
    let frame = 0, last: PointerEvent | undefined;
    const update = () => {
      frame = 0;
      if (!last) return;
      const bounds = node.getBoundingClientRect(), x = last.clientX - bounds.left, y = last.clientY - bounds.top;
      setElevation(terrainElevationAt(grid, {x: camera.center.x + (x - size.width / 2) / camera.scale, y: camera.center.y - (y - size.height / 2) / camera.scale}));
    };
    const move = (event: PointerEvent) => {if (event.pointerType === "touch") return; last = event; frame ||= requestAnimationFrame(update);};
    const leave = () => {last = undefined; cancelAnimationFrame(frame); frame = 0; setElevation(undefined);};
    node.addEventListener("pointermove", move); node.addEventListener("pointerleave", leave);
    return () => {cancelAnimationFrame(frame); node.removeEventListener("pointermove", move); node.removeEventListener("pointerleave", leave);};
  }, [scope, grid, camera, size]);
  return grid ? elevation : undefined;
}

/** ND-style readout: highest/lowest terrain in view (hundreds of feet), the pointer's elevation, and what the colours are
 * relative to. With no aircraft selected the trainer picks a REF altitude, or AUTO for peaks. */
export function TerrainReadout({extremes, aircraft, reference, onStepReference, error, onRetry, scope, grid, camera, size}: {
  extremes?: {max: number; min: number}; aircraft?: {callsign: string; altitude: number}; reference: number; onStepReference: (direction: 1 | -1) => void;
  error?: string; onRetry: () => void; scope: RefObject<HTMLElement | null>; grid?: ScopeTerrain; camera: MapCamera; size: MapSize;
}) {
  const pointer = usePointerElevation(scope, grid, camera, size);
  const altitude = aircraft?.altitude ?? (reference || undefined);
  return <div className={styles.readout} role="status" aria-label="Terrain display">
    {error ? <div className={styles.legend}><span>Terrain unavailable</span><button type="button" onClick={onRetry}>Retry</button></div>
      : <div className={styles.legend}>
        {aircraft ? <span className={styles.reference}>REF {aircraft.callsign} {terrainHundreds(aircraft.altitude)}</span>
          : <span className={styles.picker} role="group" aria-label="Terrain reference altitude" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
            <button type="button" aria-label="Lower reference altitude" disabled={!reference} onClick={() => onStepReference(-1)}>−</button>
            <span className={styles.reference} title="Colours are relative to this altitude; AUTO shows the highest ground in view">REF {reference ? terrainHundreds(reference) : "AUTO"}</span>
            <button type="button" aria-label="Raise reference altitude" disabled={reference >= TERRAIN_REFERENCE_MAX} onClick={() => onStepReference(1)}>+</button>
          </span>}
        <span className={styles.key}>{(altitude !== undefined ? relativeKey : peaksKey).map(([label, color, density]) =>
          <span key={label}><i style={{color}} data-density={density} aria-hidden="true"/>{label}</span>)}</span>
      </div>}
    <div className={styles.figures} data-failed={error ? true : undefined}>
      <span className={styles.title}>TERR</span>
      {extremes && !error ? <>
        <b style={{color: terrainFigureColor(extremes.max, altitude)}} title="Highest terrain in view, hundreds of feet">{terrainHundreds(extremes.max)}</b>
        <b style={{color: terrainFigureColor(extremes.min, altitude)}} title="Lowest terrain in view, hundreds of feet">{terrainHundreds(extremes.min)}</b>
      </> : <><b>---</b><b>---</b></>}
      {pointer !== undefined && !error ? <small title="Terrain under the pointer, hundreds of feet">PTR {pointer === null ? "---" : terrainHundreds(pointer)}</small> : null}
    </div>
  </div>;
}
