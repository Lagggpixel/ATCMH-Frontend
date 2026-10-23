"use client";
import {useEffect, useRef, useState} from "react";
import type {Aircraft} from "./model";
import type {StaffDispatch} from "./SpawnAircraftDialog";
import styles from "./Simulator.module.css";

export default function DeleteAircraftDialog({aircraft, enabled, dispatch, onDeleted, onClose}: {aircraft: Aircraft; enabled: boolean; dispatch: StaffDispatch; onDeleted: () => void; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {const node = dialog.current, previous = document.activeElement; node?.showModal(); return () => {node?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus();};}, []);
  return <dialog ref={dialog} className={styles.addTrafficDialog} aria-labelledby="delete-aircraft-title" onCancel={event => {if (pending.current) event.preventDefault(); else onClose();}} onKeyDown={event => event.stopPropagation()}>
    <div className={styles.addAircraft}><h2 id="delete-aircraft-title">Delete {aircraft.callsign}?</h2><p>Remove this aircraft from the current exercise. Its earlier radio messages and recorded flight remain in the replay.</p>
      {error ? <p role="alert">{error}</p> : null}<div className={styles.buttonRow}><button disabled={busy} onClick={onClose}>Cancel</button><button className={styles.removeButton} disabled={!enabled || busy} onClick={async () => {
        if (pending.current) return; pending.current = true; setBusy(true);
        try {if (await dispatch({kind: "remove", aircraftId: aircraft.id}) === false) throw new Error("Aircraft was not deleted. Check the session connection and try again."); onDeleted(); onClose();}
        catch (reason) {setError(reason instanceof Error ? reason.message : "Aircraft could not be deleted.");}
        finally {pending.current = false; setBusy(false);}
      }}>{busy ? "Deletingâ€¦" : "Delete aircraft"}</button></div>
    </div>
  </dialog>;
}
