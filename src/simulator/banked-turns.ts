import {trueAirspeed} from "./aircraft-performance";
import {DEFAULTS, type Aircraft} from "./model";

const radians = Math.PI / 180;
const knotsToMetresPerSecond = 1852 / 3600;
const gravity = 9.80665;
const rateFactor = (speed: number) => gravity / (Math.max(1, speed) * knotsToMetresPerSecond) / radians;

/** Coordinated turn, using the same airspeed as the simulator's flight motion.
 * FAA PHAK chapter 5: rate is proportional to tan(bank) / airspeed. */
export const bankTurnRate = (speed: number, bank: number) => rateFactor(speed) * Math.tan(bank * radians);
export const bankTurnRadius = (speed: number, bank = DEFAULTS.bankAngle) => speed / 3600 / (bankTurnRate(speed, bank) * radians);
/** Start the corner early enough to include rolling into the bank. NM. */
export const bankTurnLead = (speed: number) => bankTurnRadius(speed) + speed / 3600 * DEFAULTS.bankAngle / DEFAULTS.bankRate / 2;

/** Heading travelled while rolling linearly between two bank angles. */
function headingDuringRoll(speed: number, from: number, to: number, dt: number) {
  if (Math.abs(to - from) < 1e-7) return bankTurnRate(speed, (from + to) / 2) * dt;
  const rolling = Math.abs(to - from) / DEFAULTS.bankRate;
  return rateFactor(speed) * Math.log(Math.cos(from * radians) / Math.cos(to * radians)) / ((to - from) * radians / rolling)
    + bankTurnRate(speed, to) * Math.max(0, dt - rolling);
}
/** Heading needed to roll all the way back to wings level at the roll limit. */
function rolloutHeading(speed: number, bank: number) {
  return Math.sign(bank) * rateFactor(speed) * -Math.log(Math.cos(bank * radians)) / (DEFAULTS.bankRate * radians);
}

export function turnAircraft(a: Pick<Aircraft, "heading" | "targetHeading" | "speed" | "bankAngle"> & Partial<Pick<Aircraft,"performanceProfile"|"altitude">>, seconds: number, maxBank = DEFAULTS.bankAngle) {
  const speed=a.performanceProfile?trueAirspeed(a.speed,a.altitude??0):a.speed;
  let remaining = Math.max(0, seconds);
  while (remaining > 1e-8) {
    const dt = Math.min(.05, remaining), bank = a.bankAngle ?? 0;
    const angle = ((a.targetHeading - a.heading + 540) % 360) - 180;
    if (Math.abs(angle) < 1e-9 && Math.abs(bank) < 1e-9) {a.bankAngle = 0; return;}
    let low = Math.max(-maxBank, bank - DEFAULTS.bankRate * dt), high = Math.min(maxBank, bank + DEFAULTS.bankRate * dt);
    // Older snapshots can start above the new limit; roll back within it smoothly.
    if (low > high) low = high = bank > maxBank ? bank - DEFAULTS.bankRate * dt : bank + DEFAULTS.bankRate * dt;
    const requiredHeading = (next: number) => headingDuringRoll(speed, bank, next, dt) + rolloutHeading(speed, next);
    // Choose the largest reachable bank that can still roll out on the selected
    // heading. A new clearance inside the stopping arc must finish rolling first.
    let next: number;
    if (Math.abs(bank) <= DEFAULTS.bankRate * dt && Math.abs(angle - requiredHeading(0)) < 1e-7) next = 0;
    else if (angle <= requiredHeading(low)) next = low;
    else if (angle >= requiredHeading(high)) next = high;
    else {
      for (let i = 0; i < 24; i++) {const middle = (low + high) / 2; if (requiredHeading(middle) < angle) low = middle; else high = middle;}
      next = (low + high) / 2;
    }
    a.heading = (a.heading + headingDuringRoll(speed, bank, next, dt) + 360) % 360;
    a.bankAngle = next;
    if (next === 0 && Math.abs(((a.targetHeading - a.heading + 540) % 360) - 180) < 1e-7) a.heading = (a.targetHeading + 360) % 360;
    remaining -= dt;
  }
}
