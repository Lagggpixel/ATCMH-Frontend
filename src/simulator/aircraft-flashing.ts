import type {Aircraft, Frequency} from "./model";
import {controllerAircraft} from "./controller-state";
import {IF_COLORS} from "./if-colors";

export type AircraftFlash = "pending" | "reminder" | "extended";
interface Attention {
  selected?: boolean; open?: boolean; pending?: boolean; reminder?: boolean; dragging?: boolean; hasStripControl?: boolean;
  alert?: "warning" | "alert";
}

/** IF 26.4 MapControl.GetAircraftColor, before the CSS flash phases.
 * Icon overrides and final custom/dragged text colors are independent. */
export function aircraftAppearance(aircraft: Aircraft, frequency: Frequency | "all", attention: Attention = {}) {
  const tuned = frequency === "all" ? aircraft.frequency !== null && aircraft.frequency !== "atis" : aircraft.frequency === frequency;
  const flash: AircraftFlash | undefined = attention.open ? "extended" : tuned && attention.reminder ? "reminder" : tuned && attention.pending ? "pending" : undefined;
  const textOverride = attention.dragging ? IF_COLORS.movingLabel : aircraft.color ?? (!tuned && (attention.selected || attention.open) ? IF_COLORS.selected : undefined);
  return {
    iconColor: attention.alert === "alert" ? IF_COLORS.alert : attention.alert === "warning" ? IF_COLORS.warning : !tuned ? IF_COLORS.offFrequency : attention.hasStripControl === false ? IF_COLORS.selected : IF_COLORS.aircraft,
    textColor: textOverride ?? (controllerAircraft(aircraft).clearedToLand ? IF_COLORS.cleared : IF_COLORS.text),
    iconFlash: tuned && attention.hasStripControl !== false && !attention.alert ? flash : undefined,
    textFlash: textOverride ? undefined : flash,
  };
}
