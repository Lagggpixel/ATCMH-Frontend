import {parentPort, workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';

// Opening an absent database must never silently replace production history.
if (!existsSync(workerData.path)) throw new Error('Simulator SQLite database has not been imported');
const db = new DatabaseSync(workerData.path);
db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
if (db.prepare('SELECT version FROM simulator_storage_version').get()?.version !== 1) throw new Error('Unsupported simulator storage version');
const parse = value => value == null ? null : JSON.parse(value);
const contains = (value, candidate) => Array.isArray(value) ? value.some(item => contains(item, candidate)) : candidate && typeof candidate === 'object' ? value && Object.entries(candidate).every(([key, item]) => contains(value[key], item)) : value === candidate;
db.function('JSON_CONTAINS', (value, candidate) => Number(contains(parse(value), parse(candidate))));
db.function('JSON_UNQUOTE', value => value);
db.function('MYSQL_LEFT', (value, length) => value == null ? null : String(value).slice(0, Number(length)));
db.function('LOCATE', (needle, value) => needle == null || value == null ? null : String(value).indexOf(String(needle)) + 1);
db.function('regexp', (pattern, value) => value == null ? null : Number(new RegExp(String(pattern)).test(String(value))));
db.function('CONCAT_WS', {varargs: true}, (separator, ...values) => separator == null ? null : values.filter(value => value != null).join(String(separator)));
db.function('MYSQL_JSON_EXTRACT', (value, path) => {
  let result = parse(value);
  for (const key of String(path).replace(/^\$\.?/, '').split('.').filter(Boolean)) result = result?.[key];
  return result == null ? null : typeof result === 'object' ? JSON.stringify(result) : typeof result === 'boolean' ? String(result) : result;
});
db.function('JSON_LENGTH', value => {const item = parse(value); return item == null ? null : typeof item === 'object' ? Object.keys(item).length : 1;});
db.function('JSON_SEARCH', {varargs: true}, (value, mode, needle, escape, path) => {
  // The simulator only searches controller assignment IDs at this path.
  if (!/^\$\.\*\.assignment\.(accountId|discordId)$/.test(String(path)) || mode !== 'one') throw new Error('Unsupported simulator JSON search');
  const key = String(path).split('.').at(-1);
  for (const [id, state] of Object.entries(parse(value) ?? {})) if (state.assignment?.[key] === needle) return JSON.stringify(`$.${id}.assignment.${key}`);
  return null;
});

export function sqliteSql(sql) {
  return sql.replace(/\s+FOR UPDATE\b/gi, '').replace(/\bINSERT IGNORE\b/gi, 'INSERT OR IGNORE')
    .replace(/\bLEFT\(/gi, 'MYSQL_LEFT(').replace(/\bJSON_EXTRACT\(/gi, 'MYSQL_JSON_EXTRACT(')
    .replace(/ON DUPLICATE KEY UPDATE\s+(.+)$/i, (_, update) => 'ON CONFLICT DO UPDATE SET ' + update.replace(/VALUES\((\w+)\)/gi, 'excluded.$1'));
}
parentPort.on('message', ({id, sql, values = [], operation}) => {
  try {
    if (operation) {db.exec(operation); parentPort.postMessage({id, result: null}); return;}
    const statement = db.prepare(sqliteSql(sql));
    const parameters = values.map(value => typeof value === 'boolean' ? Number(value) : value);
    const result = statement.columns().length ? statement.all(...parameters) : (() => {const value = statement.run(...parameters); return {affectedRows: Number(value.changes), insertId: Number(value.lastInsertRowid)};})();
    parentPort.postMessage({id, result});
  } catch (error) {parentPort.postMessage({id, error: error.message});}
});
