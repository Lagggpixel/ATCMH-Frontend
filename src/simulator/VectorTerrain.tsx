"use client";
import {useEffect, useRef, useState} from "react";
import {vectorTerrainSampler, type TerrainPoint, type VectorTerrainSample} from "./vector-terrain";

/** Mounted only for a visible drag, so previous drags cannot leak their samples. */
export default function VectorTerrain({latitude, longitude}: TerrainPoint) {
  const [sample, setSample] = useState<VectorTerrainSample | null>(null);
  const sampler = useRef<ReturnType<typeof vectorTerrainSampler> | null>(null);
  useEffect(() => {
    const current = vectorTerrainSampler(setSample);
    sampler.current = current;
    return () => {current.stop(); sampler.current = null;};
  }, []);
  useEffect(() => {sampler.current?.update({latitude, longitude});}, [latitude, longitude]);
  const updating = !sample || sample.latitude !== latitude || sample.longitude !== longitude;
  return <abbr style={{textDecoration: "none"}} aria-busy={updating}
    title={updating ? "Updating endpoint terrain; any displayed elevation is the previous sample" : "Endpoint ground elevation rounded up to 100 ft"}>
    {!sample ? "…" : sample.feet === null ? "Terrain unavailable" : `${sample.feet}ft~`}{updating && sample ? " ↻" : ""}
  </abbr>;
}
