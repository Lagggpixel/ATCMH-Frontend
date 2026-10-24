import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {appendFlightPlan} from "./scenario-flight-plan";
import {createNavigationApi, fetchNavigationData, type NavigationSource} from "./server/navigation-api";

test("provider single-fix segments keep the KDAL and PHOG catalogues and route imports usable", async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.INFINITE_HORIZON_API_URL, originalKey = process.env.INFINITE_HORIZON_API_KEY;
  process.env.INFINITE_HORIZON_API_URL = "https://navigation.test";
  process.env.INFINITE_HORIZON_API_KEY = "synthetic-test-key";
  const sources: Record<string, NavigationSource> = {};
  for (const code of ["KDAL", "PHOG", "EGPH"]) {
    const airport = getAirport({airport: code});
    const fix = {identifier: "TEST", waypointType: "VOR", vorType: "TACAN", slavedVariation: -11.5, lat: airport.origin.lat, lon: airport.origin.lon};
    sources[code] = {version: 1, icao: code, revision: `${code}-revision`, waypoints: [{...fix, id: "fix-1"}], procedures: [
      {id: "procedure-1", identifier: "TEST1", type: "SID", routes: [
        {id: "single", transition: null, points: [fix]},
        {id: "complete", transition: "TEST", points: [fix, {...fix, identifier: "NEXT", lat: fix.lat + 1 / 60}]},
      ]},
    ]};
  }
  let reads = 0;
  globalThis.fetch = async input => {
    reads++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("radiusNm"), "100");
    assert.equal(url.searchParams.get("includeApproaches"), "1");
    return Response.json(sources[url.pathname.split("/")[3]]);
  };
  const api = createNavigationApi(fetchNavigationData, async () => ({accountId: "mentor", staff: true}));
  const request = (code: string, route?: string) => new Request(`https://simulator.test/api/simulator/navigation?airport=${code}${route ? `&route=${route}&revision=${code}-revision` : ""}`);
  try {
    // Empty or malformed segments still fail, and a failed fetch can be retried.
    const original = structuredClone(sources.EGPH);
    for (const points of [[], [{identifier: "TEST", lat: null, lon: 0}]]) {
      sources.EGPH = structuredClone(original);
      sources.EGPH.procedures[0].routes[0].points = points as unknown as NavigationSource["procedures"][number]["routes"][number]["points"];
      assert.equal((await api(request("EGPH"))).status, 503);
    }
    sources.EGPH = original;
    assert.equal((await api(request("EGPH"))).status, 200);
    for (const code of ["KDAL", "PHOG"]) {
      const response = await api(request(code));
      assert.equal(response.status, 200);
      const catalogue = await response.json();
      assert.equal(catalogue.fixes.length, 1);
      assert.equal(catalogue.fixes[0].point.waypointType, "VOR");
      assert.equal(catalogue.fixes[0].point.vorType, "TACAN");
      assert.equal(catalogue.fixes[0].point.slavedVariation, -11.5);
      assert.deepEqual(catalogue.procedures[0].routes.map((route: {pointCount: number}) => route.pointCount), [1, 2]);
      const single = await api(request(code, "single"));
      assert.equal(single.status, 200);
      const route = await single.json();
      assert.deepEqual(route.points, [{x: 0, y: 0, name: "TEST", waypointType: "VOR", vorType: "TACAN", slavedVariation: -11.5}]);
      assert.deepEqual(appendFlightPlan([], route.points), route.points);
      const complete = await (await api(request(code, "complete"))).json();
      assert.deepEqual(complete.points.map((point: {name: string}) => point.name), ["TEST", "NEXT"]);
      assert.deepEqual(appendFlightPlan(route.points, complete.points), complete.points);
    }
    assert.equal(reads, 5, "valid airport data is reused without repeated provider calls");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.INFINITE_HORIZON_API_URL; else process.env.INFINITE_HORIZON_API_URL = originalBase;
    if (originalKey === undefined) delete process.env.INFINITE_HORIZON_API_KEY; else process.env.INFINITE_HORIZON_API_KEY = originalKey;
  }
});
