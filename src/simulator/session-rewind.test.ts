import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";
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

  await send({kind: "rewind", seconds: 30});
  const rewound = store.records.get(session.id)!.exercise;
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
