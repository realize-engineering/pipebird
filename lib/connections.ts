import { SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import { logger } from "./logger.js";
import { Sql } from "sql-template-tag";
import QueryStream from "pg-query-stream";
import SnowflakeClient from "./snowflake/client.js";
import crypto from "crypto";
import mysql2 from "mysql2";

export type ConnectionQueryOp = (
  sql: Sql,
) => Promise<{ rows: Record<string, unknown>[] }>;
export type ConnectionStreamOp = (sql: Sql) => Promise<Readable> | Readable;
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

    if (!pools[poolFingerprint]) {
      switch (dbType) {
        case "POSTGRES": {
          const pool = new pg.Pool(connectionOptions).on(
            "connect",
            (client) => {
              client.query(
                "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
                () => {
                  logger.info(
                    "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
                  );
                },
              );
            },
          );

          pools[poolFingerprint] = {
            query: (sql: Sql) => pool.query(sql),
            queryStream: async (sql: Sql) => {
              const client = await pool.connect();
              const stream = client.query(
                new QueryStream(sql.text, sql.values),
              );
              stream.on("end", client.release);
              return stream;
            },
            queryUnsafe: (sql: string) => pool.query(sql),
          };

          break;
        }

        case "MYSQL": {
          const pool = mysql2
            .createPool(connectionOptions)
            .on("connection", (connection) => {
              connection.query("SET SESSION sql_mode='ANSI_QUOTES'", () =>
                logger.info("SET SESSION sql_mode='ANSI_QUOTES'"),
              );
              connection.query("SET SESSION TRANSACTION READ ONLY", () =>
                logger.info("SET SESSION TRANSACTION READ ONLY"),
              );
            });

          pools[poolFingerprint] = {
            query: (sql: Sql) =>
              pool
                .promise()
                .query(sql)
                .then(([rows]) => ({
                  rows: Array.isArray(rows)
                    ? rows.flatMap((row) => row)
                    : [rows],
                })),
            queryStream: (sql: Sql) =>
              pool.query(sql).stream({ objectMode: true }),
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
            query: (sql: Sql) => client.query(sql),
            queryStream: (sql: Sql) =>
              client
                .getConnection()
                .execute({
                  sqlText: sql.text,
                  binds: sql.values as string[],
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
    }

    return {
      error: false,
      code: "connection_reachable",
      ...pools[poolFingerprint],
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
