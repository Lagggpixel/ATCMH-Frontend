"use client";
import {trainingMode} from "./airports";
import {useEffect, useMemo, useState, useSyncExternalStore} from "react";
import {browserCollisionSound, CollisionAudio, crashSoundPreference} from "./collision-audio";
import type {Exercise} from "./model";
import styles from "./Simulator.module.css";

/** Independent of voice mute: the visual alert must always reach the controller. Only the sound can be switched off. */
export default function CrashAlert({exercise, connected, accountId, role}: {exercise: Exercise; connected: boolean; accountId: string; role: "staff" | "mentee"}) {
  const [event, setEvent] = useState<NonNullable<Exercise["collisions"]>[number] | null>(null);
  const [sound] = useState(browserCollisionSound);
  const [tracker] = useState(() => new CollisionAudio(sound, setEvent));
  useEffect(() => {
    window.addEventListener("pointerdown", sound.activate); window.addEventListener("keydown", sound.activate);
    return () => {window.removeEventListener("pointerdown", sound.activate); window.removeEventListener("keydown", sound.activate); sound.close();};
  }, [sound]);
  const preference = useMemo(() => crashSoundPreference(accountId, role), [accountId, role]);
  const soundOn = useSyncExternalStore(preference.subscribe, preference.get, preference.getServerSnapshot);
  useEffect(() => {tracker.observe(exercise, connected, true, soundOn ? 1 : 0);}, [tracker, exercise, connected, soundOn]);
  return event && trainingMode(exercise) !== "local" ? <section key={event.id} className={styles.crashAlert} role="alert" aria-label="Aircraft crash">
    <strong>{event.kind === "terrain" ? "Terrain impact" : "Aircraft crash"}</strong><span>{event.aircraft.map(a => a.callsign).join(" + ")}</span>
    <button onClick={() => setEvent(null)} aria-label="Dismiss aircraft crash alert">Dismiss</button>
  </section> : null;
}
