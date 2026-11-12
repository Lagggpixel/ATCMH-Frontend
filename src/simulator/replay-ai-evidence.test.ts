import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {participantReplay, type ReplaySummary} from "./replays";
import {replayMoments} from "./replay-moments";

test("passive AI evidence uses replay-relative zero time and stays private from trainee playback",()=>{
  const initial=engineFor({trainingStation:"EGPH:approach"}).initialExercise();initial.elapsed=120;initial.aircraft=[];
  const frame={sequence:1,at:0,interpolate:false,delta:{state:{},aircraft:[],ai:[{kind:"intervention" as const,elapsed:120,reason:{code:"trainer" as const,aircraftIds:[],detail:"Trainer took control."}}]}};
  const moments=replayMoments(initial,[frame],initial,0).filter(moment=>moment.kind==="ai");
  assert.deepEqual(moments.map(moment=>({at:moment.at,detail:moment.detail})),[{at:0,detail:"Trainer took control."}]);
  const replay:ReplaySummary={id:"replay",sessionId:"session",title:"Local fixture",ownerId:"owner",startedAt:0,endedAt:0,duration:0,status:"ended",participants:[],kind:"recording",partial:false};
  const projected=participantReplay({replay,initial,frames:[frame],next:null},"trainee");
  assert.equal(replayMoments(initial,projected.frames,initial,0).some(moment=>moment.kind==="ai"),false);
});
