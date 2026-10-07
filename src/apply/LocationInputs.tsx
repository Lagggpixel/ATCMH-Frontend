import {useState, useSyncExternalStore} from "react";
import {
    applicationRegions,
    commonTimezoneOffsets,
    formatUtcOffset,
    inferTimezoneFromCurrentTime,
    normalizeRegionAnswer,
    normalizeTimezoneAnswer,
    parseCurrentClockTime,
    type InferredTimezone,
} from "./location-input";
import styles from "./ApplicationPage.module.css";

interface LocationInputProps {
    id: string;
    value: string;
    describedBy?: string;
    invalid: boolean;
    onChange: (value: string) => void;
}

export function RegionInput({id, value, describedBy, invalid, onChange}: LocationInputProps) {
    const selected = normalizeRegionAnswer(value) ?? value;
    const savedCustomAnswer = selected && !applicationRegions.some(region => region === selected);
    return <select id={id} value={selected} aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-required="true" aria-invalid={invalid} onChange={event => onChange(event.target.value)}>
        <option value="">Choose your region</option>
        {savedCustomAnswer ? <option value={selected}>Saved answer: {selected} — choose a region below</option> : null}
        {applicationRegions.map(region => <option key={region} value={region}>{region}</option>)}
    </select>;
}

function subscribeToBrowserTimezone(onChange: () => void) {
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
        window.removeEventListener("focus", onChange);
        document.removeEventListener("visibilitychange", onChange);
    };
}

function browserOffsetMinutes() {
    return -new Date().getTimezoneOffset();
}

const serverOffsetMinutes = () => null;

export function TimezoneInput({id, value, describedBy, invalid, onChange}: LocationInputProps) {
    const detectedOffset = useSyncExternalStore(subscribeToBrowserTimezone, browserOffsetMinutes, serverOffsetMinutes);
    const detectedValue = detectedOffset === null ? null : formatUtcOffset(detectedOffset);
    const [clockMode, setClockMode] = useState(false);
    const [clockTime, setClockTime] = useState("");
    const [clockError, setClockError] = useState<string>();
    const [candidates, setCandidates] = useState<InferredTimezone[]>([]);
    const selected = normalizeTimezoneAnswer(value) ?? value;
    const savedCustomAnswer = selected && !commonTimezoneOffsets.includes(selected);

    const findOffset = () => {
        if (parseCurrentClockTime(clockTime) === null) {
            setCandidates([]);
            setClockError("Enter your current local time, such as 5:30pm or 17:30.");
            document.getElementById(`${id}-clock`)?.focus();
            return;
        }
        const next = inferTimezoneFromCurrentTime(clockTime, new Date(), browserOffsetMinutes());
        setCandidates(next);
        setClockError(next.length ? undefined : "We could not match that time. Check your current clock or choose a UTC offset above.");
    };

    const confirmOffset = (candidate: InferredTimezone) => {
        const current = inferTimezoneFromCurrentTime(clockTime, new Date(), browserOffsetMinutes());
        if (!current.some(option => option.value === candidate.value)) {
            setCandidates(current);
            setClockError("Your clock result has changed. Update your current time and find the offset again.");
            return;
        }
        onChange(candidate.value);
        setClockError(undefined);
        setCandidates([]);
        setClockMode(false);
    };

    return <div className={styles.timezoneInput}>
        <select id={id} value={selected} aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-required="true" aria-invalid={invalid} onChange={event => onChange(event.target.value)}>
            <option value="">Choose your UTC offset</option>
            {savedCustomAnswer ? <option value={selected}>{normalizeTimezoneAnswer(selected) ? selected : `Saved answer: ${selected} — choose an offset below`}</option> : null}
            {commonTimezoneOffsets.map(offset => <option key={offset} value={offset}>{offset}</option>)}
        </select>
        {detectedValue ? <div className={styles.timezoneSuggestion}>
            <p>Your browser suggests <strong>{detectedValue}</strong>, including daylight saving if currently active.</p>
            <button type="button" className={styles.secondary} onClick={() => onChange(formatUtcOffset(browserOffsetMinutes()) ?? detectedValue)}>Use browser offset</button>
        </div> : null}
        {selected && normalizeTimezoneAnswer(selected) ? <p className={styles.help} role="status">Selected: <strong>{selected}</strong>. This is your current UTC offset; update it if daylight saving changes.</p> : null}
        <button type="button" className={styles.timezoneClockToggle} aria-expanded={clockMode} aria-controls={`${id}-clock-panel`} onClick={() => setClockMode(current => !current)}>Find it from my current time</button>
        {clockMode ? <div id={`${id}-clock-panel`} className={styles.timezoneClockPanel}>
            <label htmlFor={`${id}-clock`}>What time does your clock show right now?</label>
            <p id={`${id}-clock-help`} className={styles.help}>Use 5:30pm or 17:30. We will suggest the nearest 15-minute UTC offset for you to confirm.</p>
            <div className={styles.timezoneClockControls}>
                <input id={`${id}-clock`} type="text" value={clockTime} placeholder="5:30pm or 17:30" autoComplete="off" spellCheck={false} aria-describedby={`${id}-clock-help${clockError ? ` ${id}-clock-error` : ""}`} aria-invalid={Boolean(clockError)} onChange={event => {setClockTime(event.target.value); setCandidates([]); setClockError(undefined);}} onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); findOffset();}}}/>
                <button type="button" className={styles.secondary} onClick={findOffset}>Find UTC offset</button>
            </div>
            {clockError ? <p id={`${id}-clock-error`} className={styles.fieldError} role="alert">{clockError}</p> : null}
            {candidates.length ? <div className={styles.timezoneCandidates} role="group" aria-label="Confirm your UTC offset">
                <p role="status">{candidates.length > 1 ? "This time can match more than one day. Choose the offset that fits your location; the browser suggestion is shown above." : "Check this offset, then confirm it to save your answer."}</p>
                <div>{candidates.map(candidate => <button type="button" key={candidate.value} className={styles.secondary} onClick={() => confirmOffset(candidate)}>Use {candidate.value}</button>)}</div>
            </div> : null}
        </div> : null}
    </div>;
}
