"use client";
import {resilientSpeechOutput} from "./resilient-speech";
import {browserSpeechOutput} from "./radio-audio";
import {airportCallsign, getAirport, defaultRunway} from "./airports";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {SpeakerHigh} from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import {SpeakerSlash} from "@phosphor-icons/react/dist/csr/SpeakerSlash";
import {RadioAudio as RadioPlayer, aviationSpeech, browserAudioPreference, radioMessageText} from "./radio-audio";
import {browserSentenceSpeechOutput} from "./sentence-output";
import type {Exercise, Frequency} from "./model";
import styles from "./Simulator.module.css";

export default function RadioAudio({exercise, connected, scope, accountId, role, csrf, player, channel, paused = false}: {exercise: Exercise; connected: boolean; scope: Frequency | "all"; accountId: string; role: "staff" | "mentee"; csrf: string; player: RadioPlayer; channel?: string; paused?: boolean}) {
  const audio = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);
  const [open, setOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const close = () => {setOpen(false); settingsButton.current?.focus();};
  useEffect(() => player.start(resilientSpeechOutput(browserSentenceSpeechOutput(csrf), browserSpeechOutput()), browserAudioPreference(accountId, role)), [player, accountId, role, csrf]);
  useEffect(() => {
    const activate = player.activate;
    window.addEventListener("pointerdown", activate);
    window.addEventListener("pointerup", activate);
    window.addEventListener("touchend", activate);
    window.addEventListener("keydown", activate);
    return () => {window.removeEventListener("pointerdown", activate); window.removeEventListener("pointerup", activate); window.removeEventListener("touchend", activate); window.removeEventListener("keydown", activate);};
  }, [player]);
  useEffect(() => {player.observe(exercise, connected, scope, paused, channel);}, [player, exercise, connected, scope, paused, channel]);
  const lastMessage = exercise.messages.findLast(m => scope === "all" || m.frequency === scope);
  return <div className={styles.radioAudio}>
    <button className={styles.audioToggle} aria-label={audio.enabled ? "Mute radio audio" : "Enable radio audio"} aria-pressed={audio.enabled} disabled={!audio.available} title={audio.available ? "Read new radio messages aloud in this tab" : "Voice playback unavailable in this browser"} onClick={() => player.setEnabled(!audio.enabled)}>{audio.enabled ? <SpeakerHigh/> : <SpeakerSlash/>}<span>Audio {audio.enabled ? "on" : "off"}</span></button>
    <button ref={settingsButton} className={styles.audioSettingsToggle} aria-label="Radio voice settings" aria-expanded={open} onClick={() => setOpen(!open)}>Voice</button>
    {open ? <section className={styles.audioSettings} aria-label="Radio voice settings" onKeyDown={e => {if (e.key === "Escape") {e.stopPropagation(); close();}}}>
      <header><strong>Radio voice</strong><button aria-label="Close radio voice settings" onClick={close}>×</button></header>
      <p>Each transmission is spoken as a complete sentence, with natural pauses and intonation. The next queued call prepares while the current one plays.</p>
      {!audio.available ? <p>Voice playback is unavailable in this browser.</p> : <>
        <label>Voice<select value={audio.voice} onChange={e => player.setSettings({voice: e.target.value})}><option value="">Automatic · Heart</option>{audio.voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label><input type="checkbox" checked={Boolean(audio.radioFilter)} onChange={e => player.setSettings({radioFilter: e.target.checked})}/> Radio effect</label>
        <label>Speaking speed <output>{audio.rate.toFixed(2)}×</output><input aria-label="Speaking speed" type="range" min="0.7" max="2" step="0.05" value={audio.rate} onChange={e => player.setSettings({rate: Number(e.target.value)})}/></label>
        <label>Voice volume <output>{Math.round(audio.volume * 100)}%</output><input aria-label="Voice volume" type="range" min="0" max="1" step="0.1" value={audio.volume} onChange={e => player.setSettings({volume: Number(e.target.value)})}/></label>
        <div><button disabled={!audio.enabled} onClick={() => player.say(aviationSpeech(`${airportCallsign(getAirport(exercise))} Ground, Easy 24 ready to taxi to runway ${defaultRunway(getAirport(exercise))}.`, ["Easy 24"]))}>Test voice</button><button disabled={!audio.enabled || !lastMessage || !connected} onClick={() => {if (lastMessage) player.say(radioMessageText(lastMessage));}}>Replay last message</button><button disabled={!audio.speaking} onClick={() => player.stop()}>Stop speaking</button></div>
        {scope === "atis" ? <button disabled={!audio.enabled || exercise.publishedAtis === "ATIS UNAVAILABLE"} onClick={() => player.say(exercise.publishedAtis)}>Read published ATIS</button> : null}
      </>}
      <div role="status" className={styles.audioStatus}>{audio.error || (audio.enabled ? audio.speaking ? `${audio.status || "Speaking"}: ${audio.speaking}` : audio.status || "Ready for new messages" : "Audio muted")}</div>
    </section> : null}
    {audio.error && !open ? <span className={styles.audioError} role="status">{audio.status || "Click or press a key to retry audio."}</span> : null}
  </div>;
}
