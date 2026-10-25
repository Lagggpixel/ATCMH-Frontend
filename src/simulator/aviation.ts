import {facilityActive} from "./facility-activity";
import {frequenciesFor} from "./airports";
import raw from "./data/aviation.json";
import type {Aircraft, Airport, Frequency, Point, RadarApproach, RadarEnvironment} from "./model";

export interface RadioFacility {id: string; airport?: string; name: string; type: Frequency; mhz: string; lat: number; lon: number; active: boolean; boundary?: unknown}
type Row = {kind: string; icao?: string; airport?: string | null; id?: string; name?: string | null; lat?: number; lon?: number; elevation?: number; type?: string; mhz?: number | string; ils?: number | boolean; glideAngle?: number | null; runwayIndex?: number; endIndex?: number; boundary?: unknown};
const rows = raw.rows as Row[];
const types: Record<string, Frequency | undefined> = {Ground: "ground", Tower: "tower", ATIS: "atis", Approach: "approach", Departure: "departure", Center: "center", Unicom: "unicom"};
export const AVIATION_SOURCE = {name: raw.source, inspected: raw.inspected};
export const facilities: RadioFacility[] = [...new Map(rows.filter(r => r.kind === "frequency" || r.kind === "center").flatMap(r => {
  const type = types[r.type ?? ""], value = Number(r.mhz);
  if (!type || !r.id || !Number.isFinite(value) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return [];
  return [[`${r.id}:${r.airport ?? ""}`, {id: r.id, ...(r.airport ? {airport:r.airport} : {}), name: r.name?.trim() || `${r.airport ?? ""} ${r.type}`, type, mhz: value.toFixed(2), lat:r.lat!, lon:r.lon!, active:true, ...(r.boundary ? {boundary:typeof r.boundary==="string"?JSON.parse(r.boundary):r.boundary} : {})}] as const];
})).values()];
export const facilityName = (f: RadioFacility) => `${f.name} on ${f.mhz}`;
export function destinationCode(a: Pick<Aircraft,"destination">, airport: Airport): string {
  const name = a.destination?.name?.toUpperCase();
  return rows.find(r => r.kind === "airport" && (r.icao === name || r.name?.toUpperCase() === name))?.icao ?? airport.icao;
}
export const localPoint = (airport: Airport, lat: number, lon: number): Point => ({x:(lon-airport.origin.lon)*60*Math.cos(airport.origin.lat*Math.PI/180), y:(lat-airport.origin.lat)*60});
export function insideAirspace(boundary:unknown,lat:number,lon:number){
  if(!Array.isArray(boundary)||boundary.length<3)return false;
  if(boundary.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return false;
  // Unwrap the ring before casting a ray; Pacific FIRs cross the antimeridian.
  let previous = boundary[0][0];
  const ring = boundary.map(p => {const x = previous + ((p[0] - previous + 540) % 360) - 180; previous = x; return [x, p[1]];});
  const center = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  lon += Math.round((center - lon) / 360) * 360;
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>lat)!==(b[1]>lat) && lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export function availableHandoffs(a: Aircraft, airport: Airport, frequency: Frequency, configured = facilities, environment?: RadarEnvironment): RadioFacility[] {
  const target = frequency === "ground" ? "tower" : frequency === "tower" ? "ground" : frequency === "approach" || frequency === "center" ? "unicom" : undefined;
  if (!target) return [];
  const local = configured.find(f => f.type === target && f.airport === airport.icao);
  if (local) return facilityActive(local, environment) ? [{...local, ...(target === "unicom" ? {name: "Traffic"} : {})}] : [];
  const service = frequenciesFor(airport)[target];
  if (!service) return [];
  return [{id: airport.icao + ":" + target, airport: airport.icao, name: target === "unicom" ? "Traffic" : service.name, type: target, mhz: service.value, lat: airport.origin.lat, lon: airport.origin.lon, active: true}];
}
export function environmentWithDestinations(airport:Airport,environment:import("./model").RadarEnvironment,aircraft:readonly Pick<Aircraft,"destination">[]=[]){
  const codes=[...new Set(aircraft.map(a=>destinationCode(a,airport)).filter(code=>code!==airport.icao))];
  const approaches=[...environment.approaches];
  for(const code of codes)for(const p of airportApproaches(airport,code))if(!approaches.some(e=>e.id===p.id))approaches.push(p);
  return {...environment,approaches};
}
/** Equipment flags are from the pinned IF navigation dataset. A missing ILS is
 * never synthesized from the existence of a runway. */
export function airportApproaches(airport: Airport, icao = airport.icao): RadarApproach[] {
  const sourceAirport = rows.find(r=>r.kind === "airport" && r.icao === icao);
  if (!sourceAirport) return [];
  return rows.filter(r=>r.kind === "runway" && r.icao === icao).flatMap(end=> {
    const opposite=rows.find(r=>r.kind === "runway" && r.icao===icao && r.runwayIndex===end.runwayIndex && r.endIndex!==end.endIndex);
    if(!end.id || end.lat==null || end.lon==null || !opposite || opposite.lat==null || opposite.lon==null)return [];
    const runway=end.id.replace(/^(\d)([LRC]?)$/,"0$1$2"), otherRunway=opposite.id?.replace(/^(\d)([LRC]?)$/,"0$1$2");
    const pair=(airport.runways??[airport.runway]).find(p=>p.ends.some(e=>e.id===runway));
    if(icao===airport.icao && !pair)return [];
    const threshold=icao===airport.icao?pair!.ends.find(e=>e.id===runway)!.point:localPoint(airport,end.lat,end.lon), departure=icao===airport.icao?pair!.ends.find(e=>e.id===otherRunway)!.point:localPoint(airport,opposite.lat,opposite.lon);
    const heading=(Math.atan2(departure.x-threshold.x,departure.y-threshold.y)*180/Math.PI+360)%360;
    return (["ils","gps","visual"] as const).filter(type=>type!=="ils" || !!end.ils || end.glideAngle!=null).map(type=>({id:`${icao===airport.icao?"":icao+":"}${type}-${runway}`,type,runway,glideslope:end.glideAngle!=null,finalDistance:type==="ils"?25:15,captureWidth:type==="visual"?.5:.2,glideAngle:end.glideAngle && end.glideAngle>0 ? end.glideAngle:3,missedHeading:heading,airportIcao:icao,airportName:sourceAirport.name ?? icao,elevation:icao===airport.icao?airport.elevation:sourceAirport.elevation ?? 0,threshold,departure}));
  });
}
export function approachOptions(a: Aircraft, airport: Airport, existing: RadarApproach[]) {
  const code=destinationCode(a,airport);
  if(code!==airport.icao)return airportApproaches(airport,code);
  const equipment=airportApproaches(airport);
  return existing.filter(p=>!p.airportIcao || p.airportIcao===code).filter(p=>p.type!=="ils" || equipment.some(e=>e.type==="ils" && e.runway===p.runway));
}

export function freshFacilityEnvironment(airport: Airport, mode: "local" | "approach" | "center", environment: RadarEnvironment): RadarEnvironment {
  const services = mode === "local" ? ["ground", "tower", "atis"] : [mode, "atis"];
  const own = (environment.facilities ?? facilities).filter(f => services.includes(f.type) && (f.airport === airport.icao
    || f.type === "center" && insideAirspace(f.boundary, airport.origin.lat, airport.origin.lon)));
  return {...environment, facilityDefaultActive: environment.facilityDefaultActive ?? false,
    facilityActivity: {...Object.fromEntries([...own.map(f => [f.id, f.active]), ...services.map(type => [`${airport.icao}:${type}`, true])]), ...Object.fromEntries((environment.facilities ?? []).map(f => [f.id, f.active])), ...environment.facilityActivity}};
}
