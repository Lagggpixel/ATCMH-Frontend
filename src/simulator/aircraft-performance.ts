import type {Aircraft, ExerciseWeather} from "./model";

export interface AircraftPerformance {
  id: NonNullable<Aircraft["performanceProfile"]>; name: string; propulsion: "piston" | "turboprop" | "jet";
  min: number; max: number; mach?: number; ceiling: number; rotation: number; landing: number;
  inbound: number; climbSpeed: number; cruise: number; cruiseMach?: number;
  climb: [number, number, number, number]; descent: number; acceleration: number;
  source: string; assumptions: string;
}
const euro = (id: string) => `https://contentzone.eurocontrol.int/aircraftperformance/details.aspx?ICAO=${id}&ICAOFilter=${id}`;
/** Indicative reference profiles at typical weight. Rotation, acceleration and
 * unsourced descent schedules are explicit training assumptions, not V-speeds
 * computed for a particular aircraft mass/configuration. Legacy snapshots keep
 * their existing motion until a trainer selects a profile. */
export const AIRCRAFT_PERFORMANCE: readonly AircraftPerformance[] = [
  {id:"C172",name:"Cessna 172 Skyhawk",propulsion:"piston",min:48,max:163,ceiling:14000,rotation:55,landing:65,inbound:110,climbSpeed:76,cruise:124,climb:[730,500,250,100],descent:500,acceleration:1.5,source:"https://cessna.txtav.com/en/piston/cessna-skyhawk",assumptions:"Typical training rotation/final speeds, descent and acceleration; published 730 fpm sea-level climb tapers with altitude."},
  {id:"C208",name:"Cessna 208 Caravan",propulsion:"turboprop",min:75,max:175,ceiling:26000,rotation:80,landing:75,inbound:120,climbSpeed:115,cruise:160,climb:[800,500,500,300],descent:500,acceleration:1.8,source:euro("C208"),assumptions:"Rotation 5 kt below published V2; acceleration and 175 KIAS limit are trainer assumptions."},
  {id:"TBM9",name:"Daher TBM 930",propulsion:"turboprop",min:85,max:266,mach:.52,ceiling:31000,rotation:90,landing:90,inbound:200,climbSpeed:124,cruise:252,cruiseMach:.50,climb:[2000,1700,1400,1000],descent:1500,acceleration:2,source:"https://infiniteflight.com/fleet/tbm-930",assumptions:"Rotation/VY based on TBM930 pilot information manual; phase rates, final speed and acceleration are typical training assumptions."},
  {id:"DH8D",name:"Dash 8 Q400",propulsion:"turboprop",min:110,max:286,ceiling:25000,rotation:110,landing:121,inbound:245,climbSpeed:150,cruise:360,climb:[3500,1500,1200,800],descent:1500,acceleration:2,source:euro("DH8D"),assumptions:"Rotation 5 kt below published V2; acceleration and 286 KIAS limit are trainer assumptions."},
  {id:"A320",name:"Airbus A320-200",propulsion:"jet",min:130,max:350,mach:.82,ceiling:41000,rotation:140,landing:137,inbound:250,climbSpeed:175,cruise:450,cruiseMach:.78,climb:[2500,2000,1400,1000],descent:1500,acceleration:2.5,source:euro("A320"),assumptions:"Rotation 5 kt below published V2; generic acceleration; IF fleet supplies FL410 ceiling/MMO .82."},
  {id:"B738",name:"Boeing 737-800",propulsion:"jet",min:135,max:340,mach:.82,ceiling:41000,rotation:140,landing:147,inbound:250,climbSpeed:165,cruise:460,cruiseMach:.79,climb:[3000,2000,2000,1500],descent:1500,acceleration:2.4,source:"https://indigo-sustainableaviation.eu/wp-content/uploads/2025/02/INDIGO_Preliminary-D4.1.pdf",assumptions:"Indicative EUROCONTROL profile reproduced in INDIGO D4.1; rotation 5 kt below V2 and acceleration are trainer assumptions."},
  {id:"B77W",name:"Boeing 777-300ER",propulsion:"jet",min:145,max:330,mach:.89,ceiling:43000,rotation:163,landing:149,inbound:240,climbSpeed:200,cruise:490,cruiseMach:.84,climb:[3000,2500,2000,1500],descent:1500,acceleration:2,source:euro("B77W"),assumptions:"Rotation 5 kt below published V2; acceleration and operating limits are trainer assumptions."},
];
export const performanceFor = (a: Pick<Aircraft,"performanceProfile">) => AIRCRAFT_PERFORMANCE.find(p=>p.id===a.performanceProfile);
export const profileForType = (type: string) => AIRCRAFT_PERFORMANCE.find(p=>p.id===type.toUpperCase().replace(/[^A-Z0-9]/g,""))?.id;
export function climbRate(a: Aircraft) {const p=performanceFor(a);return p ? p.climb[a.altitude<5000?0:a.altitude<15000?1:a.altitude<24000?2:3]*Math.max(0,Math.min(1,(p.ceiling-a.altitude)/2000)) : 2000;}
export const descentRate = (a: Aircraft) => performanceFor(a)?.descent ?? 1500;
export const acceleration = (a: Aircraft) => performanceFor(a)?.acceleration ?? 3;
export const rotationSpeed = (a: Aircraft) => performanceFor(a)?.rotation ?? 140;
export const airTemperatureKelvin = (altitude: number, weather?: Pick<ExerciseWeather, "temperature">) => Math.max(216.65, (weather?.temperature === undefined ? 288.15 : weather.temperature + 273.15) - .0065 * altitude * .3048);
export function densityRatio(altitude: number, temperature?: number, qnh=1013.25) {
  const pressureAltitude=Math.max(-2000,altitude+(1013.25-qnh)*27), temperatureIsa=Math.max(216.65,288.15-.0065*pressureAltitude*.3048);
  const actual=temperature===undefined?temperatureIsa:airTemperatureKelvin(altitude, {temperature});
  return Math.max(.1,(Math.max(.05,1-.00000687535*pressureAltitude)**5.2561)*288.15/actual);
}
export const trueAirspeed = (ias: number,altitude: number,weather?: ExerciseWeather) => ias/Math.sqrt(densityRatio(altitude,weather?.temperature,weather?.qnh));
export function headingForGroundTrack(track: number, a: Aircraft, weather?: ExerciseWeather) {
  const crosswind = (weather?.windSpeed ?? 0) * Math.sin(((weather?.windDirection ?? 0) - track) * Math.PI / 180);
  return (track + Math.asin(Math.max(-.95, Math.min(.95, crosswind / Math.max(1, trueAirspeed(a.speed, a.altitude, weather))))) * 180 / Math.PI + 360) % 360;
}
export function flightVelocity(a: Aircraft, weather?: ExerciseWeather) {
  const tas = trueAirspeed(a.speed,a.altitude,weather), h=a.heading*Math.PI/180;
  const w=(weather?.windDirection ?? 0)*Math.PI/180, wind=weather?.windSpeed ?? 0;
  return {x:tas*Math.sin(h)-wind*Math.sin(w),y:tas*Math.cos(h)-wind*Math.cos(w)};
}
export function advancePerformance(a: Aircraft, previous: {x:number;y:number;altitude:number},dt:number,weather?: ExerciseWeather) {
  a.verticalSpeed=(a.altitude-previous.altitude)/dt*60;
  if(["parked","pushback","taxi","lineup","rollout"].includes(a.mode)){a.groundSpeed=a.speed; a.track=a.heading; return;}
  const velocity=flightVelocity(a,weather), h=a.heading*Math.PI/180;
  // Motion guidance already advanced IAS along heading; apply only TAS/wind delta.
  a.position.x+=(velocity.x-a.speed*Math.sin(h))*dt/3600;
  a.position.y+=(velocity.y-a.speed*Math.cos(h))*dt/3600;
  a.groundSpeed=Math.hypot(velocity.x,velocity.y); a.track=(Math.atan2(velocity.x,velocity.y)*180/Math.PI+360)%360;
}
