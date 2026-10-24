"use client";
import {trainingMode} from "./airports";
import {useEffect, useState} from "react";
import {browserCollisionSound, CollisionAudio} from "./collision-audio";
import type {Exercise} from "./model";
import styles from "./Simulator.module.css";

/** Independent of voice mute: the visual alert must always reach the controller. */
export default function CrashAlert({exercise, connected, paused}: {exercise: Exercise; connected: boolean; paused: boolean}) {
  const [event, setEvent] = useState<NonNullable<Exercise["collisions"]>[number] | null>(null);
  const [sound] = useState(browserCollisionSound);
  const [tracker] = useState(() => new CollisionAudio(sound, setEvent));
  useEffect(() => {
    window.addEventListener("pointerdown", sound.activate); window.addEventListener("keydown", sound.activate);
    return () => {window.removeEventListener("pointerdown", sound.activate); window.removeEventListener("keydown", sound.activate); sound.close();};
  }, [sound]);
  useEffect(() => {tracker.observe(exercise, connected, true, paused, 1);}, [tracker, exercise, connected, paused]);
  return event && trainingMode(exercise) !== "local" ? <section key={event.id} className={styles.crashAlert} role="alert" aria-label="Aircraft crash">
    <strong>{event.kind === "terrain" ? "Terrain impact" : "Aircraft crash"}</strong><span>{event.aircraft.map(a => a.callsign).join(" + ")}</span>
    <button onClick={() => setEvent(null)} aria-label="Dismiss aircraft crash alert">Dismiss</button>
  </section> : null;
}
