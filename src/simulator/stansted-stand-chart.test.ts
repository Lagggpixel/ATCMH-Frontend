import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Stansted stands match the NATS chart and connect to both runway ends", () => {
  const airport = getAirport({airport: "EGSS"});
  const previous = getAirport({airport: "EGSS", airportDataVersion: "facebe7e020da06149a959a684c11cd9413de4fe4c8597dce15aaee1c833cf1d"});
  // Published latitude and longitude seconds at 51°53′N, 000°14′ or 000°15′E.
  const references: Record<string, [number, number, number]> = {"Z204F":[0.58,14,40.95],"Z204L":[0.89,14,40.75],"Z204":[0.63,14,38.87],"Z213R":[6.04,14,48.47],"Z213":[6.91,14,48.3],"Z213L":[6.65,14,46.42],"Z214R":[7.91,14,45.22],"Z214":[8.78,14,45.05],"Z214L":[8.52,14,43.17],"D73R":[42.56,15,37.7],"D73L":[43.4,15,35.99],"C44R":[32.96,15,20.38],"J45L":[32.27,15,18.93],"J45R":[31.78,15,18.17],"C50L":[32.02,15,36.67],"C50R":[31.19,15,38.39],"C51L":[33.83,15,33.52],"C51R":[32.93,15,35.1],"C52L":[35.68,15,30.3],"C52R":[34.89,15,32.06],"C53L":[37.53,15,27.07],"C53R":[36.72,15,28.84],"D63L":[37.09,15,35.34],"D63R":[37.73,15,33.34],"D64L":[38.6,15,31.61],"D64R":[39.81,15,30.61],"J65L":[39.01,15,29.42],"J65R":[38.47,15,28.61],"B33":[29.12,15,21.14],"B33L":[28.94,15,19.61],"B34R":[30.07,15,18.47],"B34":[30.79,15,18.23],"B34L":[30.87,15,16.74],"C40":[26.84,15,31.1],"C41":[27.91,15,29.6],"C42L":[28.95,15,27.98],"C42":[28.9,15,26.24],"C42R":[29.51,15,26.05],"C43L":[30.59,15,24.77],"C43":[30.45,15,23.15],"C43R":[31.31,15,22.91],"C44L":[32.34,15,21.5],"C44":[32.16,15,20.29],"B22":[22.37,15,15.92],"B22R":[22.73,15,16.07],"B23L":[23.91,15,14.7],"B23":[23.82,15,13.04],"B23R":[24.56,15,12.74],"B24L":[25.61,15,11.35],"B24":[25.42,15,10.14],"B24R":[26.36,15,10.16],"J25L":[25.65,15,8.91],"J25R":[25.09,15,7.83],"B30":[24.6,15,27.56],"B31":[25.46,15,25.85],"B32R":[26.5,15,24.46],"B32L":[27.29,15,22.72],"B33R":[28.36,15,21.34],"A11":[18.08,15,17.35],"A11R":[17.03,15,18.13],"A12L":[19.3,15,12.71],"A12":[19.69,15,14.38],"A12R":[18.73,15,14.79],"A13L":[21.12,15,9.54],"A13":[21.55,15,11.22],"A13R":[20.63,15,11.74],"A14":[22.42,15,8.49],"A15L":[24.18,15,5.11],"A15":[23.49,15,7.06],"A15R":[23.24,15,6.74],"B20":[20.14,15,21.15],"B21":[21.01,15,19.43],"B22L":[21.81,15,17.63],"A1L":[10.28,15,10.99],"A1":[10.43,15,9.47],"A1R":[11,15,9.25],"A2":[12.03,15,7.22],"A3":[13.83,15,4.84],"A4":[13.91,15,4.2],"A5":[14.78,15,2.73],"A6":[15.44,15,1.32],"A7":[15.63,15,1.21],"A8":[16.02,15,1.03],"A9L":[17.39,14,59.46],"A9":[17.4,14,57.91],"A9R":[18.07,14,57.35],"A10":[16.07,15,19.7],"A11L":[17.93,15,16.54]};
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  assert.equal(gates.length, Object.keys(references).length);
  for (const gate of gates) {
    const [latSeconds, lonMinutes, lonSeconds] = references[gate.name];
    const point = {x: (lonMinutes / 60 + lonSeconds / 3600 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (51 + 53 / 60 + latSeconds / 3600 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 20, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});

