import {CODEC_DICTIONARY} from "./codec-dictionary";
import type {Aircraft, Exercise} from "./model";
import type {ReplayDelta, ReplayFrame} from "./replays";

/** Compact binary values and frames shared by replays, the live stream, commands and demonstrations.
 * Everything here is plain bytes: compression belongs to the server and browser helpers. */

export class ByteWriter {
  private buffer = new Uint8Array(256);
  length = 0;
  private reserve(size: number) {
    if (this.length + size <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < this.length + size) capacity *= 2;
    const next = new Uint8Array(capacity); next.set(this.buffer.subarray(0, this.length)); this.buffer = next;
  }
  u8(value: number) {this.reserve(1); this.buffer[this.length++] = value;}
  /** Unsigned integers up to 2^53, seven bits per byte. */
  varuint(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("varuint out of range");
    this.reserve(8);
    while (value >= 128) {this.buffer[this.length++] = value % 128 | 128; value = Math.floor(value / 128);}
    this.buffer[this.length++] = value;
  }
  varint(value: number) {this.varuint(value >= 0 ? value * 2 : -value * 2 - 1);}
  f64(value: number) {this.reserve(8); new DataView(this.buffer.buffer, this.buffer.byteOffset + this.length, 8).setFloat64(0, value, true); this.length += 8;}
  bytes(value: Uint8Array) {this.reserve(value.length); this.buffer.set(value, this.length); this.length += value.length;}
  finish() {return this.buffer.slice(0, this.length);}
}
export class ByteReader {
  offset = 0;
  private view: DataView;
  constructor(readonly data: Uint8Array) {this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);}
  get done() {return this.offset >= this.data.length;}
  u8() {if (this.offset >= this.data.length) throw new RangeError("Unexpected end of data"); return this.data[this.offset++];}
  varuint() {
    let value = 0, scale = 1;
    for (let i = 0; i < 8; i++) {
      const byte = this.u8(); value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
    throw new RangeError("varuint too long");
  }
  varint() {const value = this.varuint(); return value % 2 ? -(value + 1) / 2 : value / 2;}
  f64() {if (this.offset + 8 > this.data.length) throw new RangeError("Unexpected end of data"); const value = this.view.getFloat64(this.offset, true); this.offset += 8; return value;}
  bytes(length: number) {if (this.offset + length > this.data.length) throw new RangeError("Unexpected end of data"); const value = this.data.subarray(this.offset, this.offset + length); this.offset += length; return value;}
}

const dictionary = new Map(CODEC_DICTIONARY.map((value, index) => [value, index]));
const textEncoder = new TextEncoder(), textDecoder = new TextDecoder("utf-8", {fatal: true});
/** Strings are dictionary references, or inline the first time and referenced afterwards within one message. */
class Strings {
  private local = new Map<string, number>();
  private list: string[] = [];
  write(w: ByteWriter, value: string) {
    const index = dictionary.get(value) ?? this.local.get(value);
    if (index !== undefined) {w.varuint(index * 2); return;}
    const bytes = textEncoder.encode(value);
    w.varuint(bytes.length * 2 + 1); w.bytes(bytes);
    this.local.set(value, CODEC_DICTIONARY.length + this.list.length); this.list.push(value);
  }
  read(r: ByteReader) {
    const header = r.varuint();
    if (header % 2) {const value = textDecoder.decode(r.bytes((header - 1) / 2)); this.list.push(value); return value;}
    const index = header / 2;
    const value = index < CODEC_DICTIONARY.length ? CODEC_DICTIONARY[index] : this.list[index - CODEC_DICTIONARY.length];
    if (value === undefined) throw new RangeError("Unknown string reference");
    return value;
  }
}

/** Fields whose string values name an account; collected so erasure can find binary replays. */
export const IDENTITY_KEYS = new Set(["accountId", "actorId", "ownerId", "assignedBy", "byId", "traineeId", "assignedId", "discordId"]);
const enum Tag {Null, False, True, PositiveInt, NegativeInt, Float, Decimal, String, Array = 9, Object}

