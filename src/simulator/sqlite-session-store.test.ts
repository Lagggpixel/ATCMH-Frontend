import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSweatboxDb} from '../../storage/create-local-sweatbox-db.mjs';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {assignedMentee, sqlSessionStore} from './server/session-store';
import {initialExercise} from './engine';
import {closeSimulatorStorage, queryReadOnly} from '../lib/simulator-db';
import {blankScenario} from './scenarios';
import {SessionError} from './sessions';
import {withSweatboxRuntime} from './server/runtime-gateway';
import {createRuntimeHandler} from './server/runtime-handler';
import {createRuntimeServer} from './server/runtime-http';
import {authorizeDelegation, delegationHeaders} from './server/runtime-identity';
import {hasReplayReference} from './server/airport-reference-auth';

test('SQLite session updates serialize, rollback with replay changes, and survive reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sqlite-session-'));
  const path = join(directory, 'simulator.sqlite');
  createLocalSweatboxDb(path);
  const previous = process.env.SIMULATOR_SQLITE_PATH;
  process.env.SIMULATOR_SQLITE_PATH = path;
  try {
    const id = randomUUID();
    await sqlSessionStore.create({id, ownerId: 'owner', title: 'SQLite regression', createdAt: 100, updatedAt: 100, tickAt: 100, contentRevision: 0, exercise: initialExercise(id), staff: null, mentee: null});
    await Promise.all(Array.from({length: 12}, () => sqlSessionStore.transaction(id, async record => {
      await new Promise(resolve => setTimeout(resolve, 1));
      record.updatedAt++;
    })));
    assert.equal((await sqlSessionStore.read(id)).updatedAt, 112);
    await assert.rejects(sqlSessionStore.transaction(id, record => {record.updatedAt = 999; record.exercise.elapsed = 50; throw new Error('abort transaction');}), /abort transaction/);
    assert.equal((await sqlSessionStore.read(id)).updatedAt, 112);
    await sqlSessionStore.transaction(id, record => {record.exercise.elapsed = 2; record.updatedAt = 200;});
    const frames = await queryReadOnly('SELECT sequence_no FROM simulator_replay_frames');
    assert.equal(frames.length, 1);
    await closeSimulatorStorage();
    const reloaded = await sqlSessionStore.read(id);
    assert.equal(reloaded.exercise.elapsed, 2);
    assert.equal(reloaded.updatedAt, 200);
  } finally {
    await closeSimulatorStorage();
    if (previous === undefined) delete process.env.SIMULATOR_SQLITE_PATH; else process.env.SIMULATOR_SQLITE_PATH = previous;
    rmSync(directory, {recursive: true});
  }
});

