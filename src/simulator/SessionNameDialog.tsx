"use client";
import {useEffect, useRef, useState} from "react";
import type {ScenarioRecord} from "./scenarios";
import {DEFAULT_SESSION_TITLE, SESSION_NAME_MAX_LENGTH, type SessionSummary} from "./sessions";
import {sessionJson, trainingRequest} from "./shared-transport";
import staff from "./StaffSessions.module.css";
import ui from "./Sweatbox.module.css";

export function SessionNameField({value, onChange, placeholder, disabled, readOnly}: {
  value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean; readOnly?: boolean;
}) {
  return <label>Session name (optional)
    <input className={staff.sessionName} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
      maxLength={SESSION_NAME_MAX_LENGTH} disabled={disabled} readOnly={readOnly}/>
  </label>;
}

function SessionNameDialog({title, initialName = "", placeholder, submit, saving, lockOnRetry, onSave, onClose}: {
  title: string; initialName?: string; placeholder: string; submit: string; saving: string; lockOnRetry?: boolean;
  onSave: (name: string | null) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const [name, setName] = useState(initialName), [error, setError] = useState(""), [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false);
  useEffect(() => {dialog.current?.showModal();}, []);
  const close = () => {dialog.current?.close(); onClose();};
  return <div className={staff.library + " " + ui.dialogHost}>
    <dialog ref={dialog} aria-label={title} className={staff.dialog} onCancel={event => {event.preventDefault(); if (!pending.current) close();}}>
      <form onSubmit={async event => {
        event.preventDefault();
        if (pending.current) return;
        pending.current = true; setBusy(true); setSubmitted(true); setError("");
        try {await onSave(name.trim() || null);}
        catch (reason) {setError((reason as Error).message);}
        finally {pending.current = false; setBusy(false);}
      }}>
        <h2>{title}</h2>
        <SessionNameField value={name} onChange={setName} placeholder={placeholder} disabled={busy} readOnly={lockOnRetry && submitted}/>
        {error ? <p role="alert" className={staff.error}>{error}</p> : null}
        <div className={staff.dialogActions}>
          <button type="button" disabled={busy} onClick={close}>Cancel</button>
          <button className={staff.primary} disabled={busy}>{busy ? saving : submit}</button>
        </div>
      </form>
    </dialog>
  </div>;
}

export function ScenarioLaunchDialog({scenario, csrf, onCreated, onClose}: {
  scenario: ScenarioRecord; csrf: string; onCreated: (id: string) => void; onClose: () => void;
}) {
  const requestId = useRef<string | null>(null);
  return <SessionNameDialog title="Start a session" placeholder={scenario.published?.title ?? scenario.draft.title}
    submit="Create session" saving="Creating…" lockOnRetry onClose={onClose} onSave={async name => {
      requestId.current ??= crypto.randomUUID();
      const data = await trainingRequest(csrf, "scenarios/" + scenario.id, {
        action: "launch", revision: scenario.publishedRevision, requestId: requestId.current, sessionName: name ?? undefined,
      });
      if (!data.sessionId) throw new Error("The session could not be confirmed. Try again.");
      onCreated(data.sessionId);
    }}/>;
}

export function EditSessionNameDialog({session, csrf, onSaved, onClose}: {
  session: SessionSummary; csrf: string; onSaved: (session: SessionSummary) => void; onClose: () => void;
}) {
  const fallback = session.scenario?.title ?? DEFAULT_SESSION_TITLE;
  return <SessionNameDialog title="Edit session name" initialName={session.title === fallback ? "" : session.title} placeholder={fallback}
    submit="Save name" saving="Saving…" onClose={onClose} onSave={async sessionName => {
      const data = await fetch("/api/simulator/sessions/" + session.id + "/rename", {method: "POST",
        headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify({sessionName}),
      }).then(sessionJson);
      onSaved(data.session);
    }}/>;
}
