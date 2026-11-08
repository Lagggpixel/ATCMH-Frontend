import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {MemoryStore} from "./session-test-store";
import {rewoundExercise, SessionService} from "./server/session-service";
import {applyEnvelope, initialExercise, newAircraft} from "./engine";
import {advanceScenario} from "./scenario-engine";
import {blankScenario, createScenarioExercise, seedFromAircraft} from "./scenarios";
import {recordedStateAt, replayDelta, replayState, type ReplayDelta} from "./replays";
import type {Action, Exercise} from "./model";

/** A stand-in for the replay table: every frame read records the state, as the SQL store does on save. */
function recorder(store: MemoryStore) {
  let initial: Exercise | undefined, last: Exercise | undefined;
  const deltas: ReplayDelta[] = [];
  return {
    capture(id: string) {
      const state = replayState(store.records.get(id)!.exercise);
      if (!initial) initial = state; else deltas.push(replayDelta(last!, state));
      last = state;
    },
    history: async (_id: string, elapsed: number) => initial ? recordedStateAt(initial, deltas, elapsed) : null,
  };
}

test("mentors rewind the live session from its recording; it pauses there and keeps the session settings", async () => {
  let time = 1_000_000;
  const store = new MemoryStore(), staff = {accountId: "1", staff: true}, mentee = {accountId: "2", staff: false};
  const recording = recorder(store);
  const service = new SessionService(store, () => time, undefined, undefined, undefined, undefined, recording.history);
  const session = await service.create(staff, "Rewind"), control = randomUUID(), student = randomUUID();
  await service.join(staff, session.id, "staff", control); await service.join(mentee, session.id, "mentee", student);
  const send = (action: Action, role: "staff" | "mentee" = "staff") => service.dispatch(role === "staff" ? staff : mentee, session.id, role, role === "staff" ? control : student, {id: randomUUID(), time, action});
  await send({kind: "play"}); recording.capture(session.id);
  for (let i = 0; i < 40; i++) {time += 1000; await service.frame(staff, session.id, "staff", control); recording.capture(session.id);}
  const at40 = store.records.get(session.id)!.exercise;
  assert.ok(at40.elapsed > 39);
  await send({kind: "time-scale", scale: 2});
  await assert.rejects(send({kind: "rewind", seconds: 30}, "mentee"), {code: "forbidden"});
  const unrecorded = new SessionService(store, () => time);
  await assert.rejects(unrecorded.dispatch(staff, session.id, "staff", control, {id: randomUUID(), time, action: {kind: "rewind", seconds: 10}}), {code: "rewind-unavailable"});

  const rewindEnvelope = {id: randomUUID(), time, action: {kind: "rewind", seconds: 30} as const};
  await service.dispatch(staff, session.id, "staff", control, rewindEnvelope);
  const rewound = store.records.get(session.id)!.exercise;
  // A retry of the same envelope, as after a dropped response, returns the first result without moving again.
  await service.dispatch(staff, session.id, "staff", control, rewindEnvelope);
  assert.equal(store.records.get(session.id)!.exercise.elapsed, rewound.elapsed, "the retry does not rewind twice");
  assert.equal(store.records.get(session.id)!.exercise.revision, rewound.revision);
  assert.ok(rewound.elapsed <= at40.elapsed - 29 && rewound.elapsed >= at40.elapsed - 32, `rewound to ${rewound.elapsed}`);
  assert.equal(rewound.running, false); assert.equal(rewound.pausedByStaff, true); assert.equal(rewound.pauseVisibility, "visible");
  assert.equal(rewound.timeScale, 2, "the speed setting is kept");
  assert.ok(rewound.revision > at40.revision);
  assert.ok(rewound.rewind && rewound.rewind.to === rewound.elapsed && rewound.rewind.from >= at40.elapsed);
  assert.notDeepEqual(rewound.aircraft[0].position, at40.aircraft[0].position);

  // At double speed, one second of real time is two seconds of exercise time.
  await send({kind: "play"});
  const resumed = store.records.get(session.id)!.exercise.elapsed;
  time += 1000; await service.frame(staff, session.id, "staff", control);
  assert.ok(Math.abs(store.records.get(session.id)!.exercise.elapsed - resumed - 2) < .01);
});

test("a rewind keeps recording into the same replay, while a reset starts a new one", async () => {
  const {recordReplay} = await import("./server/replay-store");
  const {initialExercise} = await import("./engine");
  const replays: Record<string, unknown>[] = [], frames: unknown[][] = [];
  const connection = {async execute(sql: string, values: (string | number | null)[]): Promise<[unknown, unknown]> {
    if (sql.startsWith("SELECT")) return [replays.filter(r => r.session_id === values[0] && r.status === "recording").slice(-1), null];
    if (sql.startsWith("INSERT INTO simulator_replays ")) replays.push({id: values[0], session_id: values[1], status: "recording", duration: 0, sequence_no: 0, content_revision: values[7], initial_state: values[8], last_state: values[9], participants: values[10]});
    else if (sql.startsWith("INSERT INTO simulator_replay_frames")) frames.push(values);
    else if (sql.startsWith("UPDATE simulator_replays SET last_state")) Object.assign(replays.find(r => r.id === values[4])!, {last_state: values[0], sequence_no: values[1], duration: values[2], content_revision: values[3]});
    else if (sql.startsWith("UPDATE simulator_replays SET status")) Object.assign(replays.find(r => r.id === values[3])!, {status: values[0]});
    return [[], null];
  }};
  const record = (exercise: Exercise, contentRevision: number) => ({id: "s", ownerId: "o", title: "T", createdAt: 0, updatedAt: 0, tickAt: 0, contentRevision, exercise, staff: null, mentee: null});
  const start = {...initialExercise("rec"), elapsed: 60};
  await recordReplay(connection, record(start, 1));
  const back = {...start, elapsed: 30, rewind: {id: "r1", from: 60, to: 30}};
  await recordReplay(connection, record(back, 2), record(start, 1));
  assert.equal(replays.length, 1, "the rewind stays in the same recording");
  assert.equal(frames.length, 1);
  await recordReplay(connection, record({...back, elapsed: 10}, 3), record(back, 2));
  assert.equal(replays.length, 2, "going back without a new rewind is a reset");
  assert.equal(replays[0].status, "reset");
});

