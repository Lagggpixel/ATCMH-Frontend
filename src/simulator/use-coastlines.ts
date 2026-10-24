"use client";
import {useEffect, useState} from "react";
import {loadCoastlines, type Coastlines} from "./coastlines";

export function useCoastlines() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{data?: Coastlines; error?: string}>({});
  useEffect(() => {
    let active = true;
    loadCoastlines().then(data => {if (active) setResult({data});}, () => {if (active) setResult({error: "Coastlines unavailable."});});
    return () => {active = false;};
  }, [attempt]);
  return {...result, retry: () => {setResult({}); setAttempt(value => value + 1);}};
}