/** One codec message: a string table plus the identities it carried. */
export class ValueCodec {
  private strings = new Strings();
  readonly identities = new Set<string>();
  constructor(readonly w: ByteWriter = new ByteWriter()) {}
  str(value: string) {this.strings.write(this.w, value);}
  number(value: number) {
    const w = this.w;
    if (!Number.isFinite(value)) {w.u8(Tag.Null); return;}
    if (Number.isSafeInteger(value)) {if (value >= 0) {w.u8(Tag.PositiveInt); w.varuint(value);} else {w.u8(Tag.NegativeInt); w.varuint(-value);} return;}
    for (let exponent = 1, scale = 10; exponent <= 6; exponent++, scale *= 10) {
      const mantissa = Math.round(value * scale);
      if (Number.isSafeInteger(mantissa) && mantissa / scale === value) {w.u8(Tag.Decimal); w.varint(mantissa); w.u8(exponent); return;}
    }
    w.u8(Tag.Float); w.f64(value);
  }
  /** JSON semantics: undefined object entries are skipped, undefined array items and non-finite numbers become null. */
  value(value: unknown, key?: string) {
    const w = this.w;
    if (value === null || value === undefined || typeof value === "function" || typeof value === "symbol") w.u8(Tag.Null);
    else if (value === false) w.u8(Tag.False);
    else if (value === true) w.u8(Tag.True);
    else if (typeof value === "number") this.number(value);
    else if (typeof value === "string") {w.u8(Tag.String); this.str(value); if (key && IDENTITY_KEYS.has(key)) this.identities.add(value);}
    else if (Array.isArray(value)) {w.u8(Tag.Array); w.varuint(value.length); for (const item of value) this.value(item);}
    else if (typeof value === "object") {
      const json = (value as {toJSON?: () => unknown}).toJSON;
      if (typeof json === "function") {this.value(json.call(value), key); return;}
      const entries = Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== "function" && typeof item !== "symbol");
      w.u8(Tag.Object); w.varuint(entries.length);
      for (const [name, item] of entries) {this.str(name); this.value(item, name);}
    } else throw new TypeError("Unsupported value");
  }
}
export class ValueDecoder {
  private strings = new Strings();
  constructor(readonly r: ByteReader) {}
  str() {return this.strings.read(this.r);}
  value(depth = 0): unknown {
    if (depth > 64) throw new RangeError("Value nested too deeply");
    const r = this.r, tag = r.u8();
    switch (tag) {
      case Tag.Null: return null;
      case Tag.False: return false;
      case Tag.True: return true;
      case Tag.PositiveInt: return r.varuint();
      case Tag.NegativeInt: return -r.varuint();
      case Tag.Float: return r.f64();
      case Tag.Decimal: {const mantissa = r.varint(), exponent = r.u8(); if (exponent < 1 || exponent > 6) throw new RangeError("Invalid decimal"); return mantissa / 10 ** exponent;}
      case Tag.String: return this.str();
      case Tag.Array: {
        const length = r.varuint(); if (length > r.data.length) throw new RangeError("Invalid array length");
        const result: unknown[] = []; for (let i = 0; i < length; i++) result.push(this.value(depth + 1)); return result;
      }
      case Tag.Object: {
        const count = r.varuint(); if (count > r.data.length) throw new RangeError("Invalid object size");
        const result: Record<string, unknown> = {};
        for (let i = 0; i < count; i++) {const name = this.str(); if (name === "__proto__") throw new RangeError("Invalid key"); result[name] = this.value(depth + 1);}
        return result;
      }
      default: throw new RangeError("Unknown value tag");
    }
  }
}
/** A single self-contained value, such as a command body or demonstration batch. */
export function encodeValue(value: unknown) {const codec = new ValueCodec(); codec.value(value); return codec.w.finish();}
export function decodeValue(data: Uint8Array) {
  const r = new ByteReader(data), value = new ValueDecoder(r).value();
  if (!r.done) throw new RangeError("Trailing bytes after value");
  return value;
}

