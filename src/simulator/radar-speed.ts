import type {Aircraft, RadarSpeedInstruction} from "./model";

/** Simplified trainer envelopes, not certified performance data. Unknown types
 * retain instructor control rather than assuming an airliner envelope. */
export function aircraftSpeedLimits(type: string): {min: number; max: number; mach?: number} | undefined {
  const id = type.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^(A31[89]|A32[01]|A20N|A21N)$/.test(id)) return {min: 135, max: 340, mach: .82};
  if (/^(B73[0-9]|B3[789]M|B737MAX[789])$/.test(id)) return {min: 135, max: 340, mach: .82};
  if (/^B75[23]$/.test(id)) return {min: 140, max: 350, mach: .86};
  if (/^B76[234]$/.test(id)) return {min: 145, max: 360, mach: .86};
  if (/^(A33[0-9]|A34[0-9]|A35[0-9]|A38[0-9]|B74[0-9]|B77[0-9W]|B78[0-9X])$/.test(id)) return {min: 150, max: 360, mach: .9};
  if (/^(E1[79][05]|E29[05]|CRJ[279]|CRJX)$/.test(id)) return {min: 125, max: 320, mach: .82};
  if (/^(AT[47][25]|DH8[ABCD])$/.test(id)) return {min: 90, max: 275, mach: .6};
  if (/^(C15[02]|C172)$/.test(id)) return {min: 60, max: 160};
  if (/^(C182|SR22)$/.test(id)) return {min: 70, max: 200};
}

export const KNOT_SPEEDS_LOW = Array.from({length: 16}, (_, i) => 100 + i * 10);
export const KNOT_SPEEDS_HIGH = Array.from({length: 15}, (_, i) => 260 + i * 10);
export const MACH_SPEEDS = Array.from({length: 47}, (_, i) => (53 + i) / 100);
export const speedLabel = (unit: "knots" | "mach", value: number) => unit === "mach" ? `Mach ${value.toFixed(2)}` : `${value}kts`;
export function validRadarSpeed(c: RadarSpeedInstruction) {
  if (c.mode === "maintain") return c.until === undefined && ["exact", "minimum", "maximum"].includes(c.relation ?? "") && (c.unit === "knots" ? [...KNOT_SPEEDS_LOW, ...KNOT_SPEEDS_HIGH].includes(c.value!) : c.unit === "mach" && MACH_SPEEDS.includes(c.value!));
  if (c.mode === "approach") return c.unit === undefined && c.relation === undefined && [[160, 4], [170, 5], [180, 6]].some(([speed, miles]) => c.value === speed && c.until === miles);
  return ["discretion", "slowest", "best-forward", "follow", "present"].includes(c.mode) && c.value === undefined && c.unit === undefined && c.relation === undefined && c.until === undefined;
}
/** Simulator conversion to true knots, using standard-atmosphere temperature.
 * The existing motion model treats its single speed as knots, without a wind/IAS model. */
