"use client";
import {useRef, useState} from "react";
import {controllerAircraft} from "./controller-state";
import {environmentWithDestinations} from "./aviation";
import {catalogFor, CONTEXT_ACTIONS, contextMenu, type ContextAction} from "./catalog";
import {AircraftOptionPicker} from "./AircraftContextMenu";
import {getAirport} from "./airports";
import {validateControllerMessage} from "./engine";
import {ALTITUDES, altitudeLabel, radarEnvironmentFor} from "./radar";
import type {Action, Aircraft, Altitude, Exercise, Frequency, Instruction} from "./model";
import type {VectorTarget} from "./vector-drag";
import styles from "./Simulator.module.css";

export default function RadarQuickPopup({aircraft, exercise, frequency, heading, target, connected, dispatch, onMessages, onAction, onSent}: {
  aircraft: Aircraft; exercise: Exercise; frequency: Frequency; heading?: number; target?: VectorTarget; connected: boolean;
  dispatch: (action: Action) => void | Promise<boolean>; onMessages: () => void; onAction: (action: ContextAction) => void; onSent: () => void;
}) {
  const [picker, setPicker] = useState<"altitude" | "approach" | "missed" | "reminder" | "color" | "direct-altitude" | null>(null);
  const [approachId, setApproachId] = useState<string>();
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const airport = getAirport(exercise), environment = environmentWithDestinations(airport,exercise.radarEnvironment ?? radarEnvironmentFor(airport),[aircraft]);
  const expected = environment.approaches.find(p => p.id === controllerAircraft(aircraft).radar?.expected);
  const {instructionText} = catalogFor(airport, environment,exercise.weather);
  const directCommand: Extract<Instruction, {type: "route"}> | undefined = target && {type: "route", index: target.index, name: target.name, point: target.point};
  const directError = directCommand ? validateControllerMessage(exercise, aircraft, directCommand, frequency) : undefined;
  const commandFor = (altitude: Altitude): Instruction => picker === "direct-altitude" && directCommand ? {...directCommand, altitude} : picker === "missed" ? {type: "missed-approach", altitude} : {type: "vector", ...(heading !== undefined ? {heading} : {}), altitude, ...(picker === "approach" ? {approachId} : {})};
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
    {picker === "reminder" || picker === "color" ? <>
      <button role="menuitem" onClick={() => setPicker(null)}>‹ Back</button>
      <AircraftOptionPicker picker={picker} elapsed={exercise.elapsed} connected={connected} onEdit={patch => {dispatch({kind: "edit", aircraftId: aircraft.id, patch}); onSent();}}/>
    </> : picker ? <><button role="menuitem" disabled={sending} onClick={() => {setPicker(null); setError("");}}>‹ Back</button><div className={styles.altitudeChoices} aria-label={`${picker === "direct-altitude" ? `Direct To ${target?.name}` : picker === "missed" ? "Missed Approach" : picker === "approach" ? "Clear for Approach" : "Assign Altitude"} altitude`}>{ALTITUDES.map(altitude => {
      const command = commandFor(altitude), invalid = validateControllerMessage(exercise, aircraft, command, frequency);
      return <button key={altitudeLabel(altitude)} role="menuitem" title={invalid ?? undefined} disabled={!connected || sending || !!invalid || picker === "approach" && !expected} onClick={() => void send(command)}>{altitudeLabel(altitude)}</button>;
    })}</div></> : <>
      {heading !== undefined ? <button role="menuitem" disabled={!connected || sending} onClick={() => void send({type: "vector", heading})}>Send</button> : null}
      {aircraft.atcManeuver?.kind !== "hold" ? <button role="menuitem" disabled={!connected} onClick={() => onAction("hold")}>Hold</button> : null}
      {aircraft.atcManeuver?.kind === "hold" ? <button role="menuitem" disabled={!connected} onClick={() => void send({type: "atc", action: "exit-hold"})}>Exit Hold, Continue as Filed</button> : null}
      <button role="menuitem" disabled={!connected} onClick={() => setPicker("altitude")}>Assign Altitude</button>
      {target ? <>
        <button role="menuitem" disabled={!connected || sending || !!directError} title={directError ?? undefined} onClick={() => void send(directCommand!)}>Direct To {target.name}</button>
        <button role="menuitem" disabled={!connected || sending || !!directError} title={directError ?? undefined} onClick={() => setPicker("direct-altitude")}>Direct To {target.name} + Assign Altitude</button>
      </> : null}
      {expected ? <button role="menuitem" disabled={!connected || sending} onClick={() => {setApproachId(expected.id); setPicker("approach");}}>Clear for Approach</button> : null}
      {expected ? <button role="menuitem" disabled={!connected} onClick={() => setPicker("missed")}>Missed Approach</button> : null}
      <button role="menuitem" onClick={onMessages}>Other Message</button>
      {contextMenu(frequency, aircraft).filter(action => action !== "messages").map(action => <button key={action} role="menuitem" disabled={!connected} onClick={() => {
        if (action === "reminder" || action === "color") setPicker(action);
        else {onAction(action); if (action === "remove-reminder") onSent();}
      }}>{CONTEXT_ACTIONS[action]}</button>)}
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
