"use client";
import {IF_TAG_COLORS} from "./if-colors";
import GroundQuickActions from "./GroundQuickActions";
import type {PlanGroundTaxi} from "./GroundRouteEditor";
import {useState} from "react";
import {CONTEXT_ACTIONS, contextMenu, type ContextAction} from "./catalog";
import type {Action, Aircraft, Exercise, Frequency} from "./model";
import styles from "./Simulator.module.css";

const reminderMinutes = [1, 2, 5, 10, 15, 30, 60];
const highlightColors = IF_TAG_COLORS;

export function AircraftOptionPicker({picker, elapsed, connected, onEdit}: {
  picker: "reminder" | "color"; elapsed: number; connected: boolean; onEdit: (patch: Partial<Aircraft>) => void;
}) {
  return <div className={styles.altitudeChoices} aria-label={picker === "reminder" ? "Reminder time" : "Highlight colour"}>
    {picker === "reminder" ? reminderMinutes.map(minutes => <button key={minutes} role="menuitem" disabled={!connected} onClick={() => onEdit({reminderAt: elapsed + minutes * 60})}>In {minutes} {minutes === 1 ? "minute" : "minutes"}</button>) : <>
      {highlightColors.map(color => <button key={color.value} role="menuitem" disabled={!connected} onClick={() => onEdit({color: color.value})}><span className={styles.colorSwatch} style={{background: color.value}}/>{color.label}</button>)}
      <button role="menuitem" disabled={!connected} onClick={() => onEdit({color: null})}>Reset highlight</button>
    </>}
  </div>;
}

export default function AircraftContextMenu({aircraft, exercise, frequency, elapsed, connected, dispatch, onAction, onClose, onPlanTaxi}: {
  aircraft: Aircraft; exercise?: Exercise; frequency: Frequency; elapsed: number; connected: boolean;
  dispatch: (action: Action) => void; onAction: (action: ContextAction) => void; onClose: () => void;
  onPlanTaxi?: PlanGroundTaxi;
}) {
  const [picker, setPicker] = useState<"reminder" | "color" | null>(null);
  const edit = (patch: Partial<Aircraft>) => {dispatch({kind: "edit", aircraftId: aircraft.id, patch}); onClose();};
  return <div className={`${styles.aircraftMenu} ${styles.radarQuick}`} role="menu" aria-label="Aircraft options">
    {picker ? <><button role="menuitem" onClick={() => setPicker(null)}>‹ Back</button>
      <AircraftOptionPicker picker={picker} elapsed={elapsed} connected={connected} onEdit={edit}/>
    </> : <>{exercise ? <GroundQuickActions aircraft={aircraft} exercise={exercise} frequency={frequency} connected={connected} dispatch={dispatch} onSent={onClose} onPlanTaxi={onPlanTaxi}/> : null}{contextMenu(frequency, aircraft).map(action => <button key={action} role="menuitem" disabled={!connected} onClick={() => {
      if (action === "reminder" || action === "color") setPicker(action);
      else {onAction(action); if (action === "remove-reminder") onClose();}
    }}>{CONTEXT_ACTIONS[action]}</button>)}</>}
  </div>;
}
