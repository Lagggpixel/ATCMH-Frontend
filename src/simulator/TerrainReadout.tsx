"use client";
import styles from "./TerrainReadout.module.css";
import {TERRAIN_COLORS, terrainFigureColor, terrainHundreds} from "./terrain-display";

/** The ND's TERR ON ND pushbutton: label plus an ON light. Staff radar only. */
export function TerrainButton({on, onToggle}: {on: boolean; onToggle: () => void}) {
  return <button type="button" className={styles.button} aria-label="Terrain display" aria-pressed={on} title={on ? "Hide terrain" : "Show terrain"} onClick={onToggle}>
    <span>TERR</span><i data-on={on || undefined} aria-hidden="true"/>
  </button>;
}

const relativeKey = [["+2000", TERRAIN_COLORS.red, true], ["+1000", TERRAIN_COLORS.amber, true], ["-500", TERRAIN_COLORS.amber, false],
  ["-1000", TERRAIN_COLORS.green, true], ["-2000", TERRAIN_COLORS.green, false]] as const;
const peaksKey = [["highest", TERRAIN_COLORS.green, true], ["lower", TERRAIN_COLORS.green, false]] as const;

/** ND-style readout: highest/lowest terrain in view (hundreds of feet) and what the colours are relative to. */
export function TerrainReadout({extremes, reference, error, onRetry}: {
  extremes?: {max: number; min: number}; reference?: {callsign: string; altitude: number}; error?: string; onRetry: () => void;
}) {
  const altitude = reference?.altitude;
  return <div className={styles.readout} role="status" aria-label="Terrain display">
    {error ? <div className={styles.legend}><span>Terrain unavailable</span><button type="button" onClick={onRetry}>Retry</button></div>
      : <div className={styles.legend}>
        <span className={styles.reference}>{reference ? `REF ${reference.callsign} ${terrainHundreds(reference.altitude)}` : "PEAKS"}</span>
        <span className={styles.key}>{(reference ? relativeKey : peaksKey).map(([label, color, dense]) =>
          <span key={label}><i style={{color}} data-dense={dense || undefined} aria-hidden="true"/>{label}</span>)}</span>
      </div>}
    <div className={styles.figures} data-failed={error ? true : undefined}>
      <span className={styles.title}>TERR</span>
      {extremes && !error ? <>
        <b style={{color: terrainFigureColor(extremes.max, altitude)}} title="Highest terrain in view, hundreds of feet">{terrainHundreds(extremes.max)}</b>
        <b style={{color: terrainFigureColor(extremes.min, altitude)}} title="Lowest terrain in view, hundreds of feet">{terrainHundreds(extremes.min)}</b>
      </> : <><b>---</b><b>---</b></>}
    </div>
  </div>;
}
