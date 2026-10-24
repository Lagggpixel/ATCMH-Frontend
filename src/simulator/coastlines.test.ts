import assert from "node:assert/strict";
import test from "node:test";
import {COASTLINE_STYLE, COASTLINE_URL, createCoastlineLoader, drawCoastlines, indexCoastlines} from "./coastlines";

const geometry = (coordinates: number[][][]) => ({type: "MultiLineString", coordinates});
function canvas() {
  const paths: number[][][] = [];
  let current: number[][];
  const ctx = {strokeStyle: "", lineWidth: 0, save() {}, restore() {}, beginPath() {}, setLineDash() {}, stroke() {},
    moveTo(x: number, y: number) {paths.push(current = [[x, y]]);}, lineTo(x: number, y: number) {current.push([x, y]);}};
  return {ctx: ctx as unknown as CanvasRenderingContext2D, paths};
}
const camera = {center: {x: 0, y: 0}, scale: 10}, size = {width: 600, height: 600};

test("coastlines use the airport's east/north nautical-mile projection and constant CSS-pixel styling", () => {
  const data = indexCoastlines(geometry([[[10, 60], [10.1, 60.1]]]));
  const a = canvas(); drawCoastlines(a.ctx, data, {lat: 60, lon: 10}, camera, size);
  assert.deepEqual(a.paths[0][0], [300, 300]);
  assert.ok(Math.abs(a.paths[0][1][0] - 330) < 1e-8);
  assert.ok(Math.abs(a.paths[0][1][1] - 240) < 1e-8);
  assert.equal(a.ctx.strokeStyle, COASTLINE_STYLE.color); assert.equal(a.ctx.lineWidth, .75);
  const b = canvas(); drawCoastlines(b.ctx, data, {lat: 60, lon: 10}, {...camera, scale: 20}, size);
  assert.equal(b.ctx.lineWidth, a.ctx.lineWidth); assert.ok(Math.abs(b.paths[0][1][0] - 360) < 1e-8);
});

test("viewport culling retains crossing segments, supports panning, and does not join separate islands", () => {
  const data = indexCoastlines(geometry([[[-1, 0], [1, 0]], [[10, 0], [10.1, 0]], [[0, 20], [.1, 20]]]));
  const a = canvas(); drawCoastlines(a.ctx, data, {lat: 0, lon: 0}, camera, size);
  assert.equal(a.paths.length, 1); assert.ok(a.paths[0][0][0] < 0 && a.paths[0][1][0] > 600);
  const b = canvas(); drawCoastlines(b.ctx, data, {lat: 0, lon: 0}, {...camera, center: {x: 600, y: 0}}, size);
  assert.equal(b.paths.length, 1); assert.equal(b.paths[0][0][0], 300);
});

test("date-line geometry is continuous near Fiji and never draws a line across Greenwich", () => {
  const data = indexCoastlines(geometry([[[179.9, 0], [-179.9, 0]]]));
  for (const lon of [179.9, -179.9]) {
    const a = canvas(); drawCoastlines(a.ctx, data, {lat: 0, lon}, camera, size);
    assert.equal(a.paths.length, 1); assert.ok(Math.abs(a.paths[0][1][0] - a.paths[0][0][0]) < 121);
  }
  const b = canvas(); drawCoastlines(b.ctx, data, {lat: 0, lon: 0}, camera, size);
  assert.equal(b.paths.length, 0);
});

test("long coastlines are indexed in bounded chunks without losing a segment", () => {
  const line = Array.from({length: 300}, (_, i) => [i / 1000, 0]);
  const data = indexCoastlines(geometry([line]));
  assert.ok(data.length > 1);
  assert.equal(data.reduce((n, c) => n + c.points.length / 2 - 1, 0), line.length - 1);
  assert.ok(data.every(c => c.points.length <= 256));
});

test("malformed or unbounded geographic data fails instead of poisoning the canvas", () => {
  for (const value of [null, {}, {type: "LineString", coordinates: []}, geometry([]), geometry([[[0, 0]]]),
    geometry([[[0, 0], [181, 0]]]), geometry([[[0, 0], [0, 91]]]), geometry([[[0, 0], [NaN, 0]]])]) {
    assert.throws(() => indexCoastlines(value), /Invalid coastline/);
  }
});

test("simultaneous scopes share one external-file fetch and keep the successful immutable index", async () => {
  let calls = 0;
  const load = createCoastlineLoader((async (url, init) => {
    calls++; assert.equal(url, COASTLINE_URL); assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "force-cache");
    return new Response(JSON.stringify(geometry([[[0, 0], [1, 1]]])));
  }) as typeof fetch);
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a, b); assert.equal(await load(), a); assert.equal(calls, 1);
});

test("HTTP, JSON and validation failures can all be retried", async () => {
  let calls = 0;
  const load = createCoastlineLoader((async (_url, init) => {
    calls++;
    assert.equal(init?.cache, calls === 1 ? "force-cache" : "reload", "Retry bypasses a cached malformed/error response");
    return calls === 1 ? new Response("missing", {status: 503}) : calls === 2 ? new Response("bad json")
      : calls === 3 ? new Response(JSON.stringify({type: "Point"})) : new Response(JSON.stringify(geometry([[[0, 0], [1, 1]]])));
  }) as typeof fetch);
  for (let i = 0; i < 3; i++) await assert.rejects(load());
  assert.ok((await load()).length); assert.equal(calls, 4);
});

test("a timed-out request is aborted and can recover on Retry", async () => {
  let calls = 0;
  const load = createCoastlineLoader(((_url, init) => {
    calls++;
    if (calls > 1) return Promise.resolve(new Response(JSON.stringify(geometry([[[0, 0], [1, 1]]]))));
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("timeout")), {once: true}));
  }) as typeof fetch, 10);
  await assert.rejects(load(), /timeout/); assert.ok((await load()).length);
});