// ---- Array differences: keep runs of the previous array, send only new items. ----
const itemKey = (value: unknown) => JSON.stringify(value) ?? "undefined";
function writeArray(codec: ValueCodec, before: readonly unknown[], after: readonly unknown[]) {
  const positions = new Map<string, number[]>();
  before.forEach((item, index) => {const key = itemKey(item), list = positions.get(key); if (list) list.push(index); else positions.set(key, [index]);});
  type Op = {keep: number; length: number} | {items: unknown[]};
  const ops: Op[] = [];
  let next = -1;
  for (const item of after) {
    const key = itemKey(item), last = ops.at(-1);
    if (last && "keep" in last && next >= 0 && next < before.length && itemKey(before[next]) === key) {last.length++; next++; continue;}
    const match = positions.get(key)?.find(index => index >= next) ?? positions.get(key)?.[0];
    if (match !== undefined) {ops.push({keep: match, length: 1}); next = match + 1;}
    else {if (last && "items" in last) last.items.push(item); else ops.push({items: [item]}); next = -1;}
  }
  codec.w.varuint(ops.length);
  for (const op of ops) {
    if ("keep" in op) {codec.w.varuint(op.keep * 2); codec.w.varuint(op.length);}
    else {codec.w.varuint(op.items.length * 2 + 1); for (const item of op.items) codec.value(item);}
  }
}
function readArray(decoder: ValueDecoder, before: readonly unknown[]) {
  const r = decoder.r, result: unknown[] = [];
  for (let ops = r.varuint(); ops > 0; ops--) {
    const header = r.varuint();
    if (header % 2) {for (let count = (header - 1) / 2; count > 0; count--) result.push(decoder.value());}
    else {
      const start = header / 2, length = r.varuint();
      if (start + length > before.length) throw new RangeError("Array reference out of range");
      for (let i = 0; i < length; i++) result.push(before[start + i]);
    }
  }
  return result;
}
function writeField(codec: ValueCodec, key: string, before: unknown, after: unknown) {
  codec.str(key);
  if (Array.isArray(before) && Array.isArray(after) && before.length) {codec.w.u8(1); writeArray(codec, before, after);}
  else {codec.w.u8(0); codec.value(after, key);}
}
function readField(decoder: ValueDecoder, before: unknown) {
  const mode = decoder.r.u8();
  if (mode === 1) {if (!Array.isArray(before)) throw new RangeError("Array difference without a previous array"); return readArray(decoder, before);}
  if (mode !== 0) throw new RangeError("Unknown field mode");
  return decoder.value();
}

