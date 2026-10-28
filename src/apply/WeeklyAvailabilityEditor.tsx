import {maxRangesPerDay, nextAvailabilityRange, parseWeeklyAvailability, serializeWeeklyAvailability, type WeeklyAvailabilityRange} from "./weekly-availability";
import styles from "./WeeklyAvailabilityEditor.module.css";

interface WeeklyAvailabilityEditorProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
}

const rangeNames = ["first", "second", "third"];

export default function WeeklyAvailabilityEditor({id, value, onChange}: WeeklyAvailabilityEditorProps) {
    const entries = parseWeeklyAvailability(value);
    const updateEntry = (index: number, update: Partial<(typeof entries)[number]>) => {
        const next = entries.map((entry, entryIndex) => entryIndex === index ? {...entry, ...update} : entry);
        onChange(serializeWeeklyAvailability(next));
    };
    const updateRange = (index: number, rangeIndex: number, update: Partial<WeeklyAvailabilityRange>) => updateEntry(index, {
        ranges: entries[index].ranges.map((range, candidate) => candidate === rangeIndex ? {...range, ...update} : range),
    });

    return <div id={id} className={styles.availabilityEditor} tabIndex={-1}>
        {entries.map((entry, index) => {
            const slug = entry.day.toLowerCase();
            const availableId = `${id}-${slug}-available`;
            const dayLabelId = `${id}-${slug}-label`;
            const canAdd = entry.ranges.length < maxRangesPerDay;
            return <div key={entry.day} className={styles.availabilityDay} role="group" aria-labelledby={dayLabelId}>
                <strong id={dayLabelId}>{entry.day}</strong>
                <label className={styles.availabilityToggle} htmlFor={availableId}>
                    <input id={availableId} type="checkbox" checked={entry.available} onChange={event => updateEntry(index, {available: event.target.checked})}/>
                    <span>{entry.available ? "Available" : "Not available"}</span>
                </label>
                {entry.available ? <div className={styles.availabilityRanges}>
                    {entry.ranges.map((range, rangeIndex) => {
                        const startId = `${id}-${slug}-start${rangeIndex ? `-${rangeIndex + 1}` : ""}`;
                        const endId = `${id}-${slug}-end${rangeIndex ? `-${rangeIndex + 1}` : ""}`;
                        const name = `${entry.day} ${rangeNames[rangeIndex]} time`;
                        return <div key={rangeIndex} className={rangeIndex ? `${styles.availabilityTimes} ${styles.extraRange}` : styles.availabilityTimes}>
                            <label htmlFor={startId}>{rangeIndex ? "and from" : "From"} <input id={startId} type="time" step={60} value={range.start} aria-label={`${name}, from`} onChange={event => updateRange(index, rangeIndex, {start: event.target.value || "09:00"})}/></label>
                            <label htmlFor={endId}>To <input id={endId} type="time" step={60} value={range.end} aria-label={`${name}, to`} onChange={event => updateRange(index, rangeIndex, {end: event.target.value || "17:00"})}/></label>
                            {rangeIndex ? <button type="button" className={styles.removeRange} aria-label={`Remove ${name}`} onClick={() => updateEntry(index, {ranges: entry.ranges.filter((_, candidate) => candidate !== rangeIndex)})}>Remove</button> : null}
                        </div>;
                    })}
                    {canAdd ? <button type="button" className={styles.addRange} onClick={() => updateEntry(index, {ranges: [...entry.ranges, nextAvailabilityRange(entry.ranges)]})}>+ Add time</button> : null}
                </div> : null}
            </div>;
        })}
    </div>;
}
