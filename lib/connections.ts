import { SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import { logger } from "./logger.js";
import { Sql } from "sql-template-tag";
import QueryStream from "pg-query-stream";

type QueryResult = {
  status: "REACHABLE" | "UNREACHABLE";
  error: boolean;
  columns?: string[];
  message?: string;
};

export const getConnection = async ({
  dbType,
  host,
  port,
  username,
  password,
  database,
}: {
  dbType: SourceType;
  host: string;
  port: number;
  username: string;
  password?: string;
  database: string;
}): Promise<
  | {
      status: "REACHABLE";
      query: (sql: Sql) => Promise<{ rows: Record<string, unknown>[] }>;
      queryStream: (sql: Sql) => Readable;
      queryUnsafe: (
        sql: string,
      ) => Promise<{ rows: Record<string, unknown>[] }>;
    }
  | { status: "UNREACHABLE"; error: "not_implemented" | "connection_refused" }
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
          status: "REACHABLE",
          query: (sql: Sql) => client.query(sql),
          queryStream: (sql: Sql) =>
            client.query(new QueryStream(sql.text, sql.values)),
          queryUnsafe: (sql: string) => client.query(sql),
        };
      }

      default: {
        return { status: "UNREACHABLE", error: "not_implemented" };
      }
    }
  } catch (error) {
    logger.error(error);

    return { status: "UNREACHABLE", error: "connection_refused" };
  }
};

export const testQuery = async ({
  dbType,
  host,
  port,
  username,
  password,
  database,
  query,
}: {
  dbType: SourceType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  query: Sql;
}): Promise<QueryResult> => {
  try {
    switch (dbType) {
      case "POSTGRES":
      case "REDSHIFT":
      case "MYSQL": {
        const result = await getConnection({
          dbType,
          host,
          port,
          username,
          password,
          database,
        });

        if (result.status !== "REACHABLE") {
          return {
            status: result.status,
            error: true,
            message: "Cannot connect to the database.",
          };
        }

        // todo(ianedwards): Explore safe method for limiting results to speed up test time
        const res = await result.query(query);

        return {
          status: result.status,
          error: false,
          columns: Object.keys(res.rows[0]),
        };
      }
      default: {
        return {
          status: "UNREACHABLE",
          error: true,
          message: "Database type is not currently supported.",
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "REACHABLE",
      error: true,
      message,
    };
  }
};
