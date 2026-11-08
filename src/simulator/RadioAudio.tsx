"use client";
import {resilientSpeechOutput} from "./resilient-speech";
import {airportCallsign, getAirport, defaultRunway} from "./airports";
import {useEffect, useId, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {CaretDown} from "@phosphor-icons/react/dist/csr/CaretDown";
import {CaretLeft} from "@phosphor-icons/react/dist/csr/CaretLeft";
import {CaretRight} from "@phosphor-icons/react/dist/csr/CaretRight";
import {Headset} from "@phosphor-icons/react/dist/csr/Headset";
import {Play} from "@phosphor-icons/react/dist/csr/Play";
import {SpeakerHigh} from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import {SpeakerSlash} from "@phosphor-icons/react/dist/csr/SpeakerSlash";
import {RadioAudio as RadioPlayer, aviationSpeech, browserAudioPreference, browserAudioActivation, browserSpeechOutput, radioMessageText} from "./radio-audio";
import {crashSoundPreference} from "./collision-audio";
import {browserPocketSpeechOutput} from "./pocket-output";
import type {Exercise, Frequency} from "./model";
import styles from "./Simulator.module.css";

/** A controller position a trainer can choose to hear; "" hears every position. */
export interface HearOption {id: string; name: string; mhz: string}

export default function RadioAudio({exercise, connected, scope, accountId, role, csrf, player, channel, paused = false, hear}: {exercise: Exercise; connected: boolean; scope: Frequency | "all"; accountId: string; role: "staff" | "mentee"; csrf: string; player: RadioPlayer; channel?: string; paused?: boolean;
  /** Trainers only: which position's radio to hear. Shown when the session has more than one position. */
  hear?: {options: HearOption[]; value: string; onChange: (positionId: string) => void}}) {
  const audio = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);
  const crash = useMemo(() => crashSoundPreference(accountId, role), [accountId, role]);
  const crashSound = useSyncExternalStore(crash.subscribe, crash.get, crash.getServerSnapshot);
  const [open, setOpen] = useState(false), [page, setPage] = useState<"main" | "voice">("main");
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  const currentExercise = useRef(exercise);
  useEffect(() => {currentExercise.current = exercise;}, [exercise]);
  const close = () => {setOpen(false); setPage("main"); toggle.current?.focus();};
  useEffect(() => player.start(resilientSpeechOutput(browserPocketSpeechOutput(csrf, text => {
    const current = currentExercise.current;
    const callsigns = current.aircraft.map(a => a.callsign);
    const message = current.messages.find(m => radioMessageText(m, callsigns) === text);
    const messageId = message?.id ?? (aviationSpeech(current.publishedAtis) === text ? "published-atis" : undefined);
    return messageId ? {sessionId: current.id, messageId} : undefined;
  }), browserSpeechOutput(), 3000), browserAudioPreference(accountId, role)), [player, accountId, role, csrf]);
  useEffect(() => browserAudioActivation(player.activate), [player]);
  useEffect(() => {player.observe(exercise, connected, scope, paused, channel);}, [player, exercise, connected, scope, paused, channel]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {if (event.target instanceof Node && !root.current?.contains(event.target)) {setOpen(false); setPage("main");}};
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const positions = hear && hear.options.length > 1 ? hear : undefined;
  const heard = positions?.options.find(p => p.id === positions.value);
  const target = positions ? heard?.name ?? "All" : undefined;
  // The browser blocked playback: one tap on the button resumes the queued transmission.
  const blocked = audio.enabled && audio.waiting && !open;
  const label = !audio.available ? "No audio" : blocked ? "Tap to start audio" : !audio.enabled ? target ? `Muted · ${target}` : "Muted" : target ?? "Audio";
  const icon = !audio.available || !audio.enabled ? <SpeakerSlash aria-hidden="true"/> : blocked ? <Play aria-hidden="true"/> : positions ? <Headset aria-hidden="true"/> : <SpeakerHigh aria-hidden="true"/>;
  const atis = exercise.publishedAtis !== "ATIS UNAVAILABLE" ? exercise.publishedAtis : "";
  return <div ref={root} className={styles.radioAudio} onKeyDown={e => {if (e.key === "Escape" && open) {e.stopPropagation(); close();}}}>
    <button ref={toggle} className={styles.audioToggle} data-state={!audio.available ? "unavailable" : blocked ? "blocked" : audio.enabled ? "on" : "muted"} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-menu`}
      aria-label={`Radio audio: ${!audio.available ? "unavailable" : blocked ? "waiting for a tap to start" : audio.enabled ? "on" : "muted"}${target ? `, hearing ${heard ? `${heard.name} ${heard.mhz}` : "all positions"}` : ""}`}
      title={blocked ? audio.error : "Radio audio"} onClick={() => {if (blocked) {player.activate(); return;} if (open) close(); else setOpen(true);}}>
      {icon}{positions && audio.enabled && audio.available && !blocked ? <span className={styles.audioHear}>Hear</span> : null}<span>{label}</span>{blocked ? null : <CaretDown aria-hidden="true" className={styles.audioCaret}/>}
    </button>
    {open ? <section id={`${id}-menu`} className={styles.audioSettings} role="dialog" aria-label={page === "voice" ? "Voice settings" : "Radio audio"}>
      {page === "main" ? <>
        <header><strong>Radio audio</strong><label className={styles.audioSwitch}>Sound<input type="checkbox" role="switch" checked={audio.enabled} disabled={!audio.available} onChange={e => player.setEnabled(e.target.checked)}/></label></header>
        {!audio.available ? <p>Voice playback is unavailable in this browser.</p> : null}
        {positions ? <fieldset className={styles.audioHearList}><legend>Hear</legend>
          {[{id: "", name: "All positions", mhz: `${positions.options.length} frequencies`}, ...positions.options].map(p => <label key={p.id || "all"} data-selected={positions.value === p.id || undefined}>
            <input type="radio" name={`${id}-hear`} checked={positions.value === p.id} onChange={() => positions.onChange(p.id)}/><span>{p.name}</span><span className={styles.audioMhz}>{p.mhz}</span>
          </label>)}
        </fieldset> : null}
        <label className={styles.audioRange}><span>Volume</span><input aria-label="Voice volume" type="range" min="0" max="1" step="0.1" value={audio.volume} disabled={!audio.available} onChange={e => player.setSettings({volume: Number(e.target.value)})}/><output>{Math.round(audio.volume * 100)}%</output></label>
        <label className={styles.audioSwitch}><span>Crash alert sound<small>Plays even when Sound is off</small></span><input type="checkbox" role="switch" checked={crashSound} onChange={e => crash.set(e.target.checked)}/></label>
        <button type="button" className={styles.audioVoiceRow} disabled={!audio.available} onClick={() => setPage("voice")}><span>Voice, speed and radio effect</span><span className={styles.audioMhz}>{audio.voices.find(v => v.id === audio.voice)?.name ?? "George"} · {audio.rate.toFixed(2)}×</span><CaretRight aria-hidden="true"/></button>
      </> : <>
        <header><button type="button" className={styles.audioBack} aria-label="Back to radio audio" onClick={() => setPage("main")}><CaretLeft aria-hidden="true"/></button><strong>Voice</strong></header>
        <label>Pilot voice<select value={audio.voice} onChange={e => player.setSettings({voice: e.target.value})}><option value="">Automatic · George</option>{audio.voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label className={styles.audioRange}><span>Speed</span><input aria-label="Speaking speed" type="range" min="0.7" max="2" step="0.05" value={audio.rate} onChange={e => player.setSettings({rate: Number(e.target.value)})}/><output>{audio.rate.toFixed(2)}×</output></label>
        <label className={styles.audioSwitch}><span>Radio effect</span><input type="checkbox" role="switch" checked={Boolean(audio.radioFilter)} onChange={e => player.setSettings({radioFilter: e.target.checked})}/></label>
        <div className={styles.audioActions}><button type="button" disabled={!audio.enabled} onClick={() => player.say(aviationSpeech(`${airportCallsign(getAirport(exercise))} Ground, Easy 24 ready to taxi to runway ${defaultRunway(getAirport(exercise))}.`, ["Easy 24"]))}><Play aria-hidden="true"/>Test voice</button>
          {atis ? <button type="button" disabled={!audio.enabled} onClick={() => player.say(atis)}>Read ATIS</button> : null}</div>
      </>}
      {audio.error ? <div role="status" className={styles.audioStatus}>{audio.error}</div> : null}
    </section> : null}
  </div>;
}
