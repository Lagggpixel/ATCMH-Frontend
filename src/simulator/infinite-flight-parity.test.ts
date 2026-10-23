import assert from "node:assert/strict";
import test from "node:test";
import {engineFor,applyEnvelope,advance} from "./engine";
import {catalogFor} from "./catalog";
import {getAirport,simulatedMetar} from "./airports";
import {controllerAircraft} from "./controller-state";
import {radarFlightLabel,radarEnvironmentFor} from "./radar";
import {availableHandoffs,airportApproaches,approachOptions,environmentWithDestinations,insideAirspace} from "./aviation";
import {AIRCRAFT_PERFORMANCE,climbRate,flightVelocity} from "./aircraft-performance";
import {aircraftColor,type Action,type Exercise} from "./model";
import {exerciseSchema} from "./protocol";
import {radarSeparationAlerts} from "./radar-safety";
import {createLocalAircraft} from "./local-aircraft";
import {createSpawnAircraft} from "./spawn-aircraft";
const act=(state:Exercise,action:Action)=>{const r=applyEnvelope(state,{id:crypto.randomUUID(),time:0,action});assert.equal(r.error,undefined);return r.state;};
const fixture=()=>engineFor({trainingStation:"EGPH:approach"}).initialExercise();
test("sending updates controller assignments before pilot movement and survives JSON",()=>{
 let state=fixture();state.autoReadback=false;const a=state.aircraft[0],heading=a.targetHeading;
 state=act(state,{kind:"command",aircraftId:a.id,frequency:"approach",text:"",command:{type:"vector",heading:90,altitude:{unit:"feet",value:6000}}});
 assert.equal(state.aircraft[0].targetHeading,heading);assert.equal(state.aircraft[0].radar?.targetAltitude,undefined);
 assert.equal(state.aircraft[0].assigned?.altitude?.value,6000);assert.match(radarFlightLabel(state.aircraft[0],getAirport(state),state.radarEnvironment).flight,/60/);
 state=exerciseSchema.parse(JSON.parse(JSON.stringify(state)));assert.equal(controllerAircraft(state.aircraft[0]).radar?.targetAltitude?.value,6000);
});
test("cancelling expected approach persists a null controller assignment",()=>{
 let state=fixture();const a=state.aircraft[0],p=state.radarEnvironment!.approaches[0];
 state=act(state,{kind:"maneuver",aircraftId:a.id,command:{type:"expect-approach",approachId:p.id}});
 state=act(state,{kind:"command",aircraftId:a.id,frequency:"approach",text:"",command:{type:"expect-approach",approachId:null,vectors:true,runway:"24"}});
 const restored=exerciseSchema.parse(JSON.parse(JSON.stringify(state)));assert.equal(restored.aircraft[0].radar?.expected,p.id);assert.equal(controllerAircraft(restored.aircraft[0]).radar?.expected,undefined);assert.match(radarFlightLabel(restored.aircraft[0],getAirport(),restored.radarEnvironment).approach!,/^RV/);
});
test("airborne takeoff gets airborne Tower menu and label fill never changes symbol color",()=>{
 const e=engineFor(),a=e.newAircraft("a",false);a.mode="takeoff";a.altitude=getAirport().elevation+100;a.frequency="tower";
 const menu=catalogFor().messageMenu("tower",a);assert.ok(menu.some(m=>m.label==="Cleared to Land / for the Option"));assert.ok(!menu.some(m=>m.label==="Cleared for Takeoff"));
 const color=aircraftColor(a,"tower");a.color="#fc473a";assert.equal(aircraftColor(a,"tower"),color);assert.equal(color,"#87cefa");
});
test("handoffs follow geography, equipment destinations and active facilities",()=>{
 const a=fixture().aircraft[0],airport=getAirport();a.position={x:0,y:0};
 const facilities=[{id:"near",name:"Near Approach",type:"approach" as const,mhz:"123.45",lat:airport.origin.lat,lon:airport.origin.lon,active:true},{id:"far",name:"Far Approach",type:"approach" as const,mhz:"124.45",lat:0,lon:0,active:true},{id:"closed",name:"Closed Tower",type:"tower" as const,mhz:"118.00",lat:airport.origin.lat,lon:airport.origin.lon,active:false}];
 assert.deepEqual(availableHandoffs(a,airport,"center",facilities).map(f=>f.id),["near"]);
 assert.equal(insideAirspace([[-4,55],[-2,55],[-2,57],[-4,57]],56,-3),true);
 const ase=getAirport({airport:"KASE"});assert.deepEqual(airportApproaches(ase).filter(p=>p.type==="ils").map(p=>p.runway),["15"]);assert.ok(!airportApproaches(getAirport({airport:"VNLK"})).some(p=>p.type==="ils"));
 a.destination={name:"EGLL",point:{x:0,y:0}};const p=approachOptions(a,airport,radarEnvironmentFor(airport).approaches);assert.ok(p.length);assert.ok(p.every(p=>p.airportIcao==="EGLL"));
 const env=environmentWithDestinations(airport,radarEnvironmentFor(airport),[a]);assert.ok(p.every(p=>env.approaches.some(e=>e.id===p.id)));
});
test("context replies keep registration order and STAR visibility needs only a STAR",()=>{
 const state=fixture(),a=state.aircraft[0];a.arrivalProcedure="OCK1F";
 const catalog=catalogFor(getAirport(),state.radarEnvironment),request={id:"check",aircraftId:a.id,time:0,frequency:"approach" as const,sender:"pilot" as const,text:"Scottish Approach, Speedbird, with you at 5,000ft",request:{id:"check-in" as const,runway:"24"}};
 const menu=catalog.requestMessageMenu("approach",a,request);assert.equal(menu[0].label,"Vectoring Instructions");assert.equal(menu.find(m=>m.label==="Radar Contact")?.suggested,true);assert.equal(menu.filter(m=>m.label==="Radar Contact").length,1);assert.ok(menu.some(m=>m.label.includes("OCK1F STAR")));
});
test("Tower inbound call retains choices, ATIS, position and landing intention",()=>{
 const a=engineFor().newAircraft("a",true),state=engineFor().initialExercise();state.publishedDraft={...state.atis,letter:"BRAVO"};
 const c=catalogFor(),request=c.resolvePilotRequest({requestId:"inbound-option"})!;
 assert.match(c.pilotRequestText(a,request,"24",false,{exercise:state}),/is .* miles to the .* inbound for Touch and Go with information BRAVO/);
 assert.match(c.pilotRequestText(a,request,"24",false,{inbound:"ils",exercise:state}),/inbound on the ILS for Touch and Go Runway 24 with information BRAVO/);
 assert.match(c.pilotRequestText(a,request,"24",false,{inbound:"runway",exercise:state}),/requesting Runway 24$/);
});
test("IFR check-in rounds feet, addresses facility and includes arrival state",()=>{
 const state=fixture(),a=state.aircraft[0];a.altitude=30049;a.arrivalProcedure="OCK1F";
 const c=catalogFor(),r=c.resolvePilotRequest({requestId:"check-in"})!;assert.match(c.pilotRequestText(a,r,"24"),/Approach, .*with you at 30,000ft, descending via OCK1F arrival$/);
});
test("fuel requests require actual airborne fuel state, flight time and confirmation",()=>{
 let state=fixture();state.autoReadback=false;const a=state.aircraft[0];a.fuel={state:"minimum",enduranceMinutes:23};const c=catalogFor();
 assert.ok(!c.pilotRequests(a).some(r=>r.id==="minimum-fuel"));a.flightSeconds=60;assert.ok(c.pilotRequests(a).some(r=>r.id==="minimum-fuel"));
 const action:Action={kind:"pilot",aircraftId:a.id,text:"",request:{id:"minimum-fuel",runway:"24"}};
 assert.match(applyEnvelope(state,{id:"unconfirmed",time:0,action}).error!,/Confirm/);
 state=act(state,{...action,request:{...action.request!,confirmed:true}});assert.match(state.messages.at(-1)!.text,/Minimum Fuel, 23 minutes remaining\./);assert.equal(state.aircraft[0].fuel?.declared,"minimum");
 state.running=true;state=advance(state,5);assert.ok(state.aircraft[0].fuel!.enduranceMinutes<23);assert.equal(a.fuel.enduranceMinutes,23);
});
test("public weather is stored and drives generated ATIS and command winds",()=>{
 let state=fixture();const weather={windDirection:180,windSpeed:25,visibilityKm:8,qnh:1015,temperature:12,reference:"Test observation"};state=act(state,{kind:"weather",weather});state=act(state,{kind:"publish-atis"});
 assert.match(state.publishedAtis,/Wind 180 degrees at 25 knots/);assert.deepEqual(exerciseSchema.parse(JSON.parse(JSON.stringify(state))).weather,weather);
 assert.match(simulatedMetar(getAirport(),weather),/Wind 180° at 25KT/);
 const text=catalogFor(getAirport(),state.radarEnvironment,state.weather).instructionText(state.aircraft[0],{type:"land",runway:"24"});assert.match(text,/wind 180 at 25/);
 state=act(state,{kind:"atis",draft:{...state.atis,publicText:"FULL PUBLIC ATIS TEST",publicSource:"https://atis.info/api/KJFK"}});state=act(state,{kind:"publish-atis"});assert.equal(state.publishedAtis,"FULL PUBLIC ATIS TEST");
});

