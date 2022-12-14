import { Knex } from "knex";
import snowflake, { SnowflakeError, Connection } from "snowflake-sdk";

type SnowflakeOptions = {
  username: string;
  database: string;
  host: string;
  password?: string;
  schema?: string;
  warehouse?: string | null;
};

const getSnowflakeAccountFromHost = (host: string) => {
  const url = new URL(host);
  return url.hostname.split(".").slice(0, 2).join(".");
};

export class CustomSnowflakeError extends Error {
  constructor(base: SnowflakeError) {
    super(base.message);
  }
}

class SnowflakeClient {
  #connection: Connection;
  constructor(options: SnowflakeOptions) {
    const { host, warehouse, database, schema, username, password } = options;
    this.#connection = snowflake.createConnection({
      account: getSnowflakeAccountFromHost(host),
      database,
      schema,
      username,
      password,
      role: "accountadmin", // accountadmin enforced to perform necessary grants on created share
      warehouse: warehouse ?? undefined,
    });
  }

  getConnection() {
    return this.#connection;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.#connection.connect((err, conn) => {
        if (err) {
          reject(err);
        } else {
          resolve(conn);
        }
      });
    });
  }

  query(sql: Knex.SqlNative): Promise<{ rows: Record<string, unknown>[] }> {
    return new Promise((resolve, reject) => {
      this.#connection.execute({
        sqlText: sql.sql,
        binds: sql.bindings as (string | number)[],
        complete: (err, _statement, rows) => {
          if (err) {
            reject(new CustomSnowflakeError(err));
          } else {
            resolve({ rows: rows?.flatMap((row) => row) ?? [] });
          }
        },
      });
    });
  }

  queryUnsafe(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
    return new Promise((resolve, reject) => {
      this.#connection.execute({
        sqlText: sql,
        complete: (err, _statement, rows) => {
          if (err) {
            reject(new CustomSnowflakeError(err));
          } else {
            resolve({ rows: rows?.flatMap((row) => row) ?? [] });
          }
        },
      });
    });
  }
}

export default SnowflakeClient;
