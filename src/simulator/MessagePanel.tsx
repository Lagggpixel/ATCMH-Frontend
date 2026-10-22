"use client";
import {memo, useEffect, useLayoutEffect, useRef, useState} from "react";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {catalogFor, type MenuEntry} from "./catalog";
import {validateControllerMessage} from "./engine";
import {type Airport, pendingPilotMessage, type Action, type Aircraft, type Exercise, type Frequency} from "./model";
import {getAirport, defaultAirport, frequenciesFor} from "./airports";
import type {Instruction} from "./model";
import RadarVectorComposer from "./RadarVectorComposer";
import {quickCommandAction, visibleQuickCommands, type QuickCommand} from "./quick-commands";
import styles from "./Simulator.module.css";

export const MessageLog = memo(function MessageLog({airport = defaultAirport, messages: allMessages, frequency, aircraftId, title = "Message log", showUnableReasons = false, compact = false}: {airport?: Airport; messages: Exercise["messages"]; frequency: Frequency | "all"; aircraftId?: string; title?: string; showUnableReasons?: boolean; compact?: boolean}) {
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
  return <div ref={log} className={`${styles.messageLog} ${compact ? styles.compactMessageLog : ""}`} role="log" aria-label={title} tabIndex={0}>{!compact ? <h2 className={styles.messageLogTitle}>{title}</h2> : null}{messages.length ? messages.map(m => <div key={m.id} data-frequency={m.frequency} className={frequency !== "all" && m.frequency !== frequency ? styles.offFrequencyMessage : m.sender === "controller" ? styles.controllerMessage : styles.pilotMessage}><span className={compact ? styles.visuallyHidden : styles.messageMeta}><time dateTime={new Date(m.time).toISOString()}>{new Date(m.time).toISOString().slice(11, 19)}Z</time><span>{m.sender === "controller" ? "Controller" : "Pilot"} · {airport.icao} {FREQUENCIES[m.frequency].label} · {FREQUENCIES[m.frequency].value}</span></span><p>{m.text}{showUnableReasons && m.sender === "pilot" && m.unableReason ? <span className={styles.unableReason}> [{m.unableReason}]</span> : null}{m.retractedBy ? <small className={styles.withdrawnMessage}>Withdrawn</small> : null}</p></div>) : <p className={styles.emptyMessages}>No messages yet</p>}</div>;
});
export default function MessagePanel({aircraft, exercise, frequency, connected, dispatch, onClose, quickCommands = [], initialPath = []}: {aircraft: Aircraft; exercise: Exercise; frequency: Frequency; connected: boolean; dispatch: (a: Action, path?: string[]) => void | Promise<boolean>; onClose: () => void; quickCommands?: readonly QuickCommand[]; initialPath?: string[]}) {
  const {instructionText, requestMessageMenu} = catalogFor(getAirport(exercise), exercise.radarEnvironment);
  const [pathLabels, setPath] = useState<string[]>(initialPath);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const sending = useRef(false);
  const send = async (action: Action, path: string[] | undefined, label: string) => {
    if (sending.current || !connected) return false;
    sending.current = true; setPendingLabel(label);
    try {return await dispatch(action, path) !== false;}
    finally {sending.current = false; setPendingLabel(null);}
  };
  const [input, setInput] = useState("");
  const [dialog, setDialog] = useState<"voice" | null>(null);
  const voiceDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {if (dialog === "voice") voiceDialog.current?.showModal();}, [dialog]);
  const [recording, setRecording] = useState(false), [recordingUrl, setRecordingUrl] = useState("");
  const [recordError, setRecordError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  useEffect(() => () => {if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop());}, []);
  useEffect(() => () => {if (recordingUrl) URL.revokeObjectURL(recordingUrl);}, [recordingUrl]);
  const record = async () => {
    if (recording) {recorder.current?.stop(); setRecording(false); return;}
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({audio: true});
      const next = new MediaRecorder(stream.current), chunks: BlobPart[] = [];
      next.ondataavailable = event => chunks.push(event.data);
      next.onstop = () => {setRecordingUrl(URL.createObjectURL(new Blob(chunks, {type: next.mimeType}))); stream.current?.getTracks().forEach(track => track.stop());};
      recorder.current = next; next.start(); setRecording(true); setRecordError("");
    } catch {setRecordError("Microphone unavailable. You can enter and review the message below.");}
  };
  const [vector, setVector] = useState<Extract<Instruction, {type: "vector"}> | null>(null);
  const pilotMessage = pendingPilotMessage(exercise, aircraft.id, frequency);
  const root = requestMessageMenu(frequency, aircraft, pilotMessage, exercise.aircraft, exercise.messages);
  const path: MenuEntry[] = [];
  for (const label of pathLabels) {
    const entry = (path.at(-1)?.children ?? root).find(item => item.label === label);
    if (!entry) break;
    path.push(entry);
  }
  const entry = path.at(-1);
  const entries = (entry?.children ?? (entry ? [] : root)).filter(item => item.instruction?.type !== "frequency" || item.instruction.frequency !== aircraft.frequency);
  const invalid = entry?.instruction ? validateControllerMessage(exercise, aircraft, entry.instruction, frequency, pilotMessage?.id) : null;
  const reason = entry?.note ?? invalid;
  const renderEntry = (item: MenuEntry, i: number) => {
      const direct = !item.children && (Boolean(item.instruction) || item.resend) && !item.composeVector;
      const blocked = item.note ?? (item.instruction ? validateControllerMessage(exercise, aircraft, item.instruction, frequency, pilotMessage?.id) : null);
      return <button key={`${i}-${item.label}`} style={item.label === "Misc. Messages" || path[0]?.label === "Misc. Messages" ? undefined : {textTransform: "none"}} className={item.suggested ? styles.suggestedCommand : undefined} disabled={Boolean(item.note) || (direct || item.composeVector) && (!connected || Boolean(blocked))} title={blocked ?? undefined} aria-busy={pendingLabel === item.label || undefined} aria-disabled={pendingLabel !== null || undefined} aria-label={direct ? `Send ${item.label}` : undefined} onClick={async () => {
        if (sending.current) return;
        if (item.dialog === "voice") {setDialog("voice"); setInput("");}
        else if (item.resend) {
          const previous = exercise.messages.filter(m => m.aircraftId === aircraft.id && m.sender === "controller" && m.frequency === frequency && m.instruction).at(-1);
          if (previous?.instruction && await send({kind: "command", aircraftId: aircraft.id, command: previous.instruction, frequency, text: previous.text, resendOf: previous.id}, undefined, item.label)) setPath([]);
        }
        else if (item.composeVector && item.instruction?.type === "vector") setVector(item.instruction);
        else if (direct && item.instruction) {
          const command = item.instruction;
          if (await send({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command, [...path, item]), ...(pilotMessage && !(command.type === "atc" && ["broadcast", "guard", "bookmark", "voice"].includes(command.action)) ? {replyTo: pilotMessage.id} : {})}, [...path, item].map(entry => entry.label), item.label)) setPath([]);
        }
        else {setInput(""); setPath([...path.map(entry => entry.label), item.label]);}
      }}><span>{i + 1}</span><div>{item.label}{direct && blocked ? <small>{blocked}</small> : null}</div>{item.children ? <b>›</b> : direct && item.label !== "Send" ? <b className={styles.sendLabel}>Send</b> : null}</button>;
    };
  const composed = entry?.instruction ? instructionText(aircraft, entry.instruction, path) : `${aircraft.callsign}, ${path.map(item => item.label.replace(/\.\.\.$/, "")).join(", ")}`;
  return <section className={`${styles.extendedPanel} ${styles.commandPanel}`} aria-label={`${aircraft.callsign} messages`}>
    {dialog === "voice" ? <dialog ref={voiceDialog} aria-label="Voice Message" className={styles.compose} onCancel={() => {if (recorder.current?.state === "recording") recorder.current.stop(); setRecording(false); setDialog(null); setInput("");}}>
      <p>Record and review your training message. Enter the reviewed transcript to transmit it in this exercise.</p>
      <button disabled={!connected} onClick={() => void record()}>{recording ? "Stop recording" : "Record"}</button>
      {recordingUrl ? <audio controls src={recordingUrl}/> : null}
      <label>Reviewed message<textarea maxLength={256} value={input} onChange={event => setInput(event.target.value)}/></label>
      {recordError ? <p role="alert">{recordError}</p> : null}
      <button disabled={!connected || recording || !input.trim()} onClick={async () => {const command: Instruction = {type: "atc", action: "voice", text: input.trim()}; const sent = await dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command)}); if (sent !== false) {setDialog(null); setInput("");}}}>SEND</button>
      <button onClick={() => {if (recorder.current?.state === "recording") recorder.current.stop(); setRecording(false); setDialog(null); setInput("");}}>Cancel</button>
    </dialog> : null}
    <div className={styles.commandWorkspace}>
      <div className={styles.quickCommands} role="group" aria-label="Quick commands">{visibleQuickCommands(quickCommands, exercise, aircraft, frequency).map(shortcut => {
        const action = quickCommandAction(shortcut, exercise, aircraft, frequency);
        const blocked = validateControllerMessage(exercise, aircraft, action.command, frequency, action.replyTo);
        return <button key={shortcut.name} aria-label={`Send quick command ${shortcut.name}`} title={blocked ?? action.text} disabled={!connected || Boolean(blocked)} aria-busy={pendingLabel === shortcut.name || undefined} aria-disabled={pendingLabel !== null || undefined} onClick={() => {void send(action, shortcut.path, shortcut.name);}}>{shortcut.name}</button>;
      })}</div>
      <div className={styles.commandMain}>
    <header className={styles.commandHeading}><h2 className={styles.visuallyHidden}>{aircraft.callsign}</h2><button className={styles.keyboardClose} aria-label="Close aircraft messages" onClick={onClose}><X size={20}/></button></header>
    {entry?.input ? <form className={styles.compose} onSubmit={event => {event.preventDefault(); const command = entry.input === "heading" ? {type: "vector" as const, heading: Math.round(Number(input) / 10) * 10 % 360} : {type: "speed" as const, value: Number(input)}; if (!input || validateControllerMessage(exercise, aircraft, command, frequency)) return; dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command)}); setPath([]); setInput("");}}><label>{entry.input === "heading" ? "Heading (°M)" : "Speed (knots)"}<input autoFocus type="number" required min={entry.input === "heading" ? 0 : 80} max={entry.input === "heading" ? 360 : 600} step={entry.input === "heading" ? 10 : 1} value={input} onChange={e => setInput(e.target.value)}/></label><button type="submit" disabled={!connected || !input}>Send</button></form> : null}
    {vector ? <RadarVectorComposer initial={vector} aircraft={aircraft} exercise={exercise} frequency={frequency} connected={connected} onBack={() => setVector(null)} onSend={async command => {
      const result = await dispatch({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command), ...(pilotMessage ? {replyTo: pilotMessage.id} : {})});
      if (result !== false) {setVector(null); setPath([]);} return result !== false;
    }}/> : <div key={path.map(item => item.label).join("/")} className={styles.messageEntries} hidden={Boolean(entry?.input)}>{path.length ? <button onClick={() => {if (sending.current) return; setPath(path.map(item => item.label).slice(0, -1)); setInput("");}}><span>‹</span><div>Back</div></button> : null}{entries.map(renderEntry)}</div>}
    {entry && !entry.children && !entry.input ? <div className={styles.compose}><p>{composed}</p><small>{reason ?? "This message is unavailable."}</small></div> : null}
    <div className={styles.commandHistory}><MessageLog airport={getAirport(exercise)} messages={exercise.messages} frequency={frequency} aircraftId={aircraft.id} compact/></div>
      </div>
    </div>
  </section>;
}
