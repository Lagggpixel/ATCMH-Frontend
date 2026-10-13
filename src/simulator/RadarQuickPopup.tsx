"use client";
import {useRef, useState} from "react";
import {catalogFor} from "./catalog";
import {getAirport} from "./airports";
import {validateControllerMessage} from "./engine";
import {ALTITUDES, altitudeLabel, radarEnvironmentFor} from "./radar";
import type {Action, Aircraft, Altitude, Exercise, Frequency, Instruction} from "./model";
import styles from "./Simulator.module.css";

export default function RadarQuickPopup({aircraft, exercise, frequency, heading, connected, dispatch, onMessages, onSent}: {
  aircraft: Aircraft; exercise: Exercise; frequency: Frequency; heading?: number; connected: boolean;
  dispatch: (action: Action) => void | Promise<boolean>; onMessages: () => void; onSent: () => void;
}) {
  const [picker, setPicker] = useState<"altitude" | "clear" | "missed" | null>(null);
  const [approachId, setApproachId] = useState<string>();
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const airport = getAirport(exercise), environment = exercise.radarEnvironment ?? radarEnvironmentFor(airport);
  const expected = environment.approaches.find(p => p.id === aircraft.radar?.expected);
  const {instructionText} = catalogFor(airport, environment);
  const commandFor = (altitude?: Altitude): Instruction => picker === "missed" ? {type: "missed-approach", altitude: altitude!} : {type: "vector", ...(heading !== undefined ? {heading} : {}), ...(altitude ? {altitude} : {}), ...(picker === "clear" ? {approachId} : {})};
  const send = async (command: Instruction) => {
    if (inFlight.current || !connected) return;
    const invalid = validateControllerMessage(exercise, aircraft, command, frequency);
    if (invalid) {setError(invalid); return;}
    inFlight.current = true; setSending(true); setError("");
    try {const sent = await dispatch({kind: "command", aircraftId: aircraft.id, frequency, command, text: instructionText(aircraft, command)}); if (sent !== false) onSent(); else setError("Instruction was not sent. Check the session connection and try again.");}
    catch {setError("Instruction was not sent. Check the session connection and try again.");}
    finally {inFlight.current = false; setSending(false);}
  };
  return <div className={`${styles.aircraftMenu} ${styles.radarQuick}`} role="menu" aria-label={`${aircraft.callsign} quick messages`}>
    {picker ? <><div className={styles.altitudeChoices} aria-label={`${picker === "clear" ? "Clear for approach" : picker === "missed" ? "Missed Approach" : "Assign Altitude"} altitude`}>{ALTITUDES.map(altitude => {
      const command = commandFor(altitude), invalid = validateControllerMessage(exercise, aircraft, command, frequency);
      return <button key={altitudeLabel(altitude)} role="menuitem" title={invalid ?? undefined} disabled={!connected || sending || !!invalid} onClick={() => void send(command)}>{altitudeLabel(altitude)}</button>;
    })}</div></> : <>
      {heading !== undefined ? <button role="menuitem" disabled={!connected || sending} onClick={() => void send({type: "vector", heading})}>Send</button> : null}
      <button role="menuitem" disabled={!connected} onClick={() => setPicker("altitude")}>Assign Altitude</button>
      {expected ? <button role="menuitem" disabled={!connected} onClick={() => {setApproachId(expected.id); setPicker("clear");}}>Clear for approach</button> : null}
      <button role="menuitem" disabled={!connected} onClick={() => setPicker("missed")}>Missed Approach</button>
      <button role="menuitem" onClick={onMessages}>Other messages</button>
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
