import {parseWeeklyAvailability, serializeWeeklyAvailability} from "./weekly-availability";
import styles from "./WeeklyAvailabilityEditor.module.css";

interface WeeklyAvailabilityEditorProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
}

export default function WeeklyAvailabilityEditor({id, value, onChange}: WeeklyAvailabilityEditorProps) {
    const entries = parseWeeklyAvailability(value);
    const updateEntry = (index: number, update: Partial<(typeof entries)[number]>) => {
        const next = entries.map((entry, entryIndex) => entryIndex === index ? {...entry, ...update} : entry);
        onChange(serializeWeeklyAvailability(next));
    };

    return <div id={id} className={styles.availabilityEditor} tabIndex={-1}>
        {entries.map((entry, index) => {
            const slug = entry.day.toLowerCase();
            const availableId = `${id}-${slug}-available`;
            const dayLabelId = `${id}-${slug}-label`;
            const startId = `${id}-${slug}-start`;
            const endId = `${id}-${slug}-end`;
            return <div key={entry.day} className={styles.availabilityDay} role="group" aria-labelledby={dayLabelId}>
                <strong id={dayLabelId}>{entry.day}</strong>
                <label className={styles.availabilityToggle} htmlFor={availableId}>
                    <input id={availableId} type="checkbox" checked={entry.available} onChange={event => updateEntry(index, {available: event.target.checked})}/>
                    <span>{entry.available ? "Available" : "Not available"}</span>
                </label>
                {entry.available ? <div className={styles.availabilityTimes}>
                    <label htmlFor={startId}>From <input id={startId} type="time" step={60} value={entry.start} onChange={event => updateEntry(index, {start: event.target.value || "09:00"})}/></label>
                    <label htmlFor={endId}>To <input id={endId} type="time" step={60} value={entry.end} onChange={event => updateEntry(index, {end: event.target.value || "17:00"})}/></label>
                </div> : null}
            </div>;
        })}
    </div>;
}
