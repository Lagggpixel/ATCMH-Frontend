"use client";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {projectedPathClient} from "./projected-path-client";
import type {Aircraft, Airport, ExerciseWeather, Point, RadarEnvironment} from "./model";

const EMPTY: Point[] = [];

export function useProjectedPath(aircraft: Aircraft[], aircraftId: string | null, airport: Airport, radarEnvironment: RadarEnvironment | undefined, weather: ExerciseWeather | undefined, autoReadback: boolean, enabled: boolean) {
  const context = useMemo(() => ({aircraftId, airport: airport.icao, airportDataVersion: airport.dataVersion, radarEnvironment, weather, autoReadback}),
    [aircraftId, airport.icao, airport.dataVersion, radarEnvironment, weather, autoReadback]);
  const client = useRef<ReturnType<typeof projectedPathClient> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{context?: object; points: Point[]; attempt: number; unavailable: boolean} | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const unavailable = () => {if (active) setResult({points: EMPTY, attempt, unavailable: true});};
    try {
      const worker = new Worker(new URL("./projected-path.worker.ts", import.meta.url), {type: "module"});
      client.current = projectedPathClient(worker,
        (context, points) => {if (active) setResult({context, points, attempt, unavailable: false});}, unavailable);
    } catch {queueMicrotask(unavailable);}
    return () => {active = false; client.current?.stop(); client.current = null;};
  }, [enabled, attempt]);
  useEffect(() => {
    client.current?.update(enabled && context.aircraftId ? {context, input: {...context, aircraftId: context.aircraftId, aircraft}} : null);
  }, [aircraft, context, enabled, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return {
    points: enabled && result?.context === context && result.attempt === attempt ? result.points : EMPTY,
    unavailable: enabled && result?.attempt === attempt && result.unavailable,
    retry,
  };
}
