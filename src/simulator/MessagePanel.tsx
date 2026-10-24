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
import {radioDisplayText} from "./radio-text";
import {aircraftMessageHeading} from "./aircraft-message-heading";
import {IF_COLORS, pilotMessageColor} from "./if-colors";
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
    let touchY: number | undefined;
    const touchStart = (event: TouchEvent) => {touchY = event.touches[0]?.clientY;};
    const touchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY;
      if (touchY !== undefined && nextY !== undefined && nextY > touchY && element.scrollHeight > element.clientHeight) setFollowing(false);
      touchY = nextY;
    };
    const key = (event: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) && element.scrollHeight > element.clientHeight) setFollowing(false);
      else if (event.key === "End") setFollowing(true);
    };
    element.addEventListener("scroll", scroll, {passive: true});
    element.addEventListener("wheel", wheel, {passive: true});
    element.addEventListener("touchstart", touchStart, {passive: true});
    element.addEventListener("touchmove", touchMove, {passive: true});
    element.addEventListener("keydown", key);
    const resize = new ResizeObserver(follow);
    resize.observe(element);
    setFollowing(following.current);
    follow();
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", touchStart);
      element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("keydown", key);
    };
  }, []);
  useLayoutEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [allMessages, aircraftId]);
  const messages = allMessages.filter(m => !aircraftId || m.aircraftId === aircraftId);
  return <div ref={log} className={`${styles.messageLog} ${compact ? styles.compactMessageLog : ""}`} role="log" aria-label={title} tabIndex={0}>{!compact ? <h2 className={styles.messageLogTitle}>{title}</h2> : null}{messages.length ? messages.map(m => <div key={m.id} data-frequency={m.frequency} style={{color: frequency !== "all" && m.frequency !== frequency ? IF_COLORS.offFrequency : m.sender === "controller" ? IF_COLORS.cleared : pilotMessageColor(m.aircraftId)}} className={frequency !== "all" && m.frequency !== frequency ? styles.offFrequencyMessage : m.sender === "controller" ? styles.controllerMessage : styles.pilotMessage}><span className={compact ? styles.visuallyHidden : styles.messageMeta}><time dateTime={new Date(m.time).toISOString()}>{new Date(m.time).toISOString().slice(11, 19)}Z</time><span>{m.sender === "controller" ? "Controller" : "Pilot"} · {airport.icao} {FREQUENCIES[m.frequency].label} · {FREQUENCIES[m.frequency].value}</span></span><p>{radioDisplayText(m.text)}{showUnableReasons && m.sender === "pilot" && m.unableReason ? <span className={styles.unableReason}> [{m.unableReason}]</span> : null}{m.retractedBy ? <small className={styles.withdrawnMessage}>Withdrawn</small> : null}</p></div>) : !compact ? <p className={styles.emptyMessages}>No messages yet</p> : null}</div>;
});
export default function MessagePanel({aircraft, exercise, frequency, connected, dispatch, onClose, quickCommands = [], initialPath = [], onPathChange, holdTarget, prepareSpeech}: {aircraft: Aircraft; exercise: Exercise; frequency: Frequency; connected: boolean; dispatch: (a: Action, path?: string[]) => void | Promise<boolean>; onClose: () => void; quickCommands?: readonly QuickCommand[]; initialPath?: string[]; onPathChange?: (path: string[]) => void; holdTarget?: import("./vector-drag").VectorTarget; prepareSpeech?: (text: string) => () => void}) {
  const {instructionText, requestMessageMenu} = catalogFor(getAirport(exercise), exercise.radarEnvironment, exercise.weather);
  const [pathLabels, updatePath] = useState<string[]>(initialPath);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const setPath = (path: string[]) => {setHoveredOption(null); updatePath(path); onPathChange?.(path);};
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const sending = useRef(false);
  const send = async (action: Action, path: string[] | undefined, label: string) => {
    if (sending.current) {setSendError("Another command is waiting for acknowledgement. Wait or cancel it in the connection banner."); return false;}
    if (!connected) {setSendError("This exercise is paused or no longer available."); return false;}
    sending.current = true; setPendingLabel(label); setSendError(null); setHoveredOption(null);
    try {const delivery = dispatch(action, path); onClose(); const sent = await delivery !== false; if (!sent) setSendError("Command was not sent. Check the session message for the reason, then retry."); return sent;}
    catch (error) {setSendError(error instanceof Error ? error.message : "Command was not sent. Try again."); return false;}
    finally {sending.current = false; setPendingLabel(null);}
  };
  const [input, setInput] = useState("");
  const [vector, setVector] = useState<Extract<Instruction, {type: "vector"}> | null>(null);
  const pilotMessage = pendingPilotMessage(exercise, aircraft.id, frequency);
  const menuAircraft = holdTarget && aircraft.radar ? {...aircraft, radar: {...aircraft.radar, routeIndex: holdTarget.index}} : aircraft;
  const root = requestMessageMenu(frequency, menuAircraft, pilotMessage, exercise.aircraft, exercise.messages);
  const path: MenuEntry[] = [];
  for (const label of pathLabels) {
    const entry = (path.at(-1)?.children ?? root).find(item => item.id === label || item.label === label);
    if (!entry) break;
    path.push(entry);
  }
  const entry = path.at(-1);
  const entries = entry?.children ?? (entry ? [] : root);
  const invalid = entry?.instruction ? validateControllerMessage(exercise, aircraft, entry.instruction, frequency, pilotMessage?.id) : null;
  const reason = entry?.note ?? invalid;
  const renderEntry = (item: MenuEntry, i: number) => {
      const hoverKey = `${pathLabels.join("/")}/${item.id ?? item.label}`;
      const direct = !item.children && (Boolean(item.instruction) || item.resend) && !item.composeVector;
      const blocked = item.note ?? (item.instruction ? validateControllerMessage(exercise, aircraft, item.instruction, frequency, pilotMessage?.id) : null);
      return <button key={item.id ?? `${i}-${item.label}`} style={item.label === "Misc. Messages" || path[0]?.label === "Misc. Messages" ? undefined : {textTransform: "none"}} className={`${item.suggested ? styles.suggestedCommand : ""} ${hoveredOption === hoverKey ? styles.pointerHovered : ""}`} onPointerMove={() => {if (!sending.current) setHoveredOption(hoverKey);}} onPointerLeave={() => setHoveredOption(null)} disabled={pendingLabel !== null || Boolean(item.note) || (direct || item.composeVector) && (!connected || Boolean(blocked))} title={blocked ?? undefined} aria-busy={pendingLabel === item.label || undefined} aria-disabled={pendingLabel !== null || undefined} aria-label={direct ? `Send ${item.label}` : undefined} onClick={async () => {
        if (sending.current) {setSendError("A command is still waiting for acknowledgement."); return;}
        if (item.resend) {
          const previous = exercise.messages.filter(m => m.aircraftId === aircraft.id && m.sender === "controller" && m.frequency === frequency && m.instruction).at(-1);
          if (previous?.instruction && await send({kind: "command", aircraftId: aircraft.id, command: previous.instruction, frequency, text: previous.text, resendOf: previous.id}, undefined, item.label)) setPath([]);
        }
        else if (item.composeVector && item.instruction?.type === "vector") setVector(item.instruction);
        else if (direct && item.instruction) {
          const command = item.instruction;
          if (await send({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command, [...path, item]), ...(pilotMessage && !(command.type === "atc" && ["broadcast", "guard", "bookmark", "voice"].includes(command.action)) ? {replyTo: pilotMessage.id} : {})}, [...path, item].map(entry => entry.label), item.label)) setPath([]);
        }
        else {setInput(""); setPath([...path.map(entry => entry.id ?? entry.label), item.id ?? item.label]);}
      }}><span>{i + 1 + (path.length ? 1 : 0)}</span><div>{item.label}{direct && blocked ? <small>{blocked}</small> : null}</div>{item.children ? <b>›</b> : direct && (item.sendLabel || item.label !== "Send") ? <b className={styles.sendLabel}>{item.sendLabel ?? "Send"}</b> : null}</button>;
    };
  const heading = aircraftMessageHeading(aircraft, getAirport(exercise), exercise.weather);
  const composed = entry?.instruction ? instructionText(aircraft, entry.instruction, path) : `${aircraft.callsign}, ${path.map(item => item.label.replace(/\.\.\.$/, "")).join(", ")}`;
  const speechDraft = entry?.instruction && !invalid ? composed : "";
  useEffect(() => {if (connected && speechDraft) return prepareSpeech?.(speechDraft);}, [connected, speechDraft, prepareSpeech]);
  return <section className={`${styles.extendedPanel} ${styles.commandPanel}`} data-aircraft-messages={aircraft.id} aria-label={`${aircraft.callsign} messages`}>
    <div className={styles.commandWorkspace}>
      <div className={styles.quickCommands} role="group" aria-label="Quick commands">{visibleQuickCommands(quickCommands, exercise, aircraft, frequency).map(shortcut => {
        const action = quickCommandAction(shortcut, exercise, aircraft, frequency);
        const blocked = validateControllerMessage(exercise, aircraft, action.command, frequency, action.replyTo);
        return <button key={shortcut.name} aria-label={`Send quick command ${shortcut.name}`} title={blocked ?? action.text} disabled={!connected || Boolean(blocked)} aria-busy={pendingLabel === shortcut.name || undefined} aria-disabled={pendingLabel !== null || undefined} onClick={() => {void send(action, shortcut.path, shortcut.name);}}>{shortcut.name}</button>;
      })}</div>
      <div className={styles.commandMain}>
    <header className={styles.commandHeading}>{sendError ? <p className={styles.commandSendError} role="alert">{sendError}<button onClick={() => setSendError(null)}>Dismiss</button></p> : null}<h2 className={styles.commandIdentity} style={{color: pilotMessageColor(aircraft.id)}}><span aria-label="IFC username" title={heading.username}>{heading.username}</span><span title={aircraft.callsign}>{aircraft.callsign}</span></h2><div className={styles.commandFlightData} aria-label="Aircraft flight data"><span>{heading.position}</span><span>{heading.speed}</span></div><button className={styles.keyboardClose} aria-label="Close aircraft messages" onClick={onClose}><X size={20}/></button></header>
    {entry?.input ? <form className={styles.compose} onSubmit={async event => {event.preventDefault(); const command = entry.input === "heading" ? {type: "vector" as const, heading: Math.round(Number(input) / 10) * 10 % 360} : {type: "speed" as const, value: Number(input)}; if (!input || validateControllerMessage(exercise, aircraft, command, frequency)) return; if (await send({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command)}, undefined, "Send")) {setPath([]); setInput("");}}}><label>{entry.input === "heading" ? "Heading (°M)" : "Speed (knots)"}<input autoFocus type="number" required min={entry.input === "heading" ? 0 : 80} max={entry.input === "heading" ? 360 : 600} step={entry.input === "heading" ? 10 : 1} value={input} onChange={e => setInput(e.target.value)}/></label><button type="submit" disabled={!connected || !input}>Send</button></form> : null}
    {vector ? <RadarVectorComposer prepareSpeech={prepareSpeech} initial={vector} aircraft={aircraft} exercise={exercise} frequency={frequency} connected={connected} onBack={() => setVector(null)} onSend={async command => {
      const result = await send({kind: "command", aircraftId: aircraft.id, command, frequency, text: instructionText(aircraft, command), ...(pilotMessage ? {replyTo: pilotMessage.id} : {})}, undefined, "Send vector");
      if (result !== false) {setVector(null); setPath([]);} return result !== false;
    }}/> : <div key={path.map(item => item.label).join("/")} className={styles.messageEntries} hidden={Boolean(entry?.input)}>{path.length ? <button className={styles.commandBack} aria-label="Back" onClick={() => {if (sending.current) return; setPath(path.map(item => item.id ?? item.label).slice(0, -1)); setInput("");}}><span aria-hidden="true">1</span><b aria-hidden="true"/></button> : null}{entries.map(renderEntry)}</div>}
    {entry && !entry.children && !entry.input ? <div className={styles.compose}><p>{composed}</p><small>{reason ?? "This message is unavailable."}</small></div> : null}
    <div className={styles.commandHistory}><MessageLog airport={getAirport(exercise)} messages={exercise.messages} frequency={frequency} aircraftId={aircraft.id} compact/></div>
      </div>
    </div>
  </section>;
}
