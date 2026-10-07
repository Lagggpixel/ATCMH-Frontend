import {useMemo} from "react";
import type {WaitlistDemand as DemandReport} from "../../types/ProgrammeStatistics";
import {demandSlotLabel} from "../../utils/WaitlistDemandUtils";
import {weeklyAvailabilityDays} from "../../../apply/weekly-availability";
import styles from "./AdminStats.module.css";

const hours = Array.from({length: 24}, (_, hour) => hour);

export default function WaitlistDemand({demand}: {demand?: DemandReport}) {
    const cells = useMemo(() => new Map(demand?.slots.map(slot => [slot.weekday * 24 + slot.hour, slot.waitingMentees])), [demand?.slots]);
    const peak = Math.max(0, ...(demand?.slots.map(slot => slot.waitingMentees) ?? []));
    return <section className={styles.panel} aria-labelledby="demand-heading">
        <h3 id="demand-heading">Weekly demand overview · UTC</h3>
        {!demand ? <p role="status">Demand reporting is not available yet. Refresh after the reporting service has been updated.</p>
            : demand.waitingMentees === 0 ? <p>No mentees are currently waiting for mentorship.</p>
            : demand.usableAvailability === 0 ? <p>No usable weekly availability yet.</p> :
                <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Weekly waitlist demand in UTC">
                    <table className={styles.demandHeatmap} aria-label="Waiting mentees available during each UTC hour; stronger shading means more demand">
                        <caption>Waiting mentees · {demand.usableAvailability} of {demand.waitingMentees} schedules</caption>
                        <thead><tr><th scope="col" className={styles.demandDay}>Day</th>{hours.map(hour => <th key={hour} scope="col" aria-label={`${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00 UTC`}>{String(hour).padStart(2, "0")}</th>)}</tr></thead>
                        <tbody>{weeklyAvailabilityDays.map((day, index) => <tr key={day}>
                            <th scope="row" className={styles.demandDay}><abbr title={day}>{day.slice(0, 3)}</abbr></th>
                            {hours.map(hour => {
                                const count = cells.get(index * 24 + hour) ?? 0;
                                return <td key={hour} style={{background: count ? `color-mix(in srgb, var(--accent-color) ${Math.round(10 + count / Math.max(1, peak) * 30)}%, var(--surface-color))` : undefined}}
                                    title={`${demandSlotLabel({weekday: index, hour})}: ${count} waiting mentees`}>{count}</td>;
                            })}
                        </tr>)}</tbody>
                    </table>
                </div>}
    </section>;
}
