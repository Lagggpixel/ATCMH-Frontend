"use client";
import {useEffect, useId, useState} from "react";
import {MagnifyingGlass} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {Check} from "@phosphor-icons/react/dist/csr/Check";
import {sessionJson} from "./shared-transport";
import styles from "./StaffSessions.module.css";

export interface Mentee {discordId: string; name?: string}
const initials = (name: string) => name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?";

export const assignMentee = (csrf: string, sessionId: string, mentee: Mentee | null) =>
  fetch(`/api/simulator/sessions/${sessionId}/assign`, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify({mentee})}).then(sessionJson);

/** Searches the ATCMH member directory; any member can be assigned. */
export default function MenteePicker({value, onChange, disabled = false}: {value: Mentee | null; onChange: (mentee: Mentee | null) => void; disabled?: boolean}) {
  const [query, setQuery] = useState(""), [results, setResults] = useState<{id: string; name: string}[]>([]), [error, setError] = useState(""), [searching, setSearching] = useState(false);
  const listId = useId();
  useEffect(() => {
    const value = query.trim();
    if (!value) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/simulator/people?${new URLSearchParams({q: value})}`, {cache: "no-store", signal: controller.signal}).then(sessionJson)
        .then(data => {setResults(data.people); setError("");}).catch(reason => {if (!controller.signal.aborted) setError((reason as Error).message);})
        .finally(() => {if (!controller.signal.aborted) setSearching(false);});
    }, 250);
    return () => {clearTimeout(timer); controller.abort();};
  }, [query]);
  const shown = query.trim() ? results : [];
  return <div className={styles.picker}>
    <label>Search members
      <span className={styles.searchField}><MagnifyingGlass size={18} aria-hidden="true"/><input type="search" value={query} disabled={disabled} placeholder="Discord name or ID" autoComplete="off" aria-controls={listId} onChange={e => setQuery(e.target.value)}/></span>
    </label>
    {value && !shown.some(person => person.id === value.discordId) ? <PersonOption id={value.discordId} name={value.name ?? value.discordId} selected disabled={disabled} onPick={() => onChange(null)}/> : null}
    <div id={listId} className={styles.pickerResults} aria-live="polite">
      {error ? <p role="alert" className={styles.error}>{error}</p> : searching && !shown.length ? <p className={styles.pickerHint}>Searching…</p> : query.trim() && !shown.length ? <p className={styles.pickerHint}>No members match “{query.trim()}”.</p> : null}
      {shown.map(person => <PersonOption key={person.id} id={person.id} name={person.name} selected={value?.discordId === person.id} disabled={disabled}
        onPick={() => onChange(value?.discordId === person.id ? null : {discordId: person.id, name: person.name})}/>)}
    </div>
  </div>;
}
function PersonOption({id, name, selected, disabled, onPick}: {id: string; name: string; selected: boolean; disabled: boolean; onPick: () => void}) {
  return <button type="button" className={styles.personOption} aria-pressed={selected} disabled={disabled} onClick={onPick}>
    <span className={styles.avatar} aria-hidden="true">{initials(name)}</span>
    <span className={styles.personText}><strong>{name}</strong><small>{id}</small></span>
    {selected ? <Check size={20} weight="bold" aria-hidden="true"/> : null}
  </button>;
}