test("a hold freezes the selected waypoint before route changes and pilot readback",()=>{
 let state=fixture();state.autoReadback=false;const a=state.aircraft[0];
 a.flightPlan=[{x:1,y:1,name:"FIRST"},{x:12,y:-8,name:"SECOND",waypointType:"VOR"}];
 state=act(state,{kind:"command",aircraftId:a.id,frequency:"approach",text:"",command:{type:"atc",action:"hold",index:1,hand:"left",altitude:{unit:"feet",value:3000}}});
 const sent=state.messages.at(-1)!;
 assert.equal(sent.instruction?.type,"atc");
 if(sent.instruction?.type!=="atc")throw new Error("Expected hold instruction");
 assert.equal(sent.instruction.name,"SECOND");assert.equal(sent.instruction.waypointType,"VOR");
 assert.match(catalogFor(getAirport(state),state.radarEnvironment).instructionText(state.aircraft[0],sent.instruction),/SECOND VOR/);
 const wire=exerciseSchema.parse(JSON.parse(JSON.stringify(state)));assert.equal((wire.messages.at(-1)!.instruction as typeof sent.instruction).waypointType,"VOR");
 assert.deepEqual(sent.instruction.point,{x:12,y:-8});
 state=act(state,{kind:"edit",aircraftId:a.id,patch:{flightPlan:[{x:25,y:25,name:"REPLACED"}]}});
 state=act(state,{kind:"pilot",aircraftId:a.id,text:`Wilco, ${a.callsign}`,replyTo:sent.id,assign:true});
 assert.deepEqual(state.aircraft[0].atcManeuver?.center,{x:12,y:-8});assert.equal(state.aircraft[0].atcManeuver?.fixName,"SECOND");
});

