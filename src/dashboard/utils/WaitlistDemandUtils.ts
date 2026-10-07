import type {WaitlistDemandSlot} from "../types/ProgrammeStatistics";
import {weeklyAvailabilityDays} from "../../apply/weekly-availability";

export function demandSlotLabel(slot: Pick<WaitlistDemandSlot, "weekday" | "hour">) {
    return `${weeklyAvailabilityDays[slot.weekday]} ${String(slot.hour).padStart(2, "0")}:00–${String(slot.hour + 1).padStart(2, "0")}:00 UTC`;
}
