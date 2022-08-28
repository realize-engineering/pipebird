import { SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import pgcs from "pg-copy-streams";
import { logger } from "./logger.js";
import { Sql } from "sql-template-tag";

type QueryResult =
  | {
      status: "REACHABLE";
      error: false;
      columns: string[];
      queryUnsafe: (
        sql: string,
      ) => Promise<{ rows: Record<string, unknown>[] }>;
    }
  | {
      status: "REACHABLE";
      error: true;
      message?: string;
    }
  | {
      status: "UNREACHABLE";
      error: true;
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
      queryUnsafe: (
        sql: string,
      ) => Promise<{ rows: Record<string, unknown>[] }>;
      extractToCsvUnsafe: (sql: string) => Readable;
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
          queryUnsafe: (sql: string) => client.query(sql),
          extractToCsvUnsafe: (sql: string) =>
            client.query(
              pgcs.to(`COPY (${sql}) TO STDOUT WITH DELIMITER ',' HEADER CSV`),
            ),
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
  query: string;
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
        const res = await result.queryUnsafe(query);

        return {
          status: result.status,
          error: false,
          columns: Object.keys(res.rows[0]),
          queryUnsafe: result.queryUnsafe,
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
