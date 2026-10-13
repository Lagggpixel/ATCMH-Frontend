"use client";
import {useDeferredValue, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useDashboard} from "../../DashboardProvider";
import {adminNavigationGroups} from "./AdminNavigation";
import {searchDashboard} from "../../utils/DashboardSearch";
import styles from "./DashboardQuickSearch.module.css";

export default function DashboardQuickSearch() {
    const state = useDashboard();
    const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
    const deferred = useDeferredValue(query);
    const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const available = Boolean(state.token && state.adminUser?.canAccessDashboard !== false && state.adminUser);
    const results = useMemo(() => {
        if (!available) return [];
        const sections = adminNavigationGroups(state.adminUser, true).flatMap(group => group.items);
        const recordsReady = state.loaded && !state.error;
        return searchDashboard(deferred, sections, recordsReady ? state.mentees ?? [] : [], recordsReady ? state.sessions ?? [] : [], recordsReady ? state.users ?? [] : []);
    }, [available, deferred, state.adminUser, state.loaded, state.error, state.mentees, state.sessions, state.users]);
    const selected = Math.min(active, Math.max(0, results.length - 1));
    const close = () => {setOpen(false); setQuery(""); dialog.current?.close(); previousFocus.current?.focus();};
    useEffect(() => {setOpen(false); setQuery(""); setActive(0);}, [state.auth.session?.accountId, state.token]);
    useEffect(() => {
        if (!available) return;
        const key = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !event.altKey) {
                event.preventDefault();
                if (dialog.current?.open) {input.current?.focus(); return;}
                if (document.querySelector("dialog[open]")) return;
                previousFocus.current = document.activeElement as HTMLElement;
                setQuery(""); setActive(0); setOpen(true);
            }
        };
        document.addEventListener("keydown", key);
        return () => document.removeEventListener("keydown", key);
    }, [available]);
    useEffect(() => {
        if (!open || !available) return;
        dialog.current?.showModal(); input.current?.focus();
        const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
        return () => {document.body.style.overflow = overflow; previousFocus.current?.focus();};
    }, [open, available]);
    useEffect(() => {dialog.current?.querySelector(`[data-result-index="${selected}"]`)?.scrollIntoView({block: "nearest"});}, [selected]);
    if (!available) return null;
    // Use real links so existing unsaved-editor navigation guards also handle Enter.
    const choose = () => dialog.current?.querySelector<HTMLAnchorElement>(`[data-result-index="${selected}"] a`)?.click();
    return <div className={styles.toolbar}>
        <button ref={trigger} type="button" className={styles.trigger} aria-haspopup="dialog" onClick={() => {previousFocus.current = trigger.current; setQuery(""); setActive(0); setOpen(true);}}>Quick search <kbd>Ctrl / ⌘ K</kbd></button>
        {open ? createPortal(<dialog ref={dialog} data-dashboard-surface className={`dashboard-product ${styles.dialog}`} aria-labelledby="dashboard-search-title" onCancel={event => {event.preventDefault(); close();}} onClick={event => {if (event.target === event.currentTarget) {const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();}}}>
            <header><h2 id="dashboard-search-title">Quick search</h2><button type="button" onClick={close}>Close</button></header>
            <label htmlFor="dashboard-search-input">Find a section, mentee or session</label>
            <input ref={input} id="dashboard-search-input" type="search" autoComplete="off" value={query} role="combobox" aria-expanded="true" aria-controls="dashboard-search-results" aria-autocomplete="list" aria-activedescendant={results.length ? `dashboard-result-${selected}` : undefined} onChange={event => {setQuery(event.target.value); setActive(0);}} onKeyDown={event => {
                if (event.key === "Escape") {event.preventDefault(); event.stopPropagation(); close();}
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length));}
                if (event.key === "Enter" && deferred === query && results[selected]) {event.preventDefault(); choose();}
            }}/>
            <p className={styles.hint} role="status">{state.error ? "Records could not be loaded. Dashboard sections are still available." : !state.loaded ? "Loading records… Dashboard sections are available." : `${results.length} result${results.length === 1 ? "" : "s"}${results.length === 30 ? " · Refine your search to find more" : ""}`}</p>
            <ul id="dashboard-search-results" role="listbox" aria-label="Search results" className={styles.results}>
                {results.map((result, index) => <li key={result.href} id={`dashboard-result-${index}`} role="option" aria-selected={index === selected} data-result-index={index}>
                    <a href={result.href} tabIndex={-1} onClick={close}><span className={styles.kind}>{result.kind}</span><strong>{result.label}</strong><small>{result.detail}</small></a>
                </li>)}
            </ul>
            {!results.length ? <p>No matches. Try a name, Discord ID, airport or session number.</p> : null}
            <p className={styles.hint}>↑ ↓ to select · Enter to open · Escape to close</p>
        </dialog>, document.body) : null}
    </div>;
}
