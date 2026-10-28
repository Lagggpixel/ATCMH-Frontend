import type {Point} from "./model";

export interface MapCamera {center: Point; scale: number}
export interface MapSize {width: number; height: number}
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
const DECAY = 5;

// IF 26.4's active ATC MapControl: 100 m minimum, OrbitCamera's 10,000 km maximum.
// Convert its 45-degree vertical FOV to CSS px/NM for Sweatbox's flat map.
export const MIN_MAP_CAMERA_ALTITUDE = 100;
export const MAX_MAP_CAMERA_ALTITUDE = 10000000;
const projection = 1852 / (2 * Math.tan(Math.PI / 8));
export const mapCameraScale = (altitude: number, height: number) => Math.max(1, height) * projection / altitude;
export const mapCameraAltitude = (camera: Pick<MapCamera, "scale">, size: Pick<MapSize, "height">) =>
  Math.max(1, size.height) * projection / camera.scale;

/** Restore/fitting/resize use the same bounds as every zoom gesture. */
export function clampCamera(camera: MapCamera, size: MapSize): MapCamera {
  const scale = Math.max(mapCameraScale(MAX_MAP_CAMERA_ALTITUDE, size.height),
    Math.min(mapCameraScale(MIN_MAP_CAMERA_ALTITUDE, size.height), camera.scale));
  return scale === camera.scale ? camera : {...camera, scale};
}

/** Move the geographic point under `from` to `to`, including at the zoom limits. */
export function transformCamera(camera: MapCamera, size: MapSize, from: Point, to: Point, factor: number): MapCamera {
  const {scale} = clampCamera({...camera, scale: camera.scale * factor}, size);
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
  // A pinch ends without inertia, even when the last finger pans a little before lifting.
  private pinched = false;

  constructor(public camera: MapCamera, public size: MapSize) {this.camera = clampCamera(camera, size);}

  stop() {this.velocity = {x: 0, y: 0}; this.zoomVelocity = 0;}

  reset(camera: MapCamera) {this.cancel(); this.camera = clampCamera(camera, this.size);}

  down(id: number, point: Point, at: number, type: string, doubleTap = true) {
    this.stop();
    this.pointers.set(id, point);
    if (this.pointers.size > 1) {
      this.doubleZoom = undefined; this.lastTap = undefined; this.pinched = true;
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
      this.camera = transformCamera(this.camera, this.size, midpoint(previous, other), midpoint(point, other), before > 1 && after > 1 ? after / before : 1);
      this.stop();
    } else if (navigate && this.pointers.size === 1) {
      if (this.doubleZoom) {
        const {camera, point: anchor} = this.doubleZoom;
        this.camera = transformCamera(camera, this.size, anchor, anchor, Math.exp((anchor.y - point.y) / 75));
      } else if (drag.moved) {
        this.camera = transformCamera(this.camera, this.size, previous, point, 1);
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
    if (this.pinched || this.doubleZoom || !drag?.moved || at - drag.at > 80 || this.pointers.size) this.stop();
    this.doubleZoom = undefined;
    if (!this.pointers.size) this.pinched = false;
    this.drag = this.pointers.size ? {start: [...this.pointers.values()][0], at, moved: true, type: drag?.type ?? "touch"} : undefined;
    return tap;
  }

  cancel(id?: number) {
    // Lost capture after a normal release must not cancel inertia or the remaining finger.
    if (id !== undefined && !this.pointers.has(id)) return;
    if (id === undefined) this.pointers.clear(); else this.pointers.delete(id);
    this.stop(); this.lastTap = undefined; this.doubleZoom = undefined;
    if (!this.pointers.size) this.pinched = false;
    this.drag = this.pointers.size ? {start: [...this.pointers.values()][0], at: 0, moved: true, type: "touch"} : undefined;
  }

  wheel(point: Point, delta: number, mode: number, magnify: boolean) {
    const pixels = delta * (mode === 1 ? 16 : mode === 2 ? this.size.height : 1);
    this.magnify(point, Math.exp(Math.max(-4, Math.min(4, -pixels * (magnify ? .01 : .0015)))));
  }

  magnify(point: Point, factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.cancel();
    this.camera = transformCamera(this.camera, this.size, point, point, factor);
  }

  zoom(factor: number) {
    this.cancel();
    if (!Number.isFinite(factor) || factor <= 0) return;
    const altitude = Math.max(mapCameraAltitude(this.camera, this.size), 1000);
    this.zoomVelocity = (altitude / factor - altitude) * 6;
  }

  /** Integrate exponential decay analytically so 30/60/120 Hz give the same motion. */
  step(milliseconds: number) {
    const elapsed = Math.max(0, Math.min(64, milliseconds)) / 1000;
    const decay = Math.exp(-DECAY * elapsed), travel = (1 - decay) / DECAY;
    const center = {x: this.size.width / 2, y: this.size.height / 2};
    const altitude = mapCameraAltitude(this.camera, this.size);
    const nextAltitude = Math.max(MIN_MAP_CAMERA_ALTITUDE, Math.min(MAX_MAP_CAMERA_ALTITUDE, altitude + this.zoomVelocity * travel));
    this.camera = transformCamera(this.camera, this.size, center, {x: center.x + this.velocity.x * travel, y: center.y + this.velocity.y * travel}, altitude / nextAltitude);
    this.velocity.x *= decay; this.velocity.y *= decay; this.zoomVelocity *= decay;
    if ((nextAltitude === MIN_MAP_CAMERA_ALTITUDE && this.zoomVelocity < 0) || (nextAltitude === MAX_MAP_CAMERA_ALTITUDE && this.zoomVelocity > 0)) this.zoomVelocity = 0;
    if (Math.hypot(this.velocity.x, this.velocity.y) < 2) this.velocity = {x: 0, y: 0};
    if (Math.abs(this.zoomVelocity) < .01) this.zoomVelocity = 0;
    return !!(this.velocity.x || this.velocity.y || this.zoomVelocity);
  }
}
