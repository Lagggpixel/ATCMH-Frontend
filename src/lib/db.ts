import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

type SqlExecuteValue = string | number | bigint | boolean | Date | null | Blob | Buffer | Uint8Array
  | SqlExecuteValue[] | { [key: string]: SqlExecuteValue };

export type ReadOnlyDatabase = Pick<Pool, "execute">;
export interface ReadOnlyConnection {
  execute<T extends RowDataPacket[]>(sql: string, values?: readonly unknown[]): Promise<T>;
}

const readOnlyStatement = /^\s*(?:SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i;
const lockingClause = /\b(?:FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE)\b/i;
let readOnlyPool: Pool | undefined;
let writePool: Pool | undefined;

/** Test seam. Production initialization always comes from MYSQL_* variables. */
export function setPoolForTests(value: Pool | undefined) {
  readOnlyPool = value;
}

/** Test seam for the narrowly scoped management write connection. */
export function setWritePoolForTests(value: Pool | undefined) {
  writePool = value;
}

export function isReadOnlySql(sql: string) {
  return readOnlyStatement.test(sql) && !lockingClause.test(sql);
}

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

/**
 * Builds a connection URI from individually supplied deployment variables so
 * credentials are never required in a single, easy-to-misroute URL value.
 */
export function databaseUrlFromEnvironment() {
  const host = requiredEnvironmentValue("MYSQL_HOST");
  const port = requiredEnvironmentValue("MYSQL_PORT");
  const user = requiredEnvironmentValue("MYSQL_USER");
  const password = requiredEnvironmentValue("MYSQL_PASSWORD");
  const database = requiredEnvironmentValue("MYSQL_DATABASE");
  if (database !== "atcmh_lms") {
    throw new Error("MYSQL_DATABASE must be atcmh_lms");
  }

  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
    throw new Error("MYSQL_PORT must be a valid TCP port");
  }

  const url = new URL("mysql://localhost");
  url.username = user;
  url.password = password;
  url.hostname = host;
  url.port = String(numericPort);
  url.pathname = `/${database}`;
  return url.toString();
}

export function managementWriteUrlFromEnvironment() {
  return databaseUrlFromEnvironment();
}

function getReadOnlyPool() {
  readOnlyPool ??= mysql.createPool({
    uri: databaseUrlFromEnvironment(),
    connectionLimit: 5,
    enableKeepAlive: true,
  });
  return readOnlyPool;
}

function getWritePool() {
  if (writePool) return writePool;
  writePool = mysql.createPool({
    uri: managementWriteUrlFromEnvironment(),
    connectionLimit: 2,
    enableKeepAlive: true,
  });
  return writePool;
}

export async function queryReadOnly<T extends RowDataPacket[]>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<T> {
  if (!isReadOnlySql(sql)) {
    throw new Error("The exams data layer only permits read-only SQL statements");
  }
  const [rows] = await getReadOnlyPool().execute<T>(sql, values as SqlExecuteValue[]);
  return rows;
}

export async function withTransaction<T>(fn: (connection: ReadOnlyConnection) => Promise<T>): Promise<T> {
  const connection = await getReadOnlyPool().getConnection();
  try {
    await connection.query("START TRANSACTION READ ONLY");
    const readOnlyConnection: ReadOnlyConnection = {
      async execute<T extends RowDataPacket[]>(sql: string, values: readonly unknown[] = []) {
        if (!isReadOnlySql(sql)) {
          throw new Error("The exams data layer only permits read-only SQL statements");
        }
        const [rows] = await connection.execute<T>(sql, values as SqlExecuteValue[]);
        return rows;
      },
    };
    const result = await fn(readOnlyConnection);
    await connection.rollback();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Executes a single atomic application write. Do not use this for ad-hoc SQL:
 * all callers must validate input and preserve existing canonical LMS IDs.
 */
export async function withWriteTransaction<T>(fn: (connection: Pick<PoolConnection, "execute">) => Promise<T>): Promise<T> {
  const connection = await getWritePool().getConnection();
  try {
    await connection.query("START TRANSACTION");
    const result = await fn({
      execute: connection.execute.bind(connection),
    });
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