// ---- Quantised aircraft motion. ----
/** Replay precision: about 2 m of position, 0.1 degrees, 0.1 knots and 1 ft. Live streams stay exact. */
const HOT = [
  ["x", 1000], ["y", 1000], ["altitude", 1], ["heading", 10], ["track", 10], ["targetHeading", 10], ["bankAngle", 10],
  ["speed", 10], ["groundSpeed", 10], ["verticalSpeed", 1], ["flightSeconds", 10], ["enduranceMinutes", 100],
] as const;
type HotName = typeof HOT[number][0];
const isPoint = (value: unknown): value is {x: number; y: number} => !!value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === 2 && typeof (value as {x: unknown}).x === "number" && typeof (value as {y: unknown}).y === "number";
const isFuel = (value: unknown): value is NonNullable<Aircraft["fuel"]> => !!value && typeof value === "object" && typeof (value as {enduranceMinutes?: unknown}).enduranceMinutes === "number";
function sameExcept(a: Record<string, unknown>, b: Record<string, unknown>, except: string) {
  const keys = Object.keys(a).filter(key => a[key] !== undefined), other = Object.keys(b).filter(key => b[key] !== undefined);
  return keys.length === other.length && keys.every(key => key === except || JSON.stringify(a[key]) === JSON.stringify(b[key]));
}
function hotValue(source: Partial<Aircraft> | undefined, name: HotName): number | undefined {
  if (!source) return undefined;
  const value = name === "x" || name === "y" ? source.position?.[name] : name === "enduranceMinutes" ? source.fuel?.enduranceMinutes : source[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
/** Values compared exactly by the engine (ground altitude, 0 and 360 degrees) survive quantisation exactly. */
const BASE_ANCHORS = [0, 360];
function writeHot(w: ByteWriter, value: number, previous: number | undefined, scale: number, anchors: readonly number[]) {
  const anchor = anchors.indexOf(value);
  if (anchor >= 0) {w.varuint(anchor + 1); return;}
  const q = Math.round(value * scale), base = Math.round((previous ?? 0) * scale), restored = q / scale;
  const keepsOrder = anchors.every(a => Math.sign(value - a) === Math.sign(restored - a));
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(base) || !keepsOrder) {w.varuint(0); w.f64(value); return;}
  const residual = q - base;
  w.varuint(anchors.length + 1 + (residual >= 0 ? residual * 2 : -residual * 2 - 1));
}
function readHot(r: ByteReader, previous: number | undefined, scale: number, anchors: readonly number[]) {
  const header = r.varuint();
  if (header === 0) return r.f64();
  if (header <= anchors.length) return anchors[header - 1];
  const z = header - anchors.length - 1, residual = z % 2 ? -(z + 1) / 2 : z / 2;
  return (Math.round((previous ?? 0) * scale) + residual) / scale;
}
function aircraftAnchors(shared: readonly number[], aircraft: Partial<Aircraft> | undefined) {
  const origin = aircraft?.originDeparture?.elevation;
  return typeof origin === "number" && !shared.includes(origin) ? [...shared, origin] : shared;
}

export interface FrameOptions {
  /** Live frames keep every number exactly; replays quantise aircraft motion. */
  exact?: boolean;
  /** Extra values kept exact, such as the airport elevation. */
  anchors?: readonly number[];
}
function writeAircraftChange(codec: ValueCodec, before: Aircraft | undefined, value: Partial<Aircraft>, unset: readonly string[], options: FrameOptions, shared: readonly number[]) {
  const w = codec.w, hot = new Map<HotName, number>(), generic: [string, unknown][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (!options.exact && key === "position" && isPoint(item) && isPoint(before?.position)) {
      if (item.x !== before.position.x) hot.set("x", item.x);
      if (item.y !== before.position.y) hot.set("y", item.y);
    } else if (!options.exact && key === "fuel" && isFuel(item) && isFuel(before?.fuel) && sameExcept(item, before.fuel, "enduranceMinutes")) {
      hot.set("enduranceMinutes", item.enduranceMinutes);
    } else if (!options.exact && typeof item === "number" && Number.isFinite(item) && HOT.some(([name]) => name === key && name !== "x" && name !== "y" && name !== "enduranceMinutes")) {
      hot.set(key as HotName, item);
    } else generic.push([key, item]);
  }
  // Generic fields first: the decoder needs them (such as originDeparture) before reading hot values.
  w.varuint(generic.length);
  for (const [key, item] of generic) writeField(codec, key, before?.[key as keyof Aircraft], item);
  w.varuint(unset.length);
  for (const key of unset) codec.str(key);
  let mask = 0;
  HOT.forEach(([name], bit) => {if (hot.has(name)) mask |= 1 << bit;});
  w.varuint(mask);
  if (!mask) return;
  const merged = {...before, ...Object.fromEntries(generic)} as Partial<Aircraft>, anchors = aircraftAnchors(shared, merged);
  for (const [name, scale] of HOT) if (hot.has(name)) writeHot(w, hot.get(name)!, hotValue(before, name), scale, anchors);
}
function readAircraftChange(decoder: ValueDecoder, before: Aircraft | undefined, shared: readonly number[]) {
  const r = decoder.r, value: Record<string, unknown> = {};
  for (let count = r.varuint(); count > 0; count--) {const key = decoder.str(); value[key] = readField(decoder, before?.[key as keyof Aircraft]);}
  const unset: string[] = [];
  for (let count = r.varuint(); count > 0; count--) unset.push(decoder.str());
  const mask = r.varuint();
  if (mask) {
    if (!before) throw new RangeError("Aircraft motion without a previous aircraft");
    const anchors = aircraftAnchors(shared, {...before, ...value} as Partial<Aircraft>);
    let position: {x: number; y: number} | undefined;
    HOT.forEach(([name, scale], bit) => {
      if (!(mask & 1 << bit)) return;
      const number = readHot(r, hotValue(before, name), scale, anchors);
      if (name === "x" || name === "y") {position ??= {...before.position}; position[name] = number;}
      else if (name === "enduranceMinutes") value.fuel = {...before.fuel!, enduranceMinutes: number};
      else value[name] = number;
    });
    if (position) value.position = position;
  }
  return {value: value as Partial<Aircraft>, unset: unset as (keyof Aircraft)[]};
}

// Bit 16 marks exact (live stream) frames. Bit 32 carries delta fields this version has no slot for,
// so features can add replay records (as an extra ReplayDelta key) without a format change.
const enum FrameFlag {Interpolate = 1, Demo = 2, Unset = 4, Anchors = 8, Exact = 16, Extensions = 32}
const CORE_DELTA_KEYS = new Set(["state", "unset", "aircraft", "demo"]);
const extensionsOf = (delta: ReplayDelta) => Object.entries(delta).filter(([key, value]) => !CORE_DELTA_KEYS.has(key) && value !== undefined);
const enum AircraftKind {Change, New, Remove}
/** One replay frame against the state it applies to. Frames are independent: each has its own string table. */
export function encodeReplayFrame(before: Exercise, frame: ReplayFrame, options: FrameOptions = {}, identities?: Set<string>) {
  const codec = new ValueCodec(), w = codec.w, delta = frame.delta;
  const anchors = [...BASE_ANCHORS, ...(options.anchors ?? []).filter(value => Number.isFinite(value) && !BASE_ANCHORS.includes(value))];
  const extra = anchors.slice(BASE_ANCHORS.length);
  const extensions = extensionsOf(delta);
  w.u8((frame.interpolate ? FrameFlag.Interpolate : 0) | (delta.demo?.length ? FrameFlag.Demo : 0) | (delta.unset?.length ? FrameFlag.Unset : 0) | (extra.length ? FrameFlag.Anchors : 0)
    | (options.exact ? FrameFlag.Exact : 0) | (extensions.length ? FrameFlag.Extensions : 0));
  w.varuint(frame.sequence);
  codec.number(frame.at);
  if (extra.length) {w.varuint(extra.length); for (const value of extra) w.f64(value);}
  const state = Object.entries(delta.state).filter(([, value]) => value !== undefined);
  w.varuint(state.length);
  for (const [key, value] of state) writeField(codec, key, before[key as keyof Exercise], value);
  if (delta.unset?.length) {w.varuint(delta.unset.length); for (const key of delta.unset) codec.str(key);}
  const aircraft = new Map(before.aircraft.map(a => [a.id, a])), indexes = new Map(before.aircraft.map((a, index) => [a.id, index]));
  w.varuint(delta.aircraft.length);
  for (const change of delta.aircraft) {
    // Known aircraft are referenced by their place in the previous state; IDs are long.
    const index = indexes.get(change.id);
    if (index !== undefined) w.varuint(index + 1); else {w.varuint(0); codec.str(change.id);}
    if (change.remove) w.u8(AircraftKind.Remove);
    else if (!aircraft.has(change.id)) {w.u8(AircraftKind.New); codec.value(change.value ?? {});}
    else {w.u8(AircraftKind.Change); writeAircraftChange(codec, aircraft.get(change.id), change.value ?? {}, change.unset ?? [], options, anchors);}
  }
  if (delta.demo?.length) codec.value(delta.demo);
  if (extensions.length) codec.value(Object.fromEntries(extensions));
  for (const id of codec.identities) identities?.add(id);
  return w.finish();
}
export function decodeReplayFrame(r: ByteReader, before: Exercise): ReplayFrame {
  const decoder = new ValueDecoder(r), flags = r.u8();
  const sequence = r.varuint(), at = decoder.value() as number;
  if (typeof at !== "number") throw new RangeError("Invalid frame time");
  const anchors = [...BASE_ANCHORS];
  if (flags & FrameFlag.Anchors) for (let count = r.varuint(); count > 0; count--) anchors.push(r.f64());
  const state: Record<string, unknown> = {};
  for (let count = r.varuint(); count > 0; count--) {const key = decoder.str(); if (key === "__proto__") throw new RangeError("Invalid key"); state[key] = readField(decoder, before[key as keyof Exercise]);}
  const delta: ReplayDelta = {state: state as ReplayDelta["state"], aircraft: []};
  if (flags & FrameFlag.Unset) {const unset: string[] = []; for (let count = r.varuint(); count > 0; count--) unset.push(decoder.str()); delta.unset = unset as (keyof Exercise)[];}
  const aircraft = new Map(before.aircraft.map(a => [a.id, a]));
  for (let count = r.varuint(); count > 0; count--) {
    const index = r.varuint(), id = index ? before.aircraft[index - 1]?.id : decoder.str(), kind = r.u8();
    if (id === undefined) throw new RangeError("Aircraft reference out of range");
    if (kind === AircraftKind.Remove) delta.aircraft.push({id, remove: true});
    else if (kind === AircraftKind.New) delta.aircraft.push({id, value: decoder.value() as Partial<Aircraft>});
    else if (kind === AircraftKind.Change) {
      const {value, unset} = readAircraftChange(decoder, aircraft.get(id), anchors);
      delta.aircraft.push({id, value, ...(unset.length ? {unset} : {})});
    } else throw new RangeError("Unknown aircraft change");
  }
  if (flags & FrameFlag.Demo) delta.demo = decoder.value() as ReplayDelta["demo"];
  if (flags & FrameFlag.Extensions) {
    const extensions = decoder.value();
    if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) throw new RangeError("Invalid frame extensions");
    for (const [key, value] of Object.entries(extensions)) if (!CORE_DELTA_KEYS.has(key) && key !== "__proto__") (delta as unknown as Record<string, unknown>)[key] = value;
  }
  if (flags & ~63) throw new RangeError("Unknown frame flags");
  return {sequence, at, delta, interpolate: !!(flags & FrameFlag.Interpolate)};
}

