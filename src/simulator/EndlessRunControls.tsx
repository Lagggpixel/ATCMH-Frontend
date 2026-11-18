
"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {endlessRequest} from "./endless/client";
import type {SessionSummary} from "./sessions";

export default function EndlessRunControls({session, csrf, home, connected}: {session: SessionSummary; csrf: string; home: string; connected: boolean}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const run = session.endless;
  if (!run) return null;
  const send = async (action: "drain" | "end") => {
    setError(""); setPending(true);
    try {
      const result = await endlessRequest(csrf, {id: session.id, action});
      if (action === "end" && result.replayId) router.replace(`${home}/replays/${result.replayId}`);
    } catch (error) {setError(error instanceof Error ? error.message : "Try again.");}
    finally {setPending(false);}
  };
  return <>
    <span title="Completed / released aircraft">{run.completed}/{run.released} complete{run.skipped ? ` · ${run.skipped} skipped` : ""}</span>
    <button type="button" disabled={!connected || pending || run.draining} onClick={() => void send("drain")}>{run.draining ? "Traffic feed stopped" : "Stop new traffic"}</button>
    {!confirm ? <button type="button" disabled={!connected || pending} onClick={() => setConfirm(true)}>End run</button> : <>
      <button type="button" disabled={pending} onClick={() => setConfirm(false)}>Keep practising</button>
      <button type="button" disabled={pending} onClick={() => void send("end")}>{pending ? "Saving…" : "End and save replay"}</button>
    </>}
    {error ? <span role="alert">{error}</span> : null}
  </>;
}
