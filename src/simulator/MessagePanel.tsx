"use client";
import {memo, useLayoutEffect, useRef, useState} from "react";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {catalogFor, type MenuEntry} from "./catalog";
import {validateControllerMessage} from "./engine";
import {type Airport, pendingPilotMessage, type Action, type Aircraft, type Exercise, type Frequency} from "./model";
import {getAirport, defaultAirport, frequenciesFor} from "./airports";
import type {Instruction} from "./model";
import RadarVectorComposer from "./RadarVectorComposer";
import styles from "./Simulator.module.css";

export const MessageLog = memo(function MessageLog({airport = defaultAirport, messages: allMessages, frequency, aircraftId, title = "Message log"}: {airport?: Airport; messages: Exercise["messages"]; frequency: Frequency | "all"; aircraftId?: string; title?: string}) {
  const FREQUENCIES = frequenciesFor(airport);
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const element = log.current!;
    const setFollowing = (value: boolean) => {
      following.current = value;
      // Preserve the visible message while reading; avoid anchoring against a trimmed row at the bottom.
      element.style.overflowAnchor = value ? "none" : "auto";
    };
    const follow = () => {if (following.current) element.scrollTop = element.scrollHeight;};
    const scroll = () => {setFollowing(element.scrollHeight - element.clientHeight - element.scrollTop <= 2);};
    // Stop before the browser scrolls, including when a message arrives in the same frame.
    const wheel = (event: WheelEvent) => {if (event.deltaY < 0 && element.scrollHeight > element.clientHeight) setFollowing(false);};
    const key = (event: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) && element.scrollHeight > element.clientHeight) setFollowing(false);
      else if (event.key === "End") setFollowing(true);
    };
    element.addEventListener("scroll", scroll, {passive: true});
    element.addEventListener("wheel", wheel, {passive: true});
    element.addEventListener("keydown", key);
    const resize = new ResizeObserver(follow);
    resize.observe(element);
    setFollowing(following.current);
    follow();
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", key);
    };
  }, []);
  useLayoutEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [allMessages, aircraftId]);
  const messages = allMessages.filter(m => !aircraftId || m.aircraftId === aircraftId);
  return <div ref={log} className={styles.messageLog} role="log" aria-label={title} tabIndex={0}><h2 className={styles.messageLogTitle}>{title}</h2>{messages.length ? messages.map(m => <div key={m.id} data-frequency={m.frequency} className={frequency !== "all" && m.frequency !== frequency ? styles.offFrequencyMessage : m.sender === "controller" ? styles.controllerMessage : styles.pilotMessage}><span className={styles.messageMeta}><time dateTime={new Date(m.time).toISOString()}>{new Date(m.time).toISOString().slice(11, 19)}Z</time><span>{m.sender === "controller" ? "Controller" : "Pilot"} · {airport.icao} {FREQUENCIES[m.frequency].label} · {FREQUENCIES[m.frequency].value}</span></span><p>{m.text}{m.retractedBy ? <small className={styles.withdrawnMessage}>Withdrawn</small> : null}</p></div>) : <p className={styles.emptyMessages}>No messages yet</p>}</div>;
});
export default function MessagePanel({aircraft, exercise, frequency, connected, dispatch, onClose}: {aircraft: Aircraft; exercise: Exercise; frequency: Frequency; connected: boolean; dispatch: (a: Action) => void | Promise<boolean>; onClose: () => void}) {
  const {instructionText, requestMessageMenu} = catalogFor(getAirport(exercise), exercise.radarEnvironment);
  const [path, setPath] = useState<MenuEntry[]>([]);
  const [input, setInput] = useState("");
  const [vector, setVector] = useState<Extract<Instruction, {type: "vector"}> | null>(null);
  const pilotMessage = pendingPilotMessage(exercise, aircraft.id, frequency);
  const root = requestMessageMenu(frequency, aircraft, pilotMessage, exercise.aircraft);
  const entry = path[path.length - 1];
  const entries = (entry?.children ?? (entry ? [] : root)).filter(item => item.instruction?.type !== "frequency" || item.instruction.frequency !== aircraft.frequency);
  const invalid = entry?.instruction ? validateControllerMessage(exercise, aircraft, entry.instruction, frequency, pilotMessage?.id) : null;
  const reason = entry?.note ?? invalid;
  const composed = entry?.instruction ? instructionText(aircraft, entry.instruction, path) : `${aircraft.callsign}, ${path.map(item => item.label.replace(/\.\.\.$/, "")).join(", ")}`;
  return <section className={`${styles.extendedPanel} ${styles.commandPanel}`} aria-label={`${aircraft.callsign} messages`}>
    <header><div>{aircraft.callsign}<small>{aircraft.type} · {Math.round(aircraft.altitude).toLocaleString()}ft · {Math.round(aircraft.heading)}° · {Math.round(aircraft.speed)}KT</small></div><button aria-label="Close aircraft messages" onClick={onClose}><X size={24}/></button></header>
    {entry?.input ? <form className={styles.compose} onSubmit={event => {event.preventDefault(); const command = entry.input === "heading" ? {type: "vector" as const, heading: Math.round(Number(input) / 10) * 10 % 360} : {type: "speed" as const, value: Number(input)}; if (!input || validateControllerMessage(exercise, aircraft, command, frequency)) return; dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command)}); setPath([]); setInput("");}}><label>{entry.input === "heading" ? "Heading (°)" : "Speed (knots)"}<input autoFocus type="number" required min={entry.input === "heading" ? 0 : 80} max={entry.input === "heading" ? 360 : 600} step={entry.input === "heading" ? 10 : 1} value={input} onChange={e => setInput(e.target.value)}/></label><button type="submit" disabled={!connected || !input}>Send</button></form> : null}
    {vector ? <RadarVectorComposer initial={vector} aircraft={aircraft} exercise={exercise} frequency={frequency} connected={connected} onBack={() => setVector(null)} onSend={async command => {
      const result = await dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command), ...(pilotMessage ? {replyTo: pilotMessage.id} : {})});
      if (result !== false) {setVector(null); setPath([]);} return result !== false;
    }}/> : <div key={path.map(item => item.label).join("/")} className={styles.messageEntries}>{path.length ? <button onClick={() => {setPath(p => p.slice(0, -1)); setInput("");}}><span>‹</span><div>Back</div></button> : null}{entries.map((item, i) => {
      const direct = !item.children && Boolean(item.instruction) && !item.composeVector;
      const blocked = item.note ?? (item.instruction ? validateControllerMessage(exercise, aircraft, item.instruction, frequency, pilotMessage?.id) : null);
      return <button key={`${i}-${item.label}`} className={item.suggested ? styles.suggestedCommand : undefined} disabled={(direct || item.composeVector) && (!connected || Boolean(blocked))} title={blocked ?? undefined} aria-label={direct ? `Send ${item.label}` : undefined} onClick={() => {
        if (item.composeVector && item.instruction?.type === "vector") setVector(item.instruction);
        else if (direct && item.instruction) {
          const command = item.instruction;
          dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command, [...path, item]), ...(pilotMessage ? {replyTo: pilotMessage.id} : {})}); setPath([]);
        }
        else {setInput(""); setPath(p => [...p, item]);}
      }}><span>{i + 1}</span><div>{item.label}{direct && blocked ? <small>{blocked}</small> : null}</div>{item.children ? <b>›</b> : direct && item.label !== "Send" ? <b className={styles.sendLabel}>Send</b> : null}</button>;
    })}</div>}
    {entry && !entry.children && !entry.input ? <div className={styles.compose}><p>{composed}</p><small>{reason ?? "This message is unavailable."}</small></div> : null}
    <MessageLog airport={getAirport(exercise)} messages={exercise.messages} frequency={frequency} aircraftId={aircraft.id}/>
  </section>;
}
