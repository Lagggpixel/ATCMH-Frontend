import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice stand lines place aircraft near the charted INS checkpoints", () => {
  const airport = getAirport({airport: "LFMN", airportDataVersion: "8849be453fc15269108c0c3ea255def0e36f8979545459d859151f8bbc1863b3"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "4f81c2b8016f51bf0c65694eafac164134e52d0e47358b53e02377040032c7ad"});
  const stands: readonly (readonly [string, string, number, number])[] = [["7","1224615366",43.66258611111111,7.211711111111112],["9","1224615367",43.662277777777774,7.2113000000000005],["11","1224619675",43.661991666666665,7.2108694444444446],["56L","1225133691",43.657475,7.204113888888889],["54B","249929135",43.658202777777774,7.205130555555556],["48A","249930312",43.659927777777774,7.207072222222222],["44","249931085",43.661175,7.206727777777778],["12A","249933315",43.66445833333333,7.213472222222222],["8C","249933319",43.66480833333333,7.214869444444445],["8A","249933321",43.66510833333333,7.215275],["13","249936357",43.66262222222222,7.211180555555556],["5","249936358",43.66282222222222,7.212141666666667],["75A","962258833",43.65499722222222,7.204213888888889],["75D","962258834",43.65504722222222,7.204255555555556]];
  const gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    const position = standPlacement(id, false, airport)!.position;
    const oldPosition = standPlacement(id, false, previous)!.position;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 3, name);
    assert.ok(Math.hypot(oldPosition.x - chart.x, oldPosition.y - chart.y) * 1852 > 35, name);
    assert.ok(gates.some(gate => gate.id === id), name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      assert.ok(route.path, `${name} to ${end.id}`);
    }
  }
});
