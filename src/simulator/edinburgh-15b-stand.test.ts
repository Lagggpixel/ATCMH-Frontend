import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Edinburgh 15B uses the charted stand, retaining the alternate taxi line", () => {
  const airport = getAirport({airport: "EGPH"});
  const previous = getAirport({airport: "EGPH", airportDataVersion: "2026-10-09"});
  const old = previous.features.filter(feature => feature.kind === "parking_position" && feature.name === "15B");
  assert.equal(old.length, 2);
  const gates = gatesFor(airport).filter(gate => gate.name === "15B");
  assert.equal(gates.length, 1);
  assert.equal(gates[0].id, "601359457");
  const alternate = airport.features.find(feature => feature.id === "1395913099")!;
  assert.equal(alternate.kind, "taxilane");
  assert.deepEqual(alternate.points, old.find(feature => feature.id === alternate.id)!.points);
  const beforeRemoval = getAirport({airport: "EGPH", airportDataVersion: "b759f3742b6d96a89bf113a2e17ebb065dec31d4798447ecf43d0309fa6647a4"});
  assert.deepEqual(buildTaxiGraph(beforeRemoval), buildTaxiGraph(previous));
  const point = {x: (-3 - 21 / 60 - 40.02 / 3600 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (55 + 57 / 60 + .99 / 3600 - airport.origin.lat) * 60};
  const position = standPlacement(gates[0].id, false, airport)!.position;
  assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 2);
  assert.ok(planTaxiRoute(airport, position, "24").path);
});

test("Edinburgh's withdrawn stand 209 remains only in older snapshots", () => {
  const airport = getAirport({airport: "EGPH"});
  const previous = getAirport({airport: "EGPH", airportDataVersion: "b759f3742b6d96a89bf113a2e17ebb065dec31d4798447ecf43d0309fa6647a4"});
  assert.ok(previous.features.some(feature => feature.kind === "parking_position" && feature.name === "209"));
  assert.ok(!airport.features.some(feature => feature.id === "601359411"));
  assert.ok(!gatesFor(airport).some(gate => gate.name === "209"));
});

test("Edinburgh charted stand endpoints match published 2022 positions", () => {
  const airport = getAirport({airport: "EGPH"});
  const references: [string, string, string][] = [["206","555705.55N","0032112.67W"],["207","555704.97N","0032110.74W"],["208","555704.20N","0032108.20W"],["210","555701.29N","0032053.58W"],["211","555700.37N","0032050.56W"],["212","555659.42N","0032047.47W"],["309","555645.20N","0032101.44W"],["310R","555645.83N","0032059.69W"],["310","555645.96N","0032059.22W"],["311R","555646.43N","0032057.92W"],["311","555646.71N","0032056.99W"],["311L","555647.04N","0032056.14W"],["312","555647.46N","0032054.78W"],["312L","555647.64N","0032054.36W"],["313","555648.21N","0032052.56W"],["314","555648.96N","0032050.34W"],["315","555649.72N","0032048.12W"],["316","555650.47N","0032045.90W"],["317","555651.97N","0032041.46W"],["317A","555651.22N","0032043.68W"],["10","555657.24N","0032148.18W"],["11","555658.08N","0032145.79W"],["12","555658.92N","0032143.48W"],["14","555659.63N","0032143.74W"],["15A","555700.40N","0032137.44W"],["15","555700.42N","0032139.88W"],["15B","555700.99N","0032140.02W"],["16A","555657.68N","0032136.25W"],["16","555658.12N","0032138.19W"],["16B","555658.70N","0032138.09W"],["17","555656.04N","0032137.08W"],["18","555655.26N","0032136.11W"],["19","555654.50N","0032134.28W"],["20","555654.27N","0032131.62W"],["21","555653.89N","0032131.41W"],["22","555653.60N","0032129.43W"],["23","555652.71N","0032128.29W"],["24","555652.92N","0032127.20W"],["25","555652.25N","0032125.01W"],["26","555652.08N","0032122.09W"],["1","555647.68N","0032157.07W"],["1A","555646.06N","0032157.70W"],["1B","555644.61N","0032157.66W"],["2","555649.31N","0032156.89W"],["2A","555649.24N","0032156.75W"],["3","555651.08N","0032156.95W"],["3A","555651.16N","0032157.43W"],["4","555652.85N","0032157.82W"],["4A","555652.36N","0032157.13W"],["5","555654.08N","0032157.87W"],["6","555654.56N","0032157.43W"],["7","555655.29N","0032155.27W"],["8","555656.20N","0032153.40W"],["9","555656.59N","0032150.86W"],["27","555651.22N","0032120.32W"],["28","555650.53N","0032118.08W"],["29","555649.82N","0032115.81W"],["30","555649.13N","0032113.54W"],["31","555648.43N","0032111.26W"],["32","555648.17N","0032109.41W"],["33","555647.31N","0032110.78W"],["34","555646.03N","0032112.03W"],["99","555645.40N","0032206.50W"],["100","555645.85N","0032207.04W"],["101","555646.32N","0032206.52W"],["102","555647.53N","0032207.60W"],["103","555649.29N","0032207.64W"],["104","555650.71N","0032208.25W"],["105","555652.12N","0032208.82W"],["106","555654.16N","0032209.32W"],["200","555709.20N","0032124.68W"],["201","555708.64N","0032122.80W"],["202","555708.06N","0032120.92W"],["203","555707.77N","0032118.51W"],["204","555707.14N","0032116.44W"],["205","555706.49N","0032114.31W"]];
  const coordinate = (value: string, degrees: number) => Number(value.slice(0, degrees)) + Number(value.slice(degrees, degrees + 2)) / 60 + Number(value.slice(degrees + 2, -1)) / 3600;
  assert.equal(references.length, 76);
  for (const [name, latitude, longitude] of references) {
    const stand = airport.features.find(feature => feature.kind === "parking_position" && feature.name === name);
    assert.ok(stand, name);
    const point = {x: (-coordinate(longitude, 3) - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (coordinate(latitude, 2) - airport.origin.lat) * 60};
    const position = standPlacement(stand.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 14, name);
  }
});

