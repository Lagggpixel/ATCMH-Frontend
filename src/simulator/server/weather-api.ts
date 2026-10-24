import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";
import {fetchWeatherReport} from "./weather-provider";
export {fetchWeatherReport, type WeatherReport} from "./weather-provider";

export function createWeatherApi(load=fetchWeatherReport,authorize=authorizeSessionRequest){return async(request:Request)=>{
  try{await authorize(request,false);const airport=new URL(request.url).searchParams.get("airport")?.toUpperCase()??"";if(!/^[A-Z0-9]{4}$/.test(airport))throw new SessionError("invalid-airport","Enter a four-character ICAO code.",400);return Response.json(await load(airport),{headers:{"cache-control":"private, no-store"}});}catch(error){return sessionFailure(error);}
};}
export const weatherApi=createWeatherApi();