test('local gateway authenticates and drives a SQLite session over HTTP through archive', {timeout: 20_000}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sweatbox-runtime-'));
  const path = join(directory, 'simulator.sqlite');
  createLocalSweatboxDb(path);
  const key = randomUUID() + randomUUID();
  const mentor = {accountId: 'mentor', staff: false, canAssign: true};
  const learner = {accountId: 'learner', staff: false, discordId: '123456789012345', simulatorAccess: false};
  const forged = delegationHeaders(mentor);
  const settings = {SIMULATOR_SQLITE_PATH: path, SWEATBOX_RUNTIME_KEY: key};
  const prior = new Map([...Object.keys(settings), 'SWEATBOX_RUNTIME_URL', 'EXAMS_AUTH_KEY', 'SPEECH_SERVICE_URL'].map(name => [name, process.env[name]]));
  Object.assign(process.env, settings);
  delete process.env.EXAMS_AUTH_KEY;
  delete process.env.SPEECH_SERVICE_URL;
  const runtime = createRuntimeHandler(key, async airport => ({airport, fetchedAt: '', atis: [], warnings: []}));
  const server = createRuntimeServer(request => {
    assert.equal(request.headers.has('cookie'), false);
    assert.equal(request.headers.has('x-csrf-token'), false);
    return runtime(request);
  });
  try {
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    process.env.SWEATBOX_RUNTIME_URL = origin;
    const api = withSweatboxRuntime(async () => assert.fail('Runtime requests must never fall back to the web process'), async request => {
      const cookie = request.headers.get('cookie');
      if (cookie === 'mentor') return mentor;
      if (cookie === 'learner') return learner;
      throw new SessionError('unauthorized', 'Sign in', 401);
    });
    const call = (route: string, method = 'GET', body?: unknown, cookie = 'mentor', headers = {}) => api(new Request(`http://atcmh.test/api/simulator/${route}`, {
      method, headers: {cookie, 'x-csrf-token': 'browser-only', ...headers}, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(7000),
    }));
    const json = async (response: Response) => {
      const value = await response.json();
      assert.equal(response.status, 200, JSON.stringify(value));
      return value;
    };
    assert.equal((await fetch(origin + '/api/simulator/sessions', {headers: forged})).status, 401);
    assert.equal((await call('sessions', 'GET', undefined, '', forged)).status, 401);
    assert.equal((await call('sessions', 'GET', undefined, 'learner', forged)).status, 403);
    const {scenario} = await json(await call('training/scenarios', 'POST', {draft: {...blankScenario(), title: 'Runtime rehearsal'}}));
    const scenarioPath = `training/scenarios/${scenario.id}`;
    const published = await json(await call(scenarioPath, 'POST', {action: 'publish', version: scenario.version}));
    const launch = {action: 'launch', revision: published.scenario.publishedRevision, requestId: randomUUID()};
    const {sessionId} = await json(await call(scenarioPath, 'POST', launch));
    assert.deepEqual(await json(await call(scenarioPath, 'POST', launch)), {sessionId});
    const sessionPath = `sessions/${sessionId}`;
    const mentorSeat = {role: 'staff', token: randomUUID()};
    const learnerSeat = {role: 'mentee', token: randomUUID()};
    assert.equal(await assignedMentee.hasAssignment(learner.discordId), false);
    assert.equal((await call(sessionPath + '/join', 'POST', learnerSeat, 'learner')).status, 403);
    await json(await call(sessionPath + '/assign', 'POST', {mentee: {discordId: learner.discordId}}));
    assert.equal(await assignedMentee.hasAssignment(learner.discordId), true);
    assert.equal(await hasReplayReference(learner.accountId, 'EGPH'), false);
    await json(await call(sessionPath + '/join', 'POST', learnerSeat, 'learner'));
    await json(await call(sessionPath + '/join', 'POST', mentorSeat));
    assert.equal((await call(sessionPath + '/join', 'POST', {...mentorSeat, token: randomUUID()})).status, 409);
    const play = {...mentorSeat, envelope: {id: randomUUID(), time: Date.now(), action: {kind: 'play'}}};
    await json(await call(sessionPath + '/commands', 'POST', play));
    const streamHeaders = {'x-simulator-role': 'staff', 'x-simulator-seat': mentorSeat.token};
    for (let connection = 0; connection < 2; connection++) {
      const stream = await call(sessionPath + '/stream', 'GET', undefined, 'mentor', streamHeaders);
      assert.match(stream.headers.get('content-type') ?? '', /^text\/event-stream/);
      const reader = stream.body!.getReader();
      try {
        const decoder = new TextDecoder();
        let frames = '';
        while (!frames.includes('"type":"motion"')) {
          const chunk = await reader.read();
          assert.equal(chunk.done, false, frames);
          frames += decoder.decode(chunk.value, {stream: true});
        }
        assert.match(frames, /"type":"snapshot"/);
      } finally {await reader.cancel();}
    }
    await json(await call(sessionPath, 'DELETE'));
    const {replays} = await json(await call('replays'));
    assert.equal(replays[0].title, 'Runtime rehearsal');
    const detail = await json(await call(`replays/${replays[0].id}?scope=self`, 'GET', undefined, 'learner'));
    assert.equal(detail.initial.id, sessionId);
    assert.ok(detail.frames.length > 0);
    assert.equal(await assignedMentee.hasAssignment(learner.discordId), false);
    assert.equal(await hasReplayReference(learner.accountId, 'EGPH'), true);
    assert.equal(await hasReplayReference(learner.accountId, 'KJFK'), false);
    assert.equal(await hasReplayReference(mentor.accountId, 'EGPH'), false);
    assert.equal((await call(sessionPath + '/join', 'POST', mentorSeat)).status, 410);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal((await call('sessions')).status, 503);
  } finally {
    server.close();
    server.closeAllConnections();
    await closeSimulatorStorage();
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(directory, {recursive: true});
  }
});

test('delegated identity expires so live streams must recheck browser access on reconnect', async () => {
  const request = new Request('http://127.0.0.1', {headers: delegationHeaders({accountId: 'mentor', staff: false}, 1000)});
  assert.equal((await authorizeDelegation(request, true, {}, 60_999)).staff, true);
  await assert.rejects(authorizeDelegation(request, true, {}, 61_000), {status: 503});
});
