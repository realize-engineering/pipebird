import { SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import { logger } from "./logger.js";
import { Sql } from "sql-template-tag";
import QueryStream from "pg-query-stream";
import SnowflakeClient from "./snowflake/client.js";

export type ConnectionQueryOp = (
  sql: Sql,
) => Promise<{ rows: Record<string, unknown>[] }>;
export type ConnectionStreamOp = (sql: Sql) => Readable;
export type ConnectionQueryUnsafeOp = (
  sql: string,
) => Promise<{ rows: Record<string, unknown>[] }>;

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
  | {
      error: false;
      code: "connection_reachable";
      query: ConnectionQueryOp;
      queryStream: ConnectionStreamOp;
      queryUnsafe: ConnectionQueryUnsafeOp;
    }
> => {
  try {
    switch (dbType) {
      case "POSTGRES": {
        const client = new pg.Client({
          host,
          port,
          user: username,
          password,
          database,
        });
        await client.connect();

        return {
          error: false,
          code: "connection_reachable",
          query: (sql: Sql) => client.query(sql),
          queryStream: (sql: Sql) =>
            client.query(new QueryStream(sql.text, sql.values)),
          queryUnsafe: (sql: string) => client.query(sql),
        };
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
  } catch (error) {
    logger.info({ connectionError: error });

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
