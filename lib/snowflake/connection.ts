import { Sequelize } from "sequelize";
import { logger } from "../logger.js";

const getAccountFromHost = (host: string) => {
  const url = new URL(host);
  return url.hostname.split(".").slice(0, 2).join(".");
};

export const getSnowflakeConnection = async ({
  host,
  username,
  password,
  database,
  schema,
}: {
  host: string;
  username: string;
  password: string;
  database: string;
  schema?: string;
}): Promise<
  | {
      status: "REACHABLE";
      client: Sequelize;
    }
  | { status: "UNREACHABLE" }
> => {
  try {
    const client = new Sequelize({
      dialect: "snowflake",
      dialectOptions: {
        account: getAccountFromHost(host),
        schema,
      },
      username,
      password,
      database,
    });
    await client.authenticate();

    return {
      status: "REACHABLE",
      client,
    };
  } catch (error) {
    logger.error(error);

    return { status: "UNREACHABLE" };
  }
};
