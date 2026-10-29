import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {existsSync, linkSync, unlinkSync, openSync, closeSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const tables = ['simulator_sessions', 'simulator_staff_preferences', 'simulator_scenarios', 'simulator_scenario_revisions', 'simulator_assignments', 'simulator_attempts', 'simulator_replays', 'simulator_replay_frames', 'simulator_replay_position_feedback', 'simulator_owner_interventions'];
const identifier = value => {if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error('Invalid schema identifier'); return `"${value}"`;};
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
export async function importSimulator(source, destination) {
  if (!isAbsolute(destination) || existsSync(destination) || existsSync(destination + '.importing')) throw new Error('Import requires a new absolute destination');
  closeSync(openSync(destination + '.importing', 'wx', 0o600));
  let database;
  const report = [];
  try {
    database = new DatabaseSync(destination + '.importing');
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    database.exec('BEGIN');
    for (const table of tables) {
      const [columns] = await source.execute('SELECT COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', [table]);
      if (!columns.length) {if (table === 'simulator_replay_position_feedback' || table === 'simulator_owner_interventions') continue; throw new Error(`Missing source table ${table}`);}
      const [indexes] = await source.execute('SELECT INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX', [table]);
      const primary = indexes.filter(index => index.INDEX_NAME === 'PRIMARY').map(index => index.COLUMN_NAME);
      if (!primary.length) throw new Error(`Import requires a primary key for ${table}`);
      const definitions = columns.map(column => {
        const type = /^(tinyint|smallint|mediumint|int|bigint)$/.test(column.DATA_TYPE) ? 'INTEGER' : /^(float|double|decimal)$/.test(column.DATA_TYPE) ? 'REAL' : /blob|binary/.test(column.DATA_TYPE) ? 'BLOB' : 'TEXT';
        let defaultSql = '';
        if (column.COLUMN_DEFAULT != null && column.COLUMN_DEFAULT !== 'NULL') {
          const value = String(column.COLUMN_DEFAULT);
          if (/^-?\d+(\.\d+)?$/.test(value)) defaultSql = ' DEFAULT ' + value;
          else if (/^'.*'$/.test(value)) defaultSql = ' DEFAULT ' + value;
          else throw new Error(`Unsupported default in ${table}.${column.COLUMN_NAME}`);
        }
        return `${identifier(column.COLUMN_NAME)} ${type}${column.IS_NULLABLE === 'NO' ? ' NOT NULL' : ''}${defaultSql}`;
      });
      definitions.push(`PRIMARY KEY (${primary.map(identifier).join(',')})`);
      const [foreign] = await source.execute('SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL', [table]);
      for (const key of foreign) {
        if (!tables.includes(key.REFERENCED_TABLE_NAME)) throw new Error(`External foreign key in ${table}`);
        definitions.push(`FOREIGN KEY (${identifier(key.COLUMN_NAME)}) REFERENCES ${identifier(key.REFERENCED_TABLE_NAME)} (${identifier(key.REFERENCED_COLUMN_NAME)}) ON DELETE CASCADE`);
      }
      database.exec(`CREATE TABLE ${identifier(table)} (${definitions.join(',')})`);
      for (const name of new Set(indexes.filter(index => index.INDEX_NAME !== 'PRIMARY').map(index => index.INDEX_NAME))) {
        const group = indexes.filter(index => index.INDEX_NAME === name);
        database.exec(`CREATE ${group[0].NON_UNIQUE ? '' : 'UNIQUE '}INDEX ${identifier(table + '_' + name)} ON ${identifier(table)} (${group.map(index => identifier(index.COLUMN_NAME)).join(',')})`);
      }
      const names = columns.map(column => column.COLUMN_NAME), selection = names.map(identifier).join(',');
      const insert = database.prepare(`INSERT INTO ${identifier(table)} (${selection}) VALUES (${names.map(() => '?').join(',')})`);
      let count = 0, lastKey;
      // Keep replay frame imports bounded; never write training data to local temporary files.
      for (;;) {
        const order = primary.map(name => '`' + name + '`').join(',');
        // MariaDB does not range-optimize composite row inequalities. Spell out
        // the lexicographic range so large replay tables never restart an index scan.
        const ranges = primary.map((key, index) => '(' + [...primary.slice(0, index).map(prefix => '`' + prefix + '`=?'), '`' + key + '`>?'].join(' AND ') + ')');
        const predicate = lastKey ? ` WHERE ${ranges.join(' OR ')}` : '';
        const parameters = lastKey ? primary.flatMap((_, index) => lastKey.slice(0, index + 1)) : [];
        const [rows] = await source.query(`SELECT * FROM \`${table}\`${predicate} ORDER BY ${order} LIMIT 250`, parameters);
        if (!rows.length) break;
        const expected = rows.map(row => names.map(name => row[name]));
        for (const row of expected) insert.run(...row);
        const sqliteKeys = primary.map(identifier).join(',');
        const actual = database.prepare(`SELECT ${selection} FROM ${identifier(table)}${lastKey ? ` WHERE (${sqliteKeys}) > (${primary.map(() => '?').join(',')})` : ''} ORDER BY ${sqliteKeys} LIMIT 250`).all(...(lastKey ?? [])).map(row => names.map(name => row[name]));
        if (digest(expected) !== digest(actual)) throw new Error(`Import content verification failed for ${table}`);
        count += rows.length;
        lastKey = primary.map(name => rows.at(-1)[name]);
      }
      report.push({table, rows: count});
    }
    database.exec('CREATE TABLE simulator_storage_version (version INTEGER NOT NULL); INSERT INTO simulator_storage_version VALUES (1); COMMIT; PRAGMA foreign_keys=ON;');
    if (database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite integrity verification failed');
    await source.rollback();
    database.close();
    // Publishing a hard link is atomic and refuses to replace a destination
    // created by another operator between the initial check and publication.
    linkSync(destination + '.importing', destination);
    unlinkSync(destination + '.importing');
    return report;
  } catch (error) {
    await source.rollback().catch(() => {});
    try {database?.close();} catch {}
    if (existsSync(destination + '.importing')) unlinkSync(destination + '.importing');
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(existsSync(resolve('maintenance/node_modules/mysql2')) ? resolve('maintenance/entry.js') : import.meta.url);
  const mysql = require('mysql2/promise');
  const source = await mysql.createConnection({host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE});
  try {console.log(JSON.stringify(await importSimulator(source, process.env.SIMULATOR_SQLITE_PATH)));}
  finally {await source.end();}
}
