import {useEffect, useState} from "react";
import {ScopeCameraMotion, type MapCamera, type MapSize} from "./scope-camera";
import type {Point} from "./model";

function cameraControls(motion: ScopeCameraMotion, publish: (camera: MapCamera) => void) {
  let frame = 0, last = 0;
  const stop = () => {cancelAnimationFrame(frame); frame = 0; motion.stop();};
  const animate = () => {
    if (frame) return;
    last = performance.now();
    const tick = (now: number) => {
      const moving = motion.step(now - last); last = now;
      publish(motion.camera);
      frame = moving ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
  };
  return {
    motion, stop,
    sync: (camera: MapCamera, size: MapSize, minimum: number, notify: (camera: MapCamera) => void) => {motion.camera = camera; motion.size = size; motion.minimum = minimum; publish = notify;},
    reset: (next: MapCamera) => {stop(); motion.reset(next); publish(next);},
    down: (id: number, point: Point, type: string, doubleTap: boolean) => {stop(); motion.down(id, point, performance.now(), type, doubleTap);},
    move: (id: number, point: Point, navigate = true) => {motion.move(id, point, performance.now(), navigate); if (navigate) publish(motion.camera);},
    up: (id: number) => {const tap = motion.up(id, performance.now()); if (!motion.pointers.size) animate(); return tap;},
    cancel: (id?: number) => {if (id !== undefined && !motion.pointers.has(id)) return; stop(); motion.cancel(id);},
    wheel: (point: Point, delta: number, mode: number, magnify: boolean) => {stop(); motion.wheel(point, delta, mode, magnify); publish(motion.camera);},
    magnify: (point: Point, factor: number) => {stop(); motion.magnify(point, factor); publish(motion.camera);},
    zoom: (factor: number) => {stop(); motion.zoom(factor); animate();},
  };
}

export function useScopeCamera(camera: MapCamera, setCamera: (camera: MapCamera) => void, size: MapSize, minimum: number) {
  const [controls] = useState(() => cameraControls(new ScopeCameraMotion(camera, size, minimum), setCamera));
  useEffect(() => {controls.sync(camera, size, minimum, setCamera);}, [camera, size, minimum, setCamera, controls]);
  useEffect(() => {
    const cancel = () => controls.cancel();
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") cancel();};
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", cancel);
    return () => {cancel(); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape); document.removeEventListener("visibilitychange", cancel);};
  }, [controls]);
  return controls;
}
