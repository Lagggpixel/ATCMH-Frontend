"use client";
import {memo, useSyncExternalStore} from "react";
import {aircraftLabelIdentity} from "./aircraft-label";

// One presentation clock for every label. Only the identity spans subscribe;
// ticking while paused never predicts traffic or redraws the map canvas.
const listeners = new Set<() => void>();
let phase = 0;
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {phase = (phase + 1) % 3; for (const notify of listeners) notify();}, 1000);
  return () => {listeners.delete(listener); if (!listeners.size) {clearInterval(timer); timer = undefined; phase = 0;}};
}
const snapshot = () => phase;
const serverSnapshot = () => 0;

export default memo(function AircraftLabelIdentity({type, callsign}: {type: string; callsign: string}) {
  const seconds = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <span data-label-identity="" style={{whiteSpace: "pre"}}>{aircraftLabelIdentity(type, callsign, seconds)}</span>;
});