export const machKnots = (mach: number, altitude: number) => mach * 661.4786 * Math.sqrt(Math.max(216.65, 288.15 - .0065 * altitude * .3048) / 288.15);
/** Training profiles in the existing single-speed motion model, not certified V-speeds. */
export function radarPerformance(a: Aircraft) {
  const limits = aircraftSpeedLimits(a.type);
  const light = !!limits && limits.min <= 70, prop = !!limits && limits.min === 90;
  const min = limits?.min ?? 135;
  const max = limits ? a.radar?.station === "center" && a.altitude >= 24000 && limits.mach ? Math.max(limits.max, machKnots(limits.mach, a.altitude)) : limits.max : 600;
  return {min, max, inbound: light ? min === 60 ? 120 : 150 : prop ? 200 : a.radar?.station === "center" ? 450 : 250,
    climb: light ? min === 60 ? 90 : 110 : prop ? 160 : 220, rotation: light ? min : prop ? 100 : Math.max(140, min), landing: min};
}
export function automaticRadarTarget(a: Aircraft, approachDistance?: number) {
  const p = radarPerformance(a), r = a.radar;
  const inbound = a.speedTargets?.inbound ?? r?.inboundSpeed ?? p.inbound;
  let target = inbound;
  if (r?.navigation === "missed") target = a.speedTargets?.["upwind-downwind"] ?? p.climb;
  else if (r?.navigation === "route" && r.routeSpeed !== undefined) target = r.routeSpeed;
  else if (approachDistance !== undefined) {
    const nm = Math.max(0, approachDistance - 1e-8);
    target = nm <= 3 ? a.speedTargets?.vref ?? p.landing : nm <= 5 ? a.speedTargets?.final ?? Math.min(inbound, 160)
      : nm <= 10 ? a.speedTargets?.final ?? Math.min(inbound, 180) : nm <= 15 ? Math.min(inbound, 220) : nm <= 25 ? Math.min(inbound, 250) : inbound;
  } else if (r?.navigation === "route" && a.starDescent) target = a.flightPlan[r.routeIndex]?.speed ?? r.routeSpeed ?? inbound;
  return Math.max(p.min, Math.min(p.max, target));
}
const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const spokenMach = (value: number) => `Mach point ${value.toFixed(2).slice(2).split("").map(digit => digits[Number(digit)]).join(" ")}`;
export function radarSpeedText(a: Aircraft, c: RadarSpeedInstruction) {
  if (c.mode === "maintain") {
    const target = c.unit === "mach" ? machKnots(c.value!, a.altitude) : c.value!;
    const value = c.unit === "mach" ? spokenMach(c.value!) : `${c.value} knots`;
    if (c.relation === "minimum") return `maintain ${value} or greater`;
    if (c.relation === "maximum") return `do not exceed ${value}`;
    return Math.abs(target - a.speed) < .5 ? `maintain ${value}` : `${target > a.speed ? "increase speed to" : "reduce speed to"} ${value}`;
  }
  if (c.mode === "approach") return `maintain ${String(c.value).split("").map(digit => digits[Number(digit)]).join(" ")} knots until ${digits[c.until!]} mile final`;
  return {present: "maintain present speed", discretion: "speed at your discretion", slowest: "maintain slowest practical speed", "best-forward": "maintain best forward speed", follow: "adjust speed to follow aircraft ahead"}[c.mode];
}
export function assignRadarSpeed(a: Aircraft, c: RadarSpeedInstruction) {
  if (c.mode === "present") {if (a.radar) a.radar.speed = {...c}; else a.speedInstruction = {...c}; a.speedMode = "manual"; a.targetSpeed = a.speed; return;}
  if (c.mode === "discretion") {if (a.radar) delete a.radar.speed; else delete a.speedInstruction; a.speedMode = "auto"; a.targetSpeed = a.radar ? automaticRadarTarget(a) : 250; return;}
  if (a.radar) a.radar.speed = {...c}; else a.speedInstruction = {...c}; a.speedMode = "manual"; a.targetSpeed = a.speed;
  updateRadarSpeed(a, []);
}
export function updateRadarSpeed(a: Aircraft, traffic: Aircraft[], finalDistance?: number, automaticTarget = a.targetSpeed) {
  const c = a.radar?.speed ?? a.speedInstruction;
  if (!c) return;
  if (c.mode === "approach" && finalDistance !== undefined && finalDistance <= c.until!) {
    if (a.radar) a.radar.finalSpeedProfile = true;
    if (a.radar) delete a.radar.speed; else delete a.speedInstruction; a.speedMode = "auto"; a.targetSpeed = a.radar ? automaticRadarTarget(a, finalDistance) : finalDistance <= 2 ? 135 : finalDistance <= 5 ? 160 : 180; return;
  }
  if (c.mode === "maintain") {
    const target = c.unit === "mach" ? machKnots(c.value!, a.altitude) : c.value!;
    a.targetSpeed = c.relation === "minimum" ? Math.max(automaticTarget, target) : c.relation === "maximum" ? Math.min(automaticTarget, target) : target;
  } else if (c.mode === "approach") a.targetSpeed = c.value!;
  else if (c.mode === "slowest") a.targetSpeed = a.radar ? radarPerformance(a).min : 135;
  else if (c.mode === "best-forward") a.targetSpeed = a.radar ? Math.min(radarPerformance(a).max, a.radar?.station === "center" ? 450 : 340) : 340;
  else if (c.mode === "follow") {
    const radians = a.heading * Math.PI / 180;
    const ahead = traffic.filter(other => other.id !== a.id && other.active && !["parked", "pushback", "taxi", "lineup", "rollout"].includes(other.mode) && other.frequency === a.frequency && Math.abs(other.altitude - a.altitude) <= 1000 && Math.cos((other.heading - a.heading) * Math.PI / 180) > Math.SQRT1_2).map(other => {
      const dx = other.position.x - a.position.x, dy = other.position.y - a.position.y;
      return {other, along: dx * Math.sin(radians) + dy * Math.cos(radians), lateral: Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians))};
    }).filter(item => item.along > 0 && item.along <= 20 && item.lateral <= 2).sort((a, b) => a.along - b.along)[0];
    const limits = a.radar ? radarPerformance(a) : {min: 135, max: 340};
    a.targetSpeed = Math.max(limits.min, Math.min(limits.max, ahead ? ahead.other.speed + (ahead.along - 3) * 10 : automaticTarget));
  }
}
