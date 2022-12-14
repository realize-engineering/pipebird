import { DestinationType, SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import { logger } from "../logger.js";
import QueryStream from "pg-query-stream";
import SnowflakeClient from "../snowflake/client.js";
import crypto from "crypto";
import mysql2 from "mysql2";
import { Knex } from "knex";
import { BigQuery } from "@google-cloud/bigquery";

export type BigQueryServiceAccount = {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
};

export type ConnectionQueryOp = (
  sql: Knex.SqlNative,
) => Promise<{ rows: Record<string, unknown>[] }>;
export type ConnectionStreamOp = (
  sql: Knex.SqlNative,
) => Promise<Readable> | Readable;
export type ConnectionQueryUnsafeOp = (
  sql: string,
) => Promise<{ rows: Record<string, unknown>[] }>;
export type ConnectionUnsafeStreamOp = (
  sql: string,
) => Promise<Readable> | Readable;
type Pool = {
  query: ConnectionQueryOp;
  queryStream: ConnectionStreamOp;
  queryUnsafe: ConnectionQueryUnsafeOp;
  queryStreamUnsafe: ConnectionUnsafeStreamOp;
};

const pools: Record<string, Pool> = {};

// todo: improve discrimination between credential arguments so as to not include unneeded params
export const useConnection = async (
  credentials:
    | {
        dbType: Exclude<SourceType | DestinationType, "BIGQUERY">;
        host: string;
        database: string;
        username: string;
        port?: number;
        password?: string;
        schema?: string;
        warehouse?: string | null;
      }
    | {
        dbType: "BIGQUERY";
        database: string;
        serviceAccount: BigQueryServiceAccount;
        username: string;
        host?: string;
        port?: number;
        password?: string;
        schema?: string;
        warehouse?: string | null;
      },
): Promise<
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
    const { dbType, host, port, username, password, database } = credentials;
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
              if (dbType === "POSTGRES") {
                client.query(
                  "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
                  () => {
                    logger.trace(
                      "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
                    );
                  },
                );
              }
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
            queryStreamUnsafe: async (sql: string) => {
              const client = await pool.connect();
              const stream = client.query(new QueryStream(sql));
              stream.on("end", client.release);
              return stream;
            },
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
            queryStreamUnsafe: (sql: string) =>
              pool.query(sql).stream({ objectMode: true }),
          };

          break;
        }

        case "SNOWFLAKE": {
          const { warehouse, schema } = credentials;
          const client = new SnowflakeClient({
            warehouse,
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
            queryStreamUnsafe: (sql: string) =>
              client
                .getConnection()
                .execute({
                  sqlText: sql,
                })
                .streamRows(),
          };
        }

        case "BIGQUERY": {
          const { serviceAccount } = credentials;
          const client = new BigQuery({
            credentials: serviceAccount,
          });

          await client.query("SELECT 1=1");

          return {
            error: false,
            code: "connection_reachable",
            query: async (sql: Knex.SqlNative) => {
              const [rows] = await client.query({
                query: sql.sql,
                params: sql.bindings,
              });
              return { rows: rows.flatMap((row) => row) ?? [] };
            },
            queryStream: (sql: Knex.SqlNative) =>
              client.createQueryStream({
                query: sql.sql,
                params: sql.bindings,
              }),
            queryUnsafe: async (sql: string) => {
              const [rows] = await client.query(sql);
              return { rows: rows.flatMap((row) => row) ?? [] };
            },
            queryStreamUnsafe: async (sql: string) =>
              client.createQueryStream({
                query: sql,
              }),
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
