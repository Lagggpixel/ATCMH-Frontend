import {facilityActive} from "./facility-activity";
import {facilities, insideAirspace, localPoint, type RadioFacility} from "./aviation";
import type {Airport, Point, RadarEnvironment} from "./model";

export function projectAirspaces(airport: Airport, configured?: readonly RadioFacility[], source = facilities) {
  const merged = new Map(source.map(facility => [facility.id, facility]));
  for (const facility of configured ?? []) merged.set(facility.id, {...merged.get(facility.id), ...facility, boundary: facility.boundary ?? merged.get(facility.id)?.boundary});
  return [...merged.values()].flatMap(facility => {
    const boundary = facility.boundary;
    if (!Array.isArray(boundary) || boundary.length < 3 || boundary.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return [];
    // Project each edge on its shortest longitude arc, choosing the world copy
    // nearest the airport. This also handles the final edge of polar rings.
    const segments = boundary.map(([lon, lat]: number[], index: number) => {
      const [nextLon, nextLat] = boundary[(index + 1) % boundary.length];
      const delta = ((nextLon - lon + 540) % 360) - 180;
      const shift = 360 * Math.round((airport.origin.lon - (lon + delta / 2)) / 360);
      return [localPoint(airport, lat, lon + shift), localPoint(airport, nextLat, lon + delta + shift)];
    });
    const points = segments.flat();
    return [{id: facility.id, boundary, segments, active: configured ? configured.some(item => item.id === facility.id && item.active) : facility.active,
      left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y))}];
  });
}
export type ScopeAirspace = ReturnType<typeof projectAirspaces>[number];

/** IF renders active/selected boundaries independently of HideAirspaces. */
export function airspaceOutlines(airspaces: readonly ScopeAirspace[], showOrdinary: boolean, selected: readonly string[], activity?: RadarEnvironment["facilityActivity"], defaultActive?: boolean) {
  return airspaces.flatMap(airspace => {
    const highlighted = facilityActive({id: airspace.id, type: "center", active: airspace.active}, {facilityActivity: activity, facilityDefaultActive: defaultActive}) || selected.includes(airspace.id);
    return showOrdinary || highlighted ? [{...airspace, width: highlighted ? 3 : 1}] : [];
  });
}

export function hitAirspaces(airspaces: readonly ScopeAirspace[], airport: Airport, point: Point, enabled: boolean) {
  if (!enabled) return [];
  const lat = airport.origin.lat + point.y / 60, lon = airport.origin.lon + point.x / (60 * Math.cos(airport.origin.lat * Math.PI / 180));
  return airspaces.filter(airspace => insideAirspace(airspace.boundary, lat, lon)).map(airspace => airspace.id);
}
