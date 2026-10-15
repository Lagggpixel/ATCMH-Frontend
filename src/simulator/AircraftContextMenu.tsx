"use client";
import {useState} from "react";
import {CONTEXT_ACTIONS, contextMenu, type ContextAction} from "./catalog";
import type {Action, Aircraft, Frequency} from "./model";
import styles from "./Simulator.module.css";

const reminderMinutes = [1, 2, 5, 10, 15, 30, 60];
const highlightColors = [
  {label: "Green", value: "#91e98d"}, {label: "Amber", value: "#f5b64b"},
  {label: "Pink", value: "#e6739e"}, {label: "Purple", value: "#a99ae6"},
  {label: "White", value: "#ffffff"},
];

export default function AircraftContextMenu({aircraft, frequency, elapsed, connected, dispatch, onAction, onClose}: {
  aircraft: Aircraft; frequency: Frequency; elapsed: number; connected: boolean;
  dispatch: (action: Action) => void; onAction: (action: ContextAction) => void; onClose: () => void;
}) {
  const [picker, setPicker] = useState<"reminder" | "color" | null>(null);
  const edit = (patch: Partial<Aircraft>) => {dispatch({kind: "edit", aircraftId: aircraft.id, patch}); onClose();};
  return <div className={`${styles.aircraftMenu} ${styles.radarQuick}`} role="menu" aria-label="Aircraft options">
    {picker ? <><button role="menuitem" onClick={() => setPicker(null)}>‹ Back</button>
      <div className={styles.altitudeChoices} aria-label={picker === "reminder" ? "Reminder time" : "Highlight colour"}>
        {picker === "reminder" ? reminderMinutes.map(minutes => <button key={minutes} role="menuitem" disabled={!connected} onClick={() => edit({reminderAt: elapsed + minutes * 60})}>In {minutes} {minutes === 1 ? "minute" : "minutes"}</button>) : <>
          {highlightColors.map(color => <button key={color.value} role="menuitem" disabled={!connected} onClick={() => edit({color: color.value})}><span className={styles.colorSwatch} style={{background: color.value}}/>{color.label}</button>)}
          <button role="menuitem" disabled={!connected} onClick={() => edit({color: null})}>Reset highlight</button>
        </>}
      </div>
    </> : contextMenu(frequency, aircraft).map(action => <button key={action} role="menuitem" disabled={!connected} onClick={() => {
      if (action === "reminder" || action === "color") setPicker(action);
      else {onAction(action); if (action === "remove-reminder") onClose();}
    }}>{CONTEXT_ACTIONS[action]}{action === "reminder" || action === "color" ? " ›" : ""}</button>)}
  </div>;
}
