"use client";
import {useEffect, useState, type SetStateAction} from "react";

// Read after hydration and never overwrite a saved preference before restoring it.
export function useBrowserPreference<T>(key: string | null, fallback: T, parse: (value: unknown) => T) {
    const [state, setState] = useState({key, value: fallback, restored: false});
    const value = state.key === key ? state.value : fallback;
    useEffect(() => {
        let restored = fallback;
        try {
            const raw = key ? window.localStorage.getItem(key) : null;
            if (raw !== null) restored = parse(JSON.parse(raw));
        } catch { /* Storage can be disabled or contain an older, invalid value. */ }
        setState({key, value: restored, restored: true});
    }, [key, fallback, parse]);
    useEffect(() => {
        if (!key || state.key !== key || !state.restored) return;
        try { window.localStorage.setItem(key, JSON.stringify(state.value)); }
        catch { /* Preferences are optional; controls must still work. */ }
    }, [key, state]);
    const update = (next: SetStateAction<T>) => setState(current => ({
        key, restored: true,
        value: typeof next === "function" ? (next as (previous: T) => T)(current.key === key ? current.value : fallback) : next,
    }));
    return [value, update] as const;
}
