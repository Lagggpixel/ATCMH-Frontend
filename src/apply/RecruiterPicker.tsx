"use client";

import {useEffect, useRef, useState} from "react";
import {CaretDownIcon} from "@phosphor-icons/react/CaretDown";
import {WarningCircleIcon} from "@phosphor-icons/react/WarningCircle";
import {registeredRecruiter} from "./recruiter-selection";
import styles from "./RecruiterPicker.module.css";

interface Props {
    id: string;
    value: string;
    recruiters: readonly string[];
    loading: boolean;
    loadError?: string;
    error?: string;
    disabled?: boolean;
    onRetry: () => void;
    onChange: (value: string) => void;
}

export default function RecruiterPicker({id, value, recruiters, loading, loadError, error, disabled, onRetry, onChange}: Props) {
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [placement, setPlacement] = useState({above: false, height: 320});
    const selected = registeredRecruiter(value, recruiters);
    const message = loadError ? "Recruiters unavailable."
        : loading ? "Loading recruiters…"
            : error || (value && !selected ? "Select a registered recruiter." : "");
    const invalid = !loading && Boolean(loadError || error || value && !selected);
    const results = recruiters.filter(name => name.toLowerCase().includes(query.trim().toLowerCase()));

    useEffect(() => {
        if (!open) return;
        search.current?.focus({preventScroll: true});
        const position = () => {
            const rect = trigger.current?.getBoundingClientRect();
            if (!rect) return;
            const viewport = window.visualViewport;
            const top = viewport?.offsetTop ?? 0;
            const bottom = top + (viewport?.height ?? window.innerHeight);
            const below = bottom - rect.bottom - 12;
            const above = rect.top - top - 12;
            const useAbove = below < 260 && above > below;
            setPlacement({above: useAbove, height: Math.max(100, Math.min(320, useAbove ? above : below))});
        };
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        position();
        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", position);
        window.addEventListener("scroll", position, true);
        window.visualViewport?.addEventListener("resize", position);
        return () => {
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", position);
            window.removeEventListener("scroll", position, true);
            window.visualViewport?.removeEventListener("resize", position);
        };
    }, [open]);

    useEffect(() => {
        const container = list.current;
        const option = container?.children[active];
        if (!open || !container || !option) return;
        const bounds = container.getBoundingClientRect();
        const item = option.getBoundingClientRect();
        if (item.top < bounds.top) container.scrollTop -= bounds.top - item.top;
        else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom;
    }, [active, open]);

    const choose = (name: string) => {
        onChange(name);
        setOpen(false);
        trigger.current?.focus({preventScroll: true});
    };
    const show = () => {
        setQuery("");
        setActive(Math.max(0, recruiters.indexOf(selected ?? "")));
        setOpen(true);
    };

    return <div ref={root} className={styles.root} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
        if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus({preventScroll: true});
        }
    }}>
        <button ref={trigger} id={id} type="button" role="combobox" aria-expanded={open}
            aria-controls={`${id}-options`} aria-haspopup="listbox" aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-feedback`} aria-invalid={invalid} aria-required="true"
            disabled={disabled || loading || Boolean(loadError)} className={styles.trigger}
            onClick={() => open ? setOpen(false) : show()} onKeyDown={event => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    show();
                }
            }}>
            <span className={!value ? styles.placeholder : undefined}>{selected ?? (value || "Select a recruiter")}</span>
            <CaretDownIcon size={16} aria-hidden="true"/>
        </button>
        {open && !disabled && !loading && !loadError ? <div className={`${styles.popup} ${placement.above ? styles.above : ""}`} style={{maxHeight: placement.height}}>
            <input ref={search} type="search" autoComplete="off" placeholder="Search recruiters…" aria-label="Search recruiters"
                role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-options`}
                aria-activedescendant={results[active] ? `${id}-option-${active}` : undefined}
                value={query} onChange={event => {setQuery(event.target.value); setActive(0);}}
                onKeyDown={event => {
                    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) {
                        if ((event.key === "Home" || event.key === "End") && !event.ctrlKey) return;
                        event.preventDefault();
                        if (event.key === "Enter") { if (results[active]) choose(results[active]); }
                        else setActive(current => event.key === "Home" ? 0 : event.key === "End" ? Math.max(0, results.length - 1)
                            : Math.max(0, Math.min(results.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
                    }
                }}/>
            <div ref={list} id={`${id}-options`} role="listbox" aria-label="Registered recruiters" className={styles.options}>
                {results.map((name, index) => <div key={name} id={`${id}-option-${index}`} role="option"
                    aria-selected={name === selected} className={index === active ? styles.active : undefined}
                    onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(name)}>{name}</div>)}
            </div>
            {!results.length ? <p className={styles.noResults} role="status">No registered recruiters found.</p> : null}
        </div> : null}
        <div id={`${id}-feedback`} className={styles.feedback} aria-live="polite">
            {message ? <span className={invalid ? styles.error : undefined}>
                {invalid ? <WarningCircleIcon size={16} aria-hidden="true"/> : null}{message}
                {loadError ? <button type="button" onClick={onRetry}>Retry</button> : null}
            </span> : null}
        </div>
    </div>;
}
