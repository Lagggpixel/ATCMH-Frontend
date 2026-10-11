"use client";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {SpeakerHigh} from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import {SpeakerSlash} from "@phosphor-icons/react/dist/csr/SpeakerSlash";
import {RadioAudio as RadioPlayer, browserAudioPreference, browserSpeechOutput, radioMessageText} from "./radio-audio";
import type {Exercise, Frequency} from "./model";
import styles from "./Simulator.module.css";

export default function RadioAudio({exercise, connected, scope, accountId, role, paused = false}: {exercise: Exercise; connected: boolean; scope: Frequency | "all"; accountId: string; role: "staff" | "mentee"; paused?: boolean}) {
  const [player] = useState(() => new RadioPlayer());
  const audio = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);
  const [open, setOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const close = () => {setOpen(false); settingsButton.current?.focus();};
  useEffect(() => player.start(browserSpeechOutput(), browserAudioPreference(accountId, role)), [player, accountId, role]);
  useEffect(() => {
    window.addEventListener("pointerdown", player.activate);
    window.addEventListener("keydown", player.activate);
    return () => {window.removeEventListener("pointerdown", player.activate); window.removeEventListener("keydown", player.activate);};
  }, [player]);
  useEffect(() => {player.observe(exercise, connected, scope, paused);}, [player, exercise, connected, scope, paused]);
  const lastMessage = exercise.messages.findLast(m => scope === "all" || m.frequency === scope);
  return <div className={styles.radioAudio}>
    <button className={styles.audioToggle} aria-label={audio.enabled ? "Mute radio audio" : "Enable radio audio"} aria-pressed={audio.enabled} disabled={!audio.available} title={audio.available ? "Read new radio messages aloud in this tab" : "Voice playback unavailable in this browser"} onClick={() => player.setEnabled(!audio.enabled)}>{audio.enabled ? <SpeakerHigh/> : <SpeakerSlash/>}<span>Audio {audio.enabled ? "on" : "off"}</span></button>
    <button ref={settingsButton} className={styles.audioSettingsToggle} aria-label="Radio voice settings" aria-expanded={open} onClick={() => setOpen(!open)}>Voice</button>
    {open ? <section className={styles.audioSettings} aria-label="Radio voice settings" onKeyDown={e => {if (e.key === "Escape") {e.stopPropagation(); close();}}}>
      <header><strong>Radio voice</strong><button aria-label="Close radio voice settings" onClick={close}>×</button></header>
      <p>New controller and pilot messages on Ground and Tower, plus published ATIS. Switching frequencies keeps audio playing. Audio applies to this tab.</p>
      {!audio.available ? <p>Voice playback is unavailable in this browser.</p> : <>
        <label><input type="checkbox" checked={Boolean(audio.allowOnline)} onChange={e => player.setSettings({allowOnline: e.target.checked})}/>Allow online voices to send radio text to my browser’s speech provider in this tab</label>
        <label>Voice<select value={audio.voice} onChange={e => player.setSettings({voice: e.target.value})}><option value="">Automatic local English voice</option>{audio.voices.filter(v => v.local || audio.allowOnline).map(v => <option key={v.id} value={v.id}>{v.name} · {v.language}{v.local ? "" : " (online)"}</option>)}</select></label>
        <label>Speaking speed <output>{audio.rate.toFixed(1)}×</output><input aria-label="Speaking speed" type="range" min="0.7" max="1.5" step="0.1" value={audio.rate} onChange={e => player.setSettings({rate: Number(e.target.value)})}/></label>
        <label>Voice volume <output>{Math.round(audio.volume * 100)}%</output><input aria-label="Voice volume" type="range" min="0" max="1" step="0.1" value={audio.volume} onChange={e => player.setSettings({volume: Number(e.target.value)})}/></label>
        <div><button disabled={!audio.enabled} onClick={() => player.say("Edinburgh Ground, Easy five seven one, ready to taxi. Runway 24.")}>Test voice</button><button disabled={!audio.enabled || !lastMessage || !connected} onClick={() => {if (lastMessage) player.say(radioMessageText(lastMessage));}}>Replay last message</button><button disabled={!audio.speaking} onClick={() => player.stop()}>Stop speaking</button></div>
        {scope === "atis" ? <button disabled={!audio.enabled || exercise.publishedAtis === "ATIS UNAVAILABLE"} onClick={() => player.say(exercise.publishedAtis)}>Read published ATIS</button> : null}
        <p>Audio defaults on. Your on/off choice is remembered for this account and role in this browser. Available voices depend on your device; online voices require permission and selection in each tab. If your browser blocks automatic playback, clicking or pressing a key in the simulator retries it.</p>
      </>}
      <div role="status" className={styles.audioStatus}>{audio.error || (audio.speaking ? `Speaking: ${audio.speaking}` : audio.enabled ? "Ready for new messages" : "Audio muted")}</div>
    </section> : null}
    {audio.error && !open ? <span className={styles.audioError} role="status">Click or press a key to start audio. Voice has more options.</span> : null}
  </div>;
}
