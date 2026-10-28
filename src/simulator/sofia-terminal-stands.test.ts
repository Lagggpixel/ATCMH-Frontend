import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sofia mapped terminal stands use their parking endpoints", () => {
  const airport = getAirport({airport: "LBSF"});
  // Map: https://www.openstreetmap.org/way/1552966251
  // Stand designations: https://bgvacc.com/wp-content/uploads/2024/04/LB_AD_2_LBSF_en.pdf
  const stands = [["5", "943823780", 42.6918240, 23.4125891], ["6", "943823783", 42.6914504, 23.4127450], ["7", "943823786", 42.6910695, 23.4129188], ["8", "943823792", 42.6906963, 23.4131041], ["4", "943826523", 42.6921228, 23.4146909], ["9", "1552966248", 42.6903140, 23.4132603], ["10", "1552966249", 42.6895576, 23.4130006], ["11", "1552966250", 42.6891800, 23.4124327], ["1", "1552966251", 42.6902582, 23.4150561], ["2", "1552966252", 42.6908897, 23.4152301], ["3", "1552966253", 42.6914693, 23.4149511], ["4A", "1552966254", 42.6920400, 23.4149390], ["4B", "1552966256", 42.6923543, 23.4146818]] as const;
  const gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
