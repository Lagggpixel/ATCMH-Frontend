import type {Point} from "./model";

export interface MapCamera {center: Point; scale: number}
export interface MapSize {width: number; height: number}
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
const DECAY = 5;

/** Move the geographic point under `from` to `to`, including at the zoom limits. */
export function transformCamera(camera: MapCamera, size: MapSize, from: Point, to: Point, factor: number, minimum: number): MapCamera {
  const scale = Math.max(minimum, Math.min(1800, camera.scale * factor));
  return {scale, center: {
    x: camera.center.x + (from.x - size.width / 2) / camera.scale - (to.x - size.width / 2) / scale,
    y: camera.center.y - (from.y - size.height / 2) / camera.scale + (to.y - size.height / 2) / scale,
  }};
}

/** Shared flat-map equivalent of the 26.4 camera gestures; time is in milliseconds. */
export class ScopeCameraMotion {
  readonly pointers = new Map<number, Point>();
  private drag?: {start: Point; at: number; moved: boolean; type: string};
  private lastTap?: {point: Point; at: number; type: string};
  private doubleZoom?: {point: Point; camera: MapCamera};
  private velocity = {x: 0, y: 0};
  private zoomVelocity = 0;

  constructor(public camera: MapCamera, public size: MapSize, public minimum: number) {}

  stop() {this.velocity = {x: 0, y: 0}; this.zoomVelocity = 0;}

  reset(camera: MapCamera) {this.cancel(); this.camera = camera;}

  down(id: number, point: Point, at: number, type: string, doubleTap = true) {
    this.stop();
    this.pointers.set(id, point);
    if (this.pointers.size > 1) {
      this.doubleZoom = undefined; this.lastTap = undefined;
      this.drag = {start: point, at, moved: true, type};
    } else {
      const tap = this.lastTap;
      this.doubleZoom = doubleTap && tap?.type === type && at - tap.at < 300 && length(tap.point, point) < 24
        ? {point, camera: this.camera} : undefined;
      this.lastTap = undefined;
      this.drag = {start: point, at, moved: !!this.doubleZoom, type};
    }
  }

  move(id: number, point: Point, at: number, navigate = true) {
    const previous = this.pointers.get(id), drag = this.drag;
    if (!previous || !drag) return;
    if (length(drag.start, point) > 4) drag.moved = true;
    if (navigate && this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([key]) => key !== id)![1];
      const before = length(previous, other), after = length(point, other);
      this.camera = transformCamera(this.camera, this.size, midpoint(previous, other), midpoint(point, other), before > 1 && after > 1 ? after / before : 1, this.minimum);
      this.stop();
    } else if (navigate && this.pointers.size === 1) {
      if (this.doubleZoom) {
        const {camera, point: anchor} = this.doubleZoom;
        this.camera = transformCamera(camera, this.size, anchor, anchor, Math.exp((anchor.y - point.y) / 75), this.minimum);
      } else if (drag.moved) {
        this.camera = transformCamera(this.camera, this.size, previous, point, 1, this.minimum);
        const elapsed = Math.max(8, at - drag.at);
        this.velocity = {x: (point.x - previous.x) / elapsed * 1000, y: (point.y - previous.y) / elapsed * 1000};
      }
    }
    this.pointers.set(id, point); drag.at = at;
  }

  up(id: number, at: number) {
    if (!this.pointers.has(id)) return false;
    const point = this.pointers.get(id)!, drag = this.drag;
    const tap = !!drag && !drag.moved && this.pointers.size === 1;
    this.pointers.delete(id);
    if (tap && at - drag!.at < 300) this.lastTap = {point, at, type: drag!.type};
    if (this.doubleZoom || !drag?.moved || at - drag.at > 80 || this.pointers.size) this.stop();
    this.doubleZoom = undefined;
    this.drag = this.pointers.size ? {start: [...this.pointers.values()][0], at, moved: true, type: drag?.type ?? "touch"} : undefined;
    return tap;
  }

  cancel(id?: number) {
    // Lost capture after a normal release must not cancel inertia or the remaining finger.
    if (id !== undefined && !this.pointers.has(id)) return;
    if (id === undefined) this.pointers.clear(); else this.pointers.delete(id);
    this.stop(); this.lastTap = undefined; this.doubleZoom = undefined;
    this.drag = this.pointers.size ? {start: [...this.pointers.values()][0], at: 0, moved: true, type: "touch"} : undefined;
  }

  wheel(point: Point, delta: number, mode: number, magnify: boolean) {
    const pixels = delta * (mode === 1 ? 16 : mode === 2 ? this.size.height : 1);
    this.magnify(point, Math.exp(Math.max(-4, Math.min(4, -pixels * (magnify ? .01 : .0015)))));
  }

  magnify(point: Point, factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.cancel();
    this.camera = transformCamera(this.camera, this.size, point, point, factor, this.minimum);
  }

  zoom(factor: number) {this.cancel(); this.zoomVelocity = Math.log(factor) * DECAY;}

  /** Integrate exponential decay analytically so 30/60/120 Hz give the same motion. */
  step(milliseconds: number) {
    const elapsed = Math.max(0, Math.min(64, milliseconds)) / 1000;
    const decay = Math.exp(-DECAY * elapsed), travel = (1 - decay) / DECAY;
    const center = {x: this.size.width / 2, y: this.size.height / 2};
    this.camera = transformCamera(this.camera, this.size, center, {x: center.x + this.velocity.x * travel, y: center.y + this.velocity.y * travel}, Math.exp(this.zoomVelocity * travel), this.minimum);
    this.velocity.x *= decay; this.velocity.y *= decay; this.zoomVelocity *= decay;
    if (Math.hypot(this.velocity.x, this.velocity.y) < 2) this.velocity = {x: 0, y: 0};
    if (Math.abs(this.zoomVelocity) < .002) this.zoomVelocity = 0;
    return !!(this.velocity.x || this.velocity.y || this.zoomVelocity);
  }
}