/** Apply a delta the way replays do (kept here so streams need not import replay helpers). */
export function applyDelta(before: Exercise, delta: ReplayDelta): Exercise {
  const aircraft = new Map(before.aircraft.map(a => [a.id, a]));
  for (const change of delta.aircraft) {
    if (change.remove) aircraft.delete(change.id);
    else {
      const value = {...aircraft.get(change.id), ...change.value} as Aircraft;
      for (const key of change.unset ?? []) delete value[key];
      aircraft.set(change.id, value);
    }
  }
  const next = {...before, ...delta.state, aircraft: [...aircraft.values()]};
  for (const key of delta.unset ?? []) delete (next as Partial<Exercise>)[key];
  return next;
}
/** Decode back-to-back frames, applying each to the state for the next. */
export function decodeReplayFrames(data: Uint8Array, start: Exercise, onFrame?: (frame: ReplayFrame, state: Exercise) => void) {
  const r = new ByteReader(data), frames: ReplayFrame[] = [];
  let state = start;
  while (!r.done) {const frame = decodeReplayFrame(r, state); state = applyDelta(state, frame.delta); frames.push(frame); onFrame?.(frame, state);}
  return {frames, state};
}
export function concatBytes(parts: readonly Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {result.set(part, offset); offset += part.length;}
  return result;
}

