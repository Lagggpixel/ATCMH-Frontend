"use client";
import {airportCallsign, getAirport, defaultRunway} from "./airports";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {SpeakerHigh} from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import {SpeakerSlash} from "@phosphor-icons/react/dist/csr/SpeakerSlash";
import {RadioAudio as RadioPlayer, browserAudioPreference, radioMessageText} from "./radio-audio";
import {browserCollisionSound, CollisionAudio} from "./collision-audio";
import {browserRadioSpeechOutput} from "./kokoro-output";
import type {Exercise, Frequency} from "./model";
import styles from "./Simulator.module.css";

export default function RadioAudio({exercise, connected, scope, accountId, role, paused = false}: {exercise: Exercise; connected: boolean; scope: Frequency | "all"; accountId: string; role: "staff" | "mentee"; paused?: boolean}) {
  const [player] = useState(() => new RadioPlayer());
  const [collisionSound] = useState(browserCollisionSound);
  const [impacts] = useState(() => new CollisionAudio(collisionSound));
  const audio = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);
  const [open, setOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const close = () => {setOpen(false); settingsButton.current?.focus();};
  useEffect(() => player.start(browserRadioSpeechOutput(), browserAudioPreference(accountId, role)), [player, accountId, role]);
  useEffect(() => {
    const activate = () => {player.activate(); collisionSound.activate();};
    window.addEventListener("pointerdown", activate);
    window.addEventListener("keydown", activate);
    return () => {window.removeEventListener("pointerdown", activate); window.removeEventListener("keydown", activate); collisionSound.close();};
  }, [player, collisionSound]);
  useEffect(() => {player.observe(exercise, connected, scope, paused);}, [player, exercise, connected, scope, paused]);
  useEffect(() => {impacts.observe(exercise, connected, audio.enabled, paused, audio.volume);}, [impacts, exercise, connected, audio.enabled, paused, audio.volume]);
  const lastMessage = exercise.messages.findLast(m => scope === "all" || m.frequency === scope);
  return <div className={styles.radioAudio}>
    <button className={styles.audioToggle} aria-label={audio.enabled ? "Mute radio audio" : "Enable radio audio"} aria-pressed={audio.enabled} disabled={!audio.available} title={audio.available ? "Read new radio messages aloud in this tab" : "Voice playback unavailable in this browser"} onClick={() => player.setEnabled(!audio.enabled)}>{audio.enabled ? <SpeakerHigh/> : <SpeakerSlash/>}<span>Audio {audio.enabled ? "on" : "off"}</span></button>
    <button ref={settingsButton} className={styles.audioSettingsToggle} aria-label="Radio voice settings" aria-expanded={open} onClick={() => setOpen(!open)}>Voice</button>
    {open ? <section className={styles.audioSettings} aria-label="Radio voice settings" onKeyDown={e => {if (e.key === "Escape") {e.stopPropagation(); close();}}}>
      <header><strong>Radio voice</strong><button aria-label="Close radio voice settings" onClick={close}>×</button></header>
      <p>Kokoro voices use a radio effect and run on this device. The voice model downloads on first use; browser voices are the fallback.</p>
      {!audio.available ? <p>Voice playback is unavailable in this browser.</p> : <>
        <label><input type="checkbox" checked={Boolean(audio.allowOnline)} onChange={e => player.setSettings({allowOnline: e.target.checked})}/>Allow online voices to send radio text to my browser’s speech provider in this tab</label>
        <label>Voice<select value={audio.voice} onChange={e => player.setSettings({voice: e.target.value})}><option value="">{audio.voices.some(voice => voice.id.startsWith("kokoro:")) ? "Automatic · Kokoro Emma with browser fallback" : "Automatic local English voice"}</option>{audio.voices.filter(v => v.local || audio.allowOnline).map(v => <option key={v.id} value={v.id}>{v.name} · {v.language}{v.local ? "" : " (online)"}</option>)}</select></label>
        <label>Speaking speed <output>{audio.rate.toFixed(2)}×</output><input aria-label="Speaking speed" type="range" min="0.7" max="1.5" step="0.05" value={audio.rate} onChange={e => player.setSettings({rate: Number(e.target.value)})}/></label>
        <label>Voice volume <output>{Math.round(audio.volume * 100)}%</output><input aria-label="Voice volume" type="range" min="0" max="1" step="0.1" value={audio.volume} onChange={e => player.setSettings({volume: Number(e.target.value)})}/></label>
        <div><button disabled={!audio.enabled} onClick={() => player.say(`${airportCallsign(getAirport(exercise))} Ground, Easy five seven one, ready to taxi. Runway ${defaultRunway(getAirport(exercise))}.`)}>Test voice</button><button disabled={!audio.enabled || !lastMessage || !connected} onClick={() => {if (lastMessage) player.say(radioMessageText(lastMessage));}}>Replay last message</button><button disabled={!audio.speaking} onClick={() => player.stop()}>Stop speaking</button></div>
        {scope === "atis" ? <button disabled={!audio.enabled || exercise.publishedAtis === "ATIS UNAVAILABLE"} onClick={() => player.say(exercise.publishedAtis)}>Read published ATIS</button> : null}
      </>}
      <div role="status" className={styles.audioStatus}>{audio.error || (audio.enabled ? audio.speaking ? `${audio.status || "Speaking"}: ${audio.speaking}` : audio.status || "Ready for new messages" : "Audio muted")}</div>
    </section> : null}
    {audio.error && !open ? <span className={styles.audioError} role="status">Click or press a key to start audio.</span> : null}
  </div>;
}
