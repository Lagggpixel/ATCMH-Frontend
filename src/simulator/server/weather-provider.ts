import {z} from "zod";
import {SessionError} from "../sessions";
import {weatherSchema} from "../protocol";

const metar = z.object({icaoId:z.string(), obsTime:z.number(), rawOb:z.string(), wdir:z.union([z.number(),z.string()]).nullable(), wspd:z.number().nullable(), wgst:z.number().nullable().optional(), visib:z.union([z.string(),z.number()]).nullable(), altim:z.number().nullable(), temp:z.number().nullable(), dewp:z.number().nullable()});
const datis = z.object({airport:z.string(), type:z.string(), code:z.string(), datis:z.string().max(12000), updatedAt:z.string()});
const cache = new Map<string,{until:number; data:Promise<WeatherReport>}>();
export interface WeatherReport {airport:string; fetchedAt:string; weather?:z.infer<typeof weatherSchema>; atis:z.infer<typeof datis>[]; warnings:string[]}
async function readJson(url:string, timeoutMs = 12000) {
  const response=await fetch(url,{headers:{"user-agent":"ATCMH-Simulator/1.0 (training weather)"},signal:AbortSignal.timeout(timeoutMs),redirect:"error",cache:"no-store"});
  if(response.status===204)return [];
  if(!response.ok || Number(response.headers.get("content-length")??0)>200000)throw new Error("Unavailable");
  const body=await response.text(); if(body.length>200000)throw new Error("Oversize response"); return JSON.parse(body);
}
export function fetchWeatherReport(airport:string, fresh = false, weatherOnly = false):Promise<WeatherReport> {
  if(!/^[A-Z0-9]{4}$/.test(airport))throw new SessionError("invalid-airport","Enter a four-character ICAO code.",400);
  const key = `${airport}:${weatherOnly ? "weather" : "all"}`;
  const cached=cache.get(key); if(!fresh && cached && cached.until>Date.now())return cached.data;
  const data=(async()=>{
    const [observations,broadcasts]=await Promise.allSettled([readJson(`https://aviationweather.gov/api/data/metar?ids=${airport}&format=json`,fresh ? 5000 : 12000),weatherOnly ? Promise.resolve([]) : readJson(`https://atis.info/api/${airport}`,fresh ? 5000 : 12000)]);
    const report:WeatherReport={airport,fetchedAt:new Date().toISOString(),atis:[],warnings:[]};
    if(observations.status==="fulfilled"){
      const parsed=z.array(metar).safeParse(observations.value); const m=parsed.success?parsed.data.find(m=>m.icaoId===airport):undefined;
      if(m && m.altim!=null && m.wspd!=null && m.visib!=null){
        const visibility=Number(String(m.visib).replace(/[+>]/g,""))*1.609344;
        const weather=weatherSchema.safeParse({windDirection:typeof m.wdir==="number"?m.wdir:0,variableWind:typeof m.wdir!=="number",windSpeed:m.wspd,...(m.wgst!=null?{windGust:m.wgst}:{}),visibilityKm:visibility,qnh:m.altim,...(m.temp!=null?{temperature:m.temp}:{}),...(m.dewp!=null?{dewpoint:m.dewp}:{}),observedAt:new Date(m.obsTime*1000).toISOString(),reference:`${airport} observation · ${new Date(m.obsTime*1000).toISOString()}`,rawMetar:m.rawOb,source:"https://aviationweather.gov/data/metar/"});
        if(weather.success)report.weather=weather.data;
      }
    }
    if(!report.weather)report.warnings.push("No usable METAR available. Existing exercise weather is retained.");
    if(broadcasts.status==="fulfilled") {const parsed=z.array(datis).safeParse(broadcasts.value); if(parsed.success)report.atis=parsed.data.filter(a=>a.airport===airport);}
    if(!weatherOnly && !report.atis.length)report.warnings.push("Public D-ATIS is unavailable at this airport. You can publish ATIS from the weather observation and selected runways.");
    if(report.weather && Date.now()-Date.parse(report.weather.observedAt!)>2*3600000)report.warnings.push("This weather observation is more than two hours old.");
    return report;
  })();
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(key,{until:Date.now()+300000,data});return data;
}
