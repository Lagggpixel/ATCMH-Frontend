import raw from "./data/aviation.json";
import type {Aircraft, Airport, Frequency, Point, RadarApproach} from "./model";

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
  let inside=false;
  for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){
    const a=boundary[i],b=boundary[j];if(!Array.isArray(a)||!Array.isArray(b))return false;
    if((a[1]>lat)!==(b[1]>lat) && lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export function availableHandoffs(a: Aircraft, airport: Airport, frequency: Frequency, configured = facilities): RadioFacility[] {
  const point = {lat:airport.origin.lat+a.position.y/60,lon:airport.origin.lon+a.position.x/(60*Math.cos(airport.origin.lat*Math.PI/180))};
  const destination = destinationCode(a,airport);
  const allowed = frequency === "ground" ? ["ground","tower"] : frequency === "center" ? ["ground","tower","departure","approach","center","unicom"] : ["tower","departure","approach","center","unicom",...(frequency === "tower" ? ["ground"] : [])];
  return configured.filter(f => f.active && allowed.includes(f.type) && (a.facilityId ? f.id !== a.facilityId : !(f.type === a.frequency && f.airport === airport.icao)) && (
    f.type === "tower" && f.airport === destination || f.type === "unicom" && f.airport === destination ||
    (f.type === "center" && f.boundary ? insideAirspace(f.boundary,point.lat,point.lon) : Math.hypot((f.lat-point.lat)*60,(f.lon-point.lon)*60*Math.cos(point.lat*Math.PI/180)) <= (f.type === "ground" ? 10000/1852 : f.type === "tower" ? 50000/1852 : f.type === "center" ? 250 : 125000/1852))
  )).filter((f,index,all)=>all.findIndex(other=>other.id===f.id)===index);
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
