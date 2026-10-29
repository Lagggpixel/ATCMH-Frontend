import {AsyncLocalStorage} from 'node:async_hooks';
import {Worker} from 'node:worker_threads';
import {resolve, isAbsolute} from 'node:path';
import type {PoolConnection, RowDataPacket} from 'mysql2/promise';
import * as mysql from './db';

type Connection = Pick<PoolConnection, 'execute'>;
type Context = {connection: Connection; afterCommit: Array<() => void>};
const context = new AsyncLocalStorage<Context>();
let worker: Worker | undefined, sequence = 0, queue = Promise.resolve();
const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: Error) => void}>();
let failed: Error | undefined;
function request(message: object): Promise<unknown> {
  if (failed) return Promise.reject(failed);
  if (!worker) {
    const path = process.env.SIMULATOR_SQLITE_PATH!;
    if (!isAbsolute(path)) throw new Error('SIMULATOR_SQLITE_PATH must be absolute');
    worker = new Worker(resolve(process.cwd(), 'storage/sqlite-worker.mjs'), {workerData: {path}});
    worker.on('message', ({id, result, error}) => {const job = pending.get(id); pending.delete(id); if (!pending.size) worker?.unref(); if (error) job?.reject(new Error(error)); else job?.resolve(result);});
    const fail = (error: Error) => {failed = error; for (const job of pending.values()) job.reject(error); pending.clear();};
    worker.on('error', fail);
    worker.on('exit', code => fail(new Error(`Simulator storage worker exited (${code})`)));
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {pending.set(id, {resolve, reject}); worker!.ref(); worker!.postMessage({id, ...message});});
}
function exclusive<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run);
  queue = result.then(() => {}, () => {});
  return result;
}
// Simulator callers use the string/positional-values overload of mysql's interface.
const connection = {execute: async (sql: string, values?: unknown[]) => {
  if (typeof sql !== 'string') throw new Error('Simulator storage requires a SQL string');
  return [await request({sql, values}), []];
}} as unknown as Connection;
export const sqliteEnabled = () => Boolean(process.env.SIMULATOR_SQLITE_PATH);
export async function closeSimulatorStorage() {
  await queue;
  if (pending.size) throw new Error('Simulator storage still has pending requests');
  const current = worker;
  worker = undefined;
  current?.removeAllListeners();
  await current?.terminate();
  failed = undefined;
}
export function afterWriteCommit(callback: () => void) {
  if (!sqliteEnabled()) return mysql.afterWriteCommit(callback);
  const active = context.getStore();
  if (!active) throw new Error('A simulator write transaction is required');
  active.afterCommit.push(callback);
}
export async function queryReadOnly<T extends RowDataPacket[]>(sql: string, values: readonly unknown[] = []): Promise<T> {
  if (!sqliteEnabled()) return mysql.queryReadOnly<T>(sql, values);
  if (!mysql.isReadOnlySql(sql)) throw new Error('Read-only simulator query required');
  const run = async () => await request({sql, values: [...values]}) as T;
  return context.getStore() ? run() : exclusive(run);
}
export async function withWriteTransaction<T>(run: (connection: Connection) => Promise<T>): Promise<T> {
  if (!sqliteEnabled()) return mysql.withWriteTransaction(run);
  const active = context.getStore();
  if (active) return run(active.connection);
  const committed = await exclusive(async () => {
    await request({operation: 'BEGIN IMMEDIATE'});
    const scope: Context = {connection, afterCommit: []};
    try {
      const result = await context.run(scope, () => run(connection));
      await request({operation: 'COMMIT'});
      return {result, callbacks: scope.afterCommit};
    } catch (error) {await request({operation: 'ROLLBACK'}); throw error;}
  });
  for (const callback of committed.callbacks) {try {callback();} catch {console.warn('Simulator post-commit delivery failed');}}
  return committed.result;
}
