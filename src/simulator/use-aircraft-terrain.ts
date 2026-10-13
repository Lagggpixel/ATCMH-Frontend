"use client";
import {useEffect, useRef, useState} from "react";
import type {Aircraft, Airport, Point} from "./model";
import {rawTerrainElevation, terrainCoordinates} from "./terrain";

interface Sample {elevation: number; position: Point; time: number}
export function useAircraftTerrain(aircraft: Aircraft[], airport: Airport, enabled: boolean) {
  const latest = useRef(aircraft);
  const [samples, setSamples] = useState<Map<string, Sample>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {latest.current = aircraft;}, [aircraft]);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, busy = false;
    const controller = new AbortController();
    const tick = async () => {
      if (busy) return; busy = true;
      const queue = latest.current.filter(a => a.active && a.radar).map(a => ({id: a.id, position: {...a.position}}));
      let index = 0;
      const worker = async () => {
        while (!stopped && index < queue.length) {
          const a = queue[index++], point = terrainCoordinates(airport, a.position);
          try {
            const elevation = await rawTerrainElevation(point.latitude, point.longitude, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
            if (stopped) return;
            setSamples(current => new Map(current).set(a.id, {elevation, position: a.position, time: Date.now()}));
            setFailed(current => {const next = new Set(current); next.delete(a.id); return next;});
          } catch {
            if (stopped) return;
            setFailed(current => new Set(current).add(a.id));
            setSamples(current => {const next = new Map(current); next.delete(a.id); return next;});
          }
        }
      };
      await Promise.all(Array.from({length: Math.min(4, queue.length)}, worker)); busy = false;
    };
    void tick(); const timer = setInterval(() => {setNow(Date.now()); void tick();}, 2000);
    return () => {stopped = true; clearInterval(timer); controller.abort();};
  }, [airport, enabled]);
  const elevations = new Map<string, number>();
  if (enabled) for (const a of aircraft) {
    const sample = samples.get(a.id);
    if (sample && (now ?? sample.time) - sample.time <= 15000 && Math.hypot(a.position.x - sample.position.x, a.position.y - sample.position.y) <= .25) elevations.set(a.id, sample.elevation);
  }
  return {elevations, unavailable: enabled ? aircraft.filter(a => a.active && a.radar && failed.has(a.id)).length : 0};
}
