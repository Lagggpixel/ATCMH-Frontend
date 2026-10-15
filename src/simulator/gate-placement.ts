import type {Airport, Point} from "./model";
import {gatesFor, isGroundSpawn, normalizeScenarioAircraft, standPlacement, type ScenarioDefinition} from "./scenarios";

export interface GateTarget {id: string; label: string; point: Point}

export function gateTargets(airport: Airport): GateTarget[] {
  return gatesFor(airport).map(gate => ({id: gate.id, label: `Gate ${gate.name || gate.id}`, point: standPlacement(gate.id, false, airport)!.position}));
}

/** Only snap within the visible target radius; releasing elsewhere cancels placement. */
export function gateAtPoint(gates: readonly GateTarget[], point: Point, radius: number) {
  let nearest: GateTarget | undefined, closest = radius;
  for (const gate of gates) {
    const distance = Math.hypot(gate.point.x - point.x, gate.point.y - point.y);
    if (distance <= closest) {nearest = gate; closest = distance;}
  }
  return nearest;
}

export function placeAircraftAtGate(spec: ScenarioDefinition["aircraft"][number], gateId: string, airport: Airport) {
  if (!isGroundSpawn(spec.seed, airport) || !gatesFor(airport).some(gate => gate.id === gateId)) return spec;
  if (spec.gateId === gateId) return spec;
  const placement = standPlacement(gateId, false, airport)!;
  return normalizeScenarioAircraft({...spec, gateId, seed: {...spec.seed, ...placement, targetHeading: placement.heading, taxiPath: []}}, airport);
}
