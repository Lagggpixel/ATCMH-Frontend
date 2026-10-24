"use client";
import {useState} from "react";
import {ArrowRight} from "@phosphor-icons/react/dist/csr/ArrowRight";
import {engineFor} from "./engine";
import {defaultAirport} from "./airports";
import {SPEED_PHASES, type Airport, type Aircraft, type SpeedPhase, type SpeedTargets} from "./model";
import styles from "./SpeedControls.module.css";

function PhaseInput({phase, value, onChange}: {phase: typeof SPEED_PHASES[number]; value: number | null | undefined; onChange: (value: number | null) => void}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim() === "" ? null : Number(draft);
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > 600)) {setInvalid(true); return;}
    setInvalid(false); setDraft(null);
    if (next !== (value ?? null)) onChange(next);
  };
  return <label className={styles.phaseField}>
    <span className={styles.phaseName}>{phase.label}</span>
    <input aria-label={`${phase.label} IAS target`} aria-invalid={invalid || undefined} type="number" min="1" max="600" step="1" placeholder="Auto" value={draft ?? value ?? ""} onChange={e => {setDraft(e.target.value); setInvalid(false);}} onBlur={commit} onKeyDown={e => {if (e.key === "Enter") {e.preventDefault(); e.currentTarget.blur();}}}/>
    <span className={styles.defaultTarget}>{value ?? phase.defaultTarget} kt IAS</span>
    {invalid ? <small role="alert">Enter a whole speed from 1 to 600.</small> : null}
  </label>;
}

export function SpeedTargetsEditor({targets, activePhase, onChange, compact = false}: {targets?: SpeedTargets; activePhase?: SpeedPhase; onChange: (targets: SpeedTargets) => void; compact?: boolean}) {
  return <div className={`${styles.segments} ${compact ? styles.compact : ""}`} aria-label="Phase IAS targets">
    {SPEED_PHASES.map(phase => <div key={phase.id} className={styles.segment} data-active={phase.id === activePhase || undefined}>
      <PhaseInput phase={phase} value={targets?.[phase.id]} onChange={value => onChange({...targets, [phase.id]: value})}/>
    </div>)}
  </div>;
}

export default function SpeedControls({airport = defaultAirport, aircraft: a, onEdit, onSpeed}: {airport?: Airport; aircraft: Aircraft; onEdit: (patch: Partial<Aircraft>) => void; onSpeed: (value: number) => void}) {
  const {speedProfile} = engineFor({airport: airport.icao});
  const [draft, setDraft] = useState<string | null>(null);
  const manual = a.speedMode === "manual";
  const semi = Object.values(a.speedTargets ?? {}).some(value => value != null);
  const airborne = ["pattern", "heading", "go-around", "takeoff"].includes(a.mode);
  const target = a.targetSpeed;
  const value = draft ?? String(Math.round(target));
  const valid = value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 600;
  return <section className={styles.speedControls} aria-label="Airspeed controls">
    <h3>Airspeed</h3>
    <p className={styles.liveSpeed}><span><strong>{Math.round(a.speed)}</strong> kt {airborne ? "IAS" : "now"}</span><ArrowRight size={14} aria-hidden="true"/><span><strong>{Math.round(target)}</strong> kt target</span><em>{Math.abs(a.speed - target) < 1 ? "At target" : a.speed < target ? "Accelerating" : "Decelerating"}</em></p>
    <div className={styles.manualControls}>
      <div className={styles.modes} role="group" aria-label="Speed control mode">
        <button type="button" aria-pressed={!manual} onClick={() => onEdit({speedMode: "auto"})}>{semi ? "Semi-auto" : "Auto"}</button>
        <button type="button" aria-pressed={manual} onClick={() => onEdit({speedMode: "manual", targetSpeed: Math.round(a.speed)})}>Manual</button>
      </div>
      <input aria-label="Speed override" title="Manual IAS override" type="number" min="0" max="600" value={value} onChange={e => setDraft(e.target.value)}/>
      <button type="button" className={styles.setSpeed} disabled={!valid} onClick={() => {onSpeed(Number(value)); setDraft(null);}}>Set speed</button>
    </div>
    <div className={styles.phaseControls}><h3>Phase speeds (IAS) · blank = automatic</h3>
      <SpeedTargetsEditor compact targets={a.speedTargets} activePhase={airborne && !manual ? speedProfile(a).segment : undefined} onChange={speedTargets => onEdit({speedTargets, speedMode: "auto"})}/>
    </div>
  </section>;
}
