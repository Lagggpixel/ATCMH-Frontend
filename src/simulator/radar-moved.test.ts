import assert from "node:assert/strict";
import test from "node:test";
import {isRadarStation, rejectMovedRadar} from "./server/radar-moved";
import {TrainingService} from "./server/training-service";
import {blankScenario} from "./scenarios";
test("ATCMH retains Ground and Tower and rejects moved radar modes on the server", async () => {
  for (const station of [undefined, "EGPH:local", "EGPH:ground", "EGPH:tower"]) {assert.equal(isRadarStation(station),false); assert.doesNotThrow(()=>rejectMovedRadar({trainingStation:station}));}
  for (const station of ["EGPH:approach","KDAL:center"]) {
    assert.throws(()=>rejectMovedRadar({trainingStation:station}),{code:"radar-moved",status:410});
    await assert.rejects(new TrainingService().save({accountId:"test",staff:true},blankScenario({airport:station.slice(0,4),trainingStation:station})),{code:"radar-moved",status:410});
  }
});
