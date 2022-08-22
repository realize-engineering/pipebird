import { SourceType } from "@prisma/client";
import { Sequelize, QueryTypes } from "sequelize";
import { logger } from "./logger.js";

type DBTypes = SourceType;

type QueryResult = {
  status: "REACHABLE" | "UNREACHABLE";
  error: boolean;
  columns?: string[];
  message?: string;
};

type ConnectionResult =
  | {
      status: "REACHABLE";
      connection: Sequelize;
    }
  | {
      status: "UNREACHABLE";
      error?: string;
    };

export const getConnection = async ({
  dbType,
  host,
  port,
  username,
  password,
  dbName,
}: {
  dbType: DBTypes;
  host: string;
  port: number;
  username: string;
  password: string;
  dbName: string;
}): Promise<ConnectionResult> => {
  try {
    switch (dbType) {
      case "POSTGRES":
      case "REDSHIFT":
      case "MYSQL": {
        const conn = new Sequelize(dbName, username, password, {
          host,
          port,
          dialect:
            dbType === "REDSHIFT"
              ? "postgres"
              : (dbType.toLowerCase() as Lowercase<typeof dbType>),
        });

        await conn.authenticate();

        return {
          status: "REACHABLE",
          connection: conn,
        };
      }
      default: {
        return {
          status: "UNREACHABLE",
        };
      }
    }
  } catch (err) {
    logger.error({ connectionError: err });
    return {
      status: "UNREACHABLE",
    };
  }
};

export const testQuery = async ({
  dbType,
  host,
  port,
  username,
  password,
  dbName,
  query,
}: {
  dbType: DBTypes;
  host: string;
  port: number;
  username: string;
  password: string;
  dbName: string;
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
          dbName,
        });
        if (result.status === "UNREACHABLE") {
          return {
            status: result.status,
            error: true,
            message: "Cannot connect to the database.",
          };
        }

        // todo(ianedwards): Explore safe method for limiting results to speed up test time
        const res = await result.connection.query(query, {
          type: QueryTypes.SELECT,
        });

        return {
          status: result.status,
          error: false,
          columns: Object.keys(res[0]),
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