test("rewinding re-arms the pending readbacks of automatic pilots and keeps each pilot's current setting", () => {
  const send = (state: Exercise, action: Action) => {const result = applyEnvelope(state, {id: randomUUID(), time: 0, action}); assert.equal(result.error, undefined); return result.state;};
  let past = send({...initialExercise("rewind-readback"), running: true}, {kind: "auto-readback", enabled: true});
  past = send(past, {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "cleared to land", command: {type: "land", runway: "24", number: 1}});
  const pending = past.messages.at(-1)!;
  // Recorded frames drop the timer; the live session has since flown the aircraft by hand.
  delete pending.autoReadbackAt;
  let current = send({...past, elapsed: past.elapsed + 60}, {kind: "aircraft-automatic", aircraftId: demoOther(past), enabled: false});
  current = {...current, revision: 50};
  const next = rewoundExercise(current, past, "rewind-1");
  assert.ok(next.messages.find(m => m.id === pending.id)!.autoReadbackAt !== undefined, "the outstanding instruction reads back after resuming");
  assert.equal(next.aircraft.find(a => a.id === demoOther(past))!.automatic, false, "the current per-aircraft setting is kept");
  assert.equal(next.revision, 51);
  assert.equal(next.processed.at(-1), "rewind-1");
  assert.ok(!next.processed.includes("rewind-1:readbacks"));
});
const demoOther = (state: Exercise) => state.aircraft.find(a => a.id !== "demo-air")!.id;

test("a scenario transmission that ran after the rewind point is sent again when the session reaches it", () => {
  const air = newAircraft("air", true); Object.assign(air, {mode: "heading", heading: 90, targetHeading: 90, altitude: 1500, targetAltitude: 1500, frequency: "tower"});
  const definition = {...blankScenario(), title: "Rewind", aircraft: [{key: "air", initial: true, seed: seedFromAircraft(air)}], events: [{id: "call", title: "Call", trigger: {type: "time" as const, at: 20}, actions: [{type: "transmission" as const, aircraftKey: "air", text: "Request higher"}]}]};
  const {runtime, exercise} = createScenarioExercise(definition, "session", randomUUID());
  let clock = 0;
  const run = (from: Exercise, until: number) => {let s = {...from, running: true}; while (s.elapsed < until) s = advanceScenario(s, runtime, 1, clock += 1000).exercise; return s;};
  let state = run(exercise, 10);
  const past = structuredClone(state);
  state = run(state, 25);
  const calls = (s: Exercise) => s.messages.filter(m => m.text.includes("Request higher")).length;
  assert.equal(calls(state), 1); assert.equal(runtime.events.call.status, "completed");
  let rewound = rewoundExercise(state, past, "rewind-call", runtime);
  assert.equal(runtime.events.call.status, "scheduled");
  assert.equal(calls(rewound), 0);
  rewound = run(rewound, 25);
  assert.equal(calls(rewound), 1, "the rearmed event's transmission is applied, not skipped as already processed");
});

test("automatic readbacks keep their real-time delay at 2× and 4×, including a speed change while one is pending", async () => {
  for (const scale of [2, 4] as const) {
    let time = 2_000_000;
    const store = new MemoryStore(), staff = {accountId: "1", staff: true};
    const service = new SessionService(store, () => time);
    const session = await service.create(staff, "Speed"), control = randomUUID();
    await service.join(staff, session.id, "staff", control);
    const send = (action: Action) => service.dispatch(staff, session.id, "staff", control, {id: randomUUID(), time, action});
    const frame = async (ms: number) => {time += ms; await service.frame(staff, session.id, "staff", control); return store.records.get(session.id)!.exercise;};
    const readbacks = (state: Exercise) => state.messages.filter(m => m.sender === "pilot" && m.commandId !== undefined).length;
    await send({kind: "auto-readback", enabled: true}); await send({kind: "play"}); await send({kind: "time-scale", scale});
    const aircraftId = store.records.get(session.id)!.exercise.aircraft[0].id;
    await send({kind: "command", aircraftId, frequency: "tower", text: "cleared to land", command: {type: "land", runway: "24", number: 1}});
    let state = await frame(400);
    assert.equal(readbacks(state), 0, `no reply after 400 ms at ${scale}×`);
    state = await frame(900);
    assert.equal(readbacks(state), 0, `no reply after 1.3 real seconds at ${scale}×`);
    state = await frame(400);
    assert.equal(readbacks(state), 1, `the reply arrives after 1.5 real seconds at ${scale}×`);
    // Speeding up while a readback is pending keeps its remaining real-time wait.
    await send({kind: "time-scale", scale: 1});
    await send({kind: "command", aircraftId, frequency: "tower", text: "cleared to land", command: {type: "land", runway: "24", number: 1}});
    await frame(500); await send({kind: "time-scale", scale});
    state = await frame(800);
    assert.equal(readbacks(state), 1, `still waiting after a change to ${scale}× with 0.2 s of real time to go`);
    state = await frame(400);
    assert.equal(readbacks(state), 2);
  }
});