test("Unicom options and visibility follow airborne and ground calls",()=>{
 const engine=engineFor(),a=engine.newAircraft("unicom",true),c=catalogFor();a.frequency="unicom";
 const available=c.pilotRequests(a).map(r=>r.id);assert.ok(available.includes("unicom-inbound"));assert.ok(!available.includes("unicom-taxi"));
 const inbound=c.resolvePilotRequest({requestId:"unicom-inbound"})!;
 assert.match(c.pilotRequestText(a,inbound,"24",false,{entry:"Left Traffic",outcome:"touch-and-go"}),/inbound for Touch and Goes, will make Left Traffic for Runway 24$/);
 a.altitude=getAirport().elevation;a.mode="taxi";
 assert.ok(c.pilotRequests(a).some(r=>r.id==="unicom-takeoff"));assert.ok(!c.pilotRequests(a).some(r=>r.id==="unicom-inbound"));
 const takeoff=c.resolvePilotRequest({requestId:"unicom-takeoff"})!;
 assert.match(c.pilotRequestText(a,takeoff,"24",false,{takeoffDirection:"Straight Out"}),/is taking off Runway 24, Departing Straight Out$/);
 assert.match(c.pilotRequestText(a,takeoff,"24",true),/Remaining in the Pattern$/);
});
test("seven stored performance profiles cover piston, turboprop and jet schedules",()=>{
 assert.equal(AIRCRAFT_PERFORMANCE.length,7);assert.deepEqual([...new Set(AIRCRAFT_PERFORMANCE.map(p=>p.propulsion))],["piston","turboprop","jet"]);
 const a=fixture().aircraft[0];a.performanceProfile="C172";a.altitude=1000;assert.equal(climbRate(a),730);a.performanceProfile="A320";assert.equal(climbRate(a),2500);a.altitude=41000;assert.equal(climbRate(a),0);
 a.altitude=15000;a.heading=90;a.speed=200;const calm=flightVelocity(a),wind=flightVelocity(a,{windDirection:90,windSpeed:20,visibilityKm:10,qnh:1013.25,reference:"test"});assert.ok(calm.x>200);assert.ok(Math.abs(calm.x-wind.x-20)<.001);
 const local=createLocalAircraft({},"c172",{placement:"custom",callsign:"Test 123",type:"C172",runway:"24",distance:5,leg:"final",hand:"left",height:1500,speed:100,heading:90,landing:"full-stop",flight:"departure",frequency:"tower"});assert.equal(local.performanceProfile,"C172");
 const spawn=createSpawnAircraft(fixture(),"tbm",{airborne:true,type:"TBM9",callsign:"Test 930",landing:"full-stop",altitude:5000,speed:180});assert.equal(spawn.performanceProfile,"TBM9");
});
test("proximity predicts converging airborne traffic and does not exempt approaches",()=>{
 const a=fixture().aircraft[0],b=structuredClone(a);a.position={x:-3,y:0};b.position={x:3,y:0};a.heading=90;b.heading=270;a.speed=b.speed=360;a.altitude=b.altitude=5000;b.id="b";
 assert.equal(radarSeparationAlerts([a,b]).get(a.id)?.[0].level,"critical");a.radar!.navigation=b.radar!.navigation="approach";a.radar!.cleared=b.radar!.cleared="ils-24";assert.equal(radarSeparationAlerts([a,b]).size,2);
 b.position={x:3,y:3};b.heading=90;assert.equal(radarSeparationAlerts([a,b]).size,0);
});
