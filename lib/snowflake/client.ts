import snowflake, { SnowflakeError } from "snowflake-sdk";
import { Sql } from "sql-template-tag";

type SnowflakeOptions = {
  host: string;
  database: string;
  username: string;
  password?: string;
  schema?: string;
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
  private connection;
  constructor(options: SnowflakeOptions) {
    const { host, database, schema, username, password } = options;
    this.connection = snowflake.createConnection({
      account: getSnowflakeAccountFromHost(host),
      database,
      schema,
      username,
      password,
    });
  }

  getConnection() {
    return this.connection;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.connection.connect((err, conn) => {
        if (err) {
          reject(err);
        } else {
          resolve(conn);
        }
      });
    });
  }

  query(sql: Sql): Promise<{ rows: Record<string, unknown>[] }> {
    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: sql.text,
        binds: sql.values as string[],
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
      this.connection.execute({
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
