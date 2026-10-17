import type {Aircraft} from "./model";

/** Predictions supply smooth positions, but only the saved frame decides whom to follow. */
export function scopeFollowTarget(snapshot: Aircraft[], rendered: Aircraft[], selected: string | null, resolve: (aircraft: Aircraft, traffic: Aircraft[]) => Aircraft | undefined) {
  const source = snapshot.find(a => a.id === selected);
  const target = source && resolve(source, snapshot);
  return target ? rendered.find(a => a.id === target.id) ?? target : undefined;
}
