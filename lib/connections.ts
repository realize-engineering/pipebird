import { SourceType } from "@prisma/client";
import { Readable } from "stream";
import pg from "pg";
import pgcs from "pg-copy-streams";
import { logger } from "./logger.js";
import { Sql } from "sql-template-tag";

export const useConnection = async ({
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
  database: string;
  username: string;
  password?: string;
  query?: string;
}): Promise<
  | {
      error: true;
      code: "not_implemented" | "connection_refused";
    }
  | {
      error: true;
      code: "invalid_query";
      message: string;
    }
  | {
      error: false;
      code: "connection_reachable";
      query: (sql: Sql) => Promise<{ rows: Record<string, unknown>[] }>;
      queryUnsafe: (
        sql: string,
      ) => Promise<{ rows: Record<string, unknown>[] }>;
      extractToCsvUnsafe: (sql: string) => Readable;
    }
  | {
      error: false;
      code: "query_succeeded";
      columns: string[];
      result: Record<string, unknown>[];
      queryUnsafe: (
        sql: string,
      ) => Promise<{ rows: Record<string, unknown>[] }>;
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

        try {
          await client.connect();
        } catch (error) {
          return { error: true, code: "connection_refused" };
        }

        if (query) {
          const res = await client.query(query);

          return {
            error: false,
            code: "query_succeeded",
            columns: Object.keys(res.rows[0]),
            result: res.rows,
            queryUnsafe: (sql: string) => client.query(sql),
          };
        }

        return {
          error: false,
          code: "connection_reachable",
          query: (sql: Sql) => client.query(sql),
          queryUnsafe: (sql: string) => client.query(sql),
          extractToCsvUnsafe: (sql: string) =>
            client.query(
              pgcs.to(`COPY (${sql}) TO STDOUT WITH DELIMITER ',' HEADER CSV`),
            ),
        };
      }

      default: {
        return { error: true, code: "not_implemented" };
      }
    }
  } catch (error) {
    logger.error(error);

    return { error: true, code: "connection_refused" };
  }
};