/** Hot fields reproduce within half a quantisation step; everything else must match exactly. */
export function framesMatch(original: ReplayDelta, decoded: ReplayDelta) {
  if (JSON.stringify(original.state) !== JSON.stringify(decoded.state) || JSON.stringify(original.unset ?? []) !== JSON.stringify(decoded.unset ?? [])
    || JSON.stringify(original.demo ?? []) !== JSON.stringify(decoded.demo ?? []) || JSON.stringify(extensionsOf(original)) !== JSON.stringify(extensionsOf(decoded)) || original.aircraft.length !== decoded.aircraft.length) return false;
  return original.aircraft.every((change, index) => {
    const other = decoded.aircraft[index];
    if (other.id !== change.id || !!other.remove !== !!change.remove || JSON.stringify(change.unset ?? []) !== JSON.stringify(other.unset ?? [])) return false;
    const a = (change.value ?? {}) as Record<string, unknown>, b = (other.value ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter(key => a[key] !== undefined || b[key] !== undefined));
    for (const key of keys) {
      const left = a[key], right = b[key];
      if (key === "position" && isPoint(left) && isPoint(right)) {if (Math.abs(left.x - right.x) > .0005 + 1e-9 || Math.abs(left.y - right.y) > .0005 + 1e-9) return false; continue;}
      if (key === "fuel" && isFuel(left) && isFuel(right)) {if (!sameExcept(left, right, "enduranceMinutes") || Math.abs(left.enduranceMinutes - right.enduranceMinutes) > .005 + 1e-9) return false; continue;}
      const scale = HOT.find(([name]) => name === key)?.[1];
      if (scale && typeof left === "number" && typeof right === "number") {if (Math.abs(left - right) > .5 / scale + 1e-9) return false; continue;}
      if (JSON.stringify(left) !== JSON.stringify(right)) return false;
    }
    return true;
  });
}
