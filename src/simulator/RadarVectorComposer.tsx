"use client";
import {useEffect, useRef, useState} from "react";
import {catalogFor, HEADING_CHOICES} from "./catalog";
import {getAirport} from "./airports";
import {validateControllerMessage} from "./engine";
import {ALTITUDES, altitudeLabel} from "./radar";
import type {Aircraft, Exercise, Frequency, Instruction} from "./model";
import styles from "./Simulator.module.css";

type Vector = Extract<Instruction, {type: "vector"}>;
export default function RadarVectorComposer({initial, aircraft, exercise, frequency, connected, onBack, onSend, prepareSpeech}: {initial: Vector; aircraft: Aircraft; exercise: Exercise; frequency: Frequency; connected: boolean; onBack: () => void; onSend: (command: Vector) => void | Promise<boolean>; prepareSpeech?: (text: string) => () => void}) {
  const [draft, setDraft] = useState(initial);
  const [picker, setPicker] = useState<"heading" | "altitude" | null>(null);
  const [sending, setSending] = useState(false), inFlight = useRef(false);
  const invalid = validateControllerMessage(exercise, aircraft, draft, frequency);
  const speechDraft = catalogFor(getAirport(exercise), exercise.radarEnvironment, exercise.weather).instructionText(aircraft, draft);
  useEffect(() => {if (connected && !invalid && !picker) return prepareSpeech?.(speechDraft);}, [connected, invalid, picker, speechDraft, prepareSpeech]);
  const pick = (patch: Partial<Vector>) => {setDraft(c => ({...c, ...patch})); setPicker(null);};
  return <section aria-label="Compose vector instruction">
    <div className={styles.messageEntries}>
      <button disabled={sending} onClick={() => picker ? setPicker(null) : onBack()}><span>‹</span><div>Back</div></button>
      {picker === "heading" ? HEADING_CHOICES.map(heading => <button key={heading} disabled={sending} onClick={() => pick({heading})}><div>{String(heading).padStart(3, "0")}</div></button>) : picker === "altitude" ? ALTITUDES.map(altitude => {
        const error = validateControllerMessage(exercise, aircraft, {...draft, altitude}, frequency);
        return <button key={altitudeLabel(altitude)} disabled={sending || !!error} title={error ?? undefined} onClick={() => pick({altitude})}><div>{altitudeLabel(altitude)}</div></button>;
      }) : <>
        <button disabled={!connected || sending || !!invalid} title={invalid ?? undefined} onClick={async () => {
          if (inFlight.current) return; inFlight.current = true; setSending(true);
          try {await onSend(draft);} finally {inFlight.current = false; setSending(false);}
        }}><div>Send</div></button>
        {draft.heading === undefined || draft.altitude ? <button disabled={sending} onClick={() => setPicker("heading")}><div>Heading</div><b>›</b></button> : null}
        {draft.altitude === undefined || draft.heading !== undefined ? <button disabled={sending} onClick={() => setPicker("altitude")}><div>Altitude</div><b>›</b></button> : null}
      </>}
    </div>
  </section>;
}
