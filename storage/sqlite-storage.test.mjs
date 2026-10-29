import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {existsSync} from 'node:fs';
import {importSimulator, tables} from './import-simulator.mjs';

test('SQLite worker preserves commits, rolls back failed updates, and supports simulator JSON queries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'simulator-sqlite-'));
  const path = join(directory, 'simulator.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE simulator_storage_version(version INTEGER); INSERT INTO simulator_storage_version VALUES(1); CREATE TABLE sessions(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);');
  db.close();
  const worker = new Worker(new URL('./sqlite-worker.mjs', import.meta.url), {workerData: {path}});
  let id = 0;
  const waiting = new Map();
  worker.on('message', message => {const job = waiting.get(message.id); waiting.delete(message.id); if (message.error) job.reject(new Error(message.error)); else job.resolve(message.result);});
  worker.on('error', error => {for (const job of waiting.values()) job.reject(error); waiting.clear();});
  const request = value => new Promise((resolve, reject) => {const key = ++id; waiting.set(key, {resolve, reject}); worker.postMessage({id: key, ...value});});
  try {
    await request({operation: 'BEGIN IMMEDIATE'});
    const state = JSON.stringify({airport: 'EGLL', running: true, aircraft: [], positions: [{id: 'a'}]});
    await request({sql: 'INSERT INTO sessions VALUES (?,?)', values: ['s', state]});
    await request({operation: 'COMMIT'});
    await request({operation: 'BEGIN IMMEDIATE'});
    await request({sql: 'DELETE FROM sessions'});
    await request({operation: 'ROLLBACK'});
    const rows = await request({sql: "SELECT JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airport')) AS airport, JSON_LENGTH(JSON_EXTRACT(snapshot,'$.positions')) AS count FROM sessions WHERE id=? FOR UPDATE", values: ['s']});
    assert.deepEqual(rows, [{airport: 'EGLL', count: 1}]);
    assert.deepEqual(await request({sql: 'SELECT JSON_CONTAINS(?,?) AS matched', values: ['[{"role":"mentee","accountId":"a"}]', '{"accountId":"a"}']}), [{matched: 1}]);
    assert.deepEqual(await request({sql: "SELECT JSON_SEARCH(?, 'one', ?, NULL, '$.*.assignment.accountId') AS found", values: ['{"p":{"assignment":{"accountId":"a"}}}', 'a']}), [{found: '"$.p.assignment.accountId"'}]);
    await assert.rejects(request({sql: 'INSERT INTO sessions VALUES (?,?)', values: ['s', state]}), /UNIQUE/);
    assert.deepEqual(await request({sql: 'SELECT snapshot FROM sessions'}), [{snapshot: state}]);
  } finally {await worker.terminate(); rmSync(directory, {recursive: true});}
});

test('SQLite worker refuses to create an empty production database', async () => {
  const worker = new Worker(new URL('./sqlite-worker.mjs', import.meta.url), {workerData: {path: join(tmpdir(), `missing-simulator-${crypto.randomUUID()}.sqlite`)}});
  await new Promise(resolve => worker.once('error', error => {assert.match(error.message, /has not been imported/); resolve();}));
  await worker.terminate();
});

test('Importer verifies paginated records, preserves uniqueness and defaults, and rejects replacement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'simulator-import-'));
  const destination = join(directory, 'simulator.sqlite');
  const records = Array.from({length: 503}, (_, id) => ({id, snapshot: JSON.stringify({id, text: 'Unicode ✈ quote \' and null', optional: null})}));
  const source = {
    async execute(sql) {
      if (sql.includes('COLUMNS')) return [[{COLUMN_NAME: 'id', DATA_TYPE: 'int', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null}, {COLUMN_NAME: 'snapshot', DATA_TYPE: 'longtext', IS_NULLABLE: 'NO', COLUMN_DEFAULT: "'{}'"}]];
      if (sql.includes('STATISTICS')) return [[{INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0, COLUMN_NAME: 'id', SEQ_IN_INDEX: 1}]];
      return [[]];
    },
    async query(sql, values = []) {if (!sql.startsWith('SELECT')) return []; const offset = values.length ? values[0] + 1 : 0; return [records.slice(offset, offset + 250)];},
    async rollback() {},
  };
  try {
    const result = await importSimulator(source, destination);
    assert.equal(result.length, tables.length);
    assert.ok(result.every(row => row.rows === 503));
    const db = new DatabaseSync(destination);
    assert.equal(db.prepare('SELECT count(*) n FROM simulator_sessions').get().n, 503);
    assert.equal(db.prepare('SELECT snapshot FROM simulator_sessions WHERE id=502').get().snapshot, records[502].snapshot);
    assert.throws(() => db.prepare('INSERT INTO simulator_sessions(id) VALUES(0)').run(), /UNIQUE/);
    db.close();
    await assert.rejects(importSimulator(source, destination), /new absolute destination/);
    assert.equal(existsSync(destination + '.importing'), false);
  } finally {rmSync(directory, {recursive: true});}
});

test('Importer discards an incomplete copy after a source failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'simulator-import-failed-'));
  const destination = join(directory, 'simulator.sqlite');
  try {
    await assert.rejects(importSimulator({async query() {}, async execute() {throw new Error('source unavailable');}, async rollback() {}}, destination), /source unavailable/);
    assert.equal(existsSync(destination), false);
    assert.equal(existsSync(destination + '.importing'), false);
  } finally {rmSync(directory, {recursive: true});}
});

test('Composite replay keys preserve every row when a page crosses recording boundaries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'simulator-composite-import-'));
  const destination = join(directory, 'simulator.sqlite');
  const records = Array.from({length: 503}, (_, index) => ({replay_id: index < 300 ? 'a' : 'b', sequence_no: index < 300 ? index : index - 300, delta: JSON.stringify({index})}));
  const source = {
    async execute(sql) {
      if (sql.includes('COLUMNS')) return [[{COLUMN_NAME: 'replay_id', DATA_TYPE: 'varchar', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null}, {COLUMN_NAME: 'sequence_no', DATA_TYPE: 'bigint', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null}, {COLUMN_NAME: 'delta', DATA_TYPE: 'longtext', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null}]];
      if (sql.includes('STATISTICS')) return [[{INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0, COLUMN_NAME: 'replay_id', SEQ_IN_INDEX: 1}, {INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0, COLUMN_NAME: 'sequence_no', SEQ_IN_INDEX: 2}]];
      return [[]];
    },
    async query(sql, values = []) {
      if (!sql.startsWith('SELECT')) return [];
      if (values.length) {
        assert.match(sql, /WHERE \(`replay_id`>\?\) OR \(`replay_id`=\? AND `sequence_no`>\?\)/);
        assert.equal(values[0], values[1]);
      }
      return [records.filter(row => !values.length || row.replay_id > values[0] || row.replay_id === values[1] && row.sequence_no > values[2]).slice(0, 250)];
    },
    async rollback() {},
  };
  try {
    const result = await importSimulator(source, destination);
    assert.ok(result.every(row => row.rows === 503));
    const database = new DatabaseSync(destination);
    assert.deepEqual(database.prepare('SELECT replay_id,sequence_no,delta FROM simulator_replay_frames ORDER BY replay_id,sequence_no').all().map(row => ({...row})), records);
    database.close();
  } finally {rmSync(directory, {recursive: true});}
});
