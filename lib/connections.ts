import { SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import { logger } from "./logger.js";
import QueryStream from "pg-query-stream";
import SnowflakeClient from "./snowflake/client.js";
import crypto from "crypto";
import mysql2 from "mysql2";
import { Knex } from "knex";

export type ConnectionQueryOp = (
  sql: Knex.SqlNative,
) => Promise<{ rows: Record<string, unknown>[] }>;
export type ConnectionStreamOp = (
  sql: Knex.SqlNative,
) => Promise<Readable> | Readable;
export type ConnectionQueryUnsafeOp = (
  sql: string,
) => Promise<{ rows: Record<string, unknown>[] }>;

type Pool = {
  query: ConnectionQueryOp;
  queryStream: ConnectionStreamOp;
  queryUnsafe: ConnectionQueryUnsafeOp;
};

const pools: Record<string, Pool> = {};

export const useConnection = async ({
  dbType,
  host,
  port,
  username,
  password,
  database,
  schema,
}: {
  dbType: SourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  schema?: string;
}): Promise<
  | {
      error: true;
      code: "not_implemented" | "connection_refused";
      message: string;
    }
  | ({
      error: false;
      code: "connection_reachable";
    } & Pool)
> => {
  try {
    const connectionOptions = {
      host,
      port,
      user: username,
      password,
      database,
    };
    const poolFingerprint = crypto
      .createHash("sha256")
      .update(Object.values({ ...connectionOptions, dbType }).join("|"))
      .digest("hex");
    let existingPool = pools[poolFingerprint];

    if (!existingPool) {
      switch (dbType) {
        case "COCKROACHDB":
        case "REDSHIFT":
        case "POSTGRES": {
          const pool = new pg.Pool(connectionOptions).on(
            "connect",
            (client) => {
              client.query(
                "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
                () => {
                  logger.trace(
                    "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
                  );
                },
              );
            },
          );

          await pool.query("SELECT 1=1");

          existingPool = pools[poolFingerprint] = {
            query: (sql: Knex.SqlNative) =>
              pool.query(sql.sql, [...sql.bindings]),
            queryStream: async (sql: Knex.SqlNative) => {
              const client = await pool.connect();
              const stream = client.query(
                new QueryStream(sql.sql, [...sql.bindings]),
              );
              stream.on("end", client.release);
              return stream;
            },
            queryUnsafe: (sql: string) => pool.query(sql),
          };

          break;
        }

        case "MARIADB":
        case "MYSQL": {
          const pool = mysql2
            .createPool(connectionOptions)
            .on("connection", (connection) => {
              connection.query("SET SESSION sql_mode='ANSI_QUOTES'", () =>
                logger.trace("SET SESSION sql_mode='ANSI_QUOTES'"),
              );
              connection.query("SET SESSION TRANSACTION READ ONLY", () =>
                logger.trace("SET SESSION TRANSACTION READ ONLY"),
              );
            });

          await pool.promise().query("SELECT 1=1");

          existingPool = pools[poolFingerprint] = {
            query: (sql: Knex.SqlNative) =>
              pool
                .promise()
                .query(sql.sql, sql.bindings)
                .then(([rows]) => ({
                  rows: Array.isArray(rows)
                    ? rows.flatMap((row) => row)
                    : [rows],
                })),
            queryStream: (sql: Knex.SqlNative) =>
              pool.query(sql.sql, sql.bindings).stream({ objectMode: true }),
            queryUnsafe: async (sql: string) =>
              pool
                .promise()
                .query(sql)
                .then(([rows]) => ({
                  rows: Array.isArray(rows)
                    ? rows.flatMap((row) => row)
                    : [rows],
                })),
          };

          break;
        }

        case "SNOWFLAKE": {
          const client = new SnowflakeClient({
            host,
            database,
            schema,
            username,
            password,
          });
          await client.connect();

          return {
            error: false,
            code: "connection_reachable",
            query: (sql: Knex.SqlNative) => client.query(sql),
            queryStream: (sql: Knex.SqlNative) =>
              client
                .getConnection()
                .execute({
                  sqlText: sql.sql,
                  binds: sql.bindings as (string | number)[],
                })
                .streamRows(),
            queryUnsafe: (sql: string) => client.queryUnsafe(sql),
          };
        }

        default: {
          return {
            error: true,
            code: "not_implemented",
            message: `Database type ${dbType} has not yet been implemented.`,
          };
        }
      }

      logger.trace(
        `Added ${dbType} pool with fingerprint '${poolFingerprint}' to pool cache`,
      );
    }

    logger.trace(
      `Using ${dbType} pool with fingerprint '${poolFingerprint}' from pool cache`,
    );

    return {
      error: false,
      code: "connection_reachable",
      ...existingPool,
    };
  } catch (error) {
    logger.error({ connectionError: error });

    const message =
      error instanceof pg.DatabaseError
        ? error.message
        : "Something went wrong when connecting to the database";

    return {
      error: true,
      code: "connection_refused",
      message,
    };
  }
};
