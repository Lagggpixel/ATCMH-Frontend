import assert from "node:assert/strict";
import test from "node:test";
import {createWeatherApi,fetchWeatherReport} from "./server/weather-api";
test("weather endpoint authorizes, validates ICAO and returns private cache policy",async()=>{
 let authorized=false;const api=createWeatherApi(async airport=>({airport,fetchedAt:"2026-10-23T20:00:00Z",atis:[],warnings:[]}),async()=>{authorized=true;return {accountId:"qa",staff:true};});
 const response=await api(new Request("https://local/api/simulator/weather?airport=egph"));assert.equal(response.status,200);assert.equal(authorized,true);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal((await response.json()).airport,"EGPH");
 assert.equal((await api(new Request("https://local/api/simulator/weather?airport=https://example.com"))).status,400);
});
test("public observations and D-ATIS retain complete text; unavailable reports do not fabricate conditions",async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input)=>{calls++;return Response.json(String(input).includes("aviationweather.gov")?[{icaoId:"KJFK",obsTime:1792783200,rawOb:"KJFK 232000Z 18015G25KT 10SM FEW025 16/10 A2992",wdir:180,wspd:15,wgst:25,visib:"10+",altim:1013.2,temp:16,dewp:10}]:[{airport:"KJFK",type:"combined",code:"B",datis:"FULL ORIGINAL ATIS. NOTAM AND RUNWAY DETAILS.",updatedAt:"2026-10-23T20:00:00Z"}]);};
 try{const report=await fetchWeatherReport("KJFK");assert.equal(report.weather?.windGust,25);assert.equal(report.weather?.temperature,16);assert.equal(report.atis[0].datis,"FULL ORIGINAL ATIS. NOTAM AND RUNWAY DETAILS.");await fetchWeatherReport("KJFK");assert.equal(calls,2,"cached providers are not polled per render");
 globalThis.fetch=async()=>new Response(null,{status:503});const unavailable=await fetchWeatherReport("ZZZZ");assert.equal(unavailable.weather,undefined);assert.equal(unavailable.atis.length,0);assert.equal(unavailable.warnings.length,2);
 }finally{globalThis.fetch=original;}
});
