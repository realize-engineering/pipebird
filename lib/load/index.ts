import { DestinationType, Prisma } from "@prisma/client";
import { default as knex, Knex } from "knex";
import { Gzip } from "zlib";

import { ConnectionQueryOp } from "../connections.js";

export type LoadConfiguration = Prisma.ConfigurationGetPayload<{
  select: {
    id: true;
    tenantId: true;
    warehouseId: true;
    destination: {
      select: {
        nickname: true;
        destinationType: true;
        username: true;
      };
    };
    columns: {
      select: {
        nameInSource: true;
        nameInDestination: true;
        viewColumn: true;
      };
    };
    view: {
      select: {
        columns: true;
      };
    };
  };
}>;

const getUniqueTableName = ({
  nickname,
  configurationId,
}: {
  nickname: string;
  configurationId: number;
}) => `SharedData_${nickname.replaceAll(" ", "_")}_${configurationId}`;

const getUniqueShareName = ({
  nickname,
  configurationId,
}: {
  nickname: string;
  configurationId: number;
}) => `Share_${nickname.replaceAll(" ", "_")}_${configurationId}`;

const getTempStageName = (configurationId: number) =>
  `SharedData_TempStage_${configurationId}_${new Date().getTime()}`;

const getDialectFromDestination = (type: DestinationType) => {
  if (type === "POSTGRES" || type === "REDSHIFT" || type === "SNOWFLAKE") {
    return "postgres";
  }

  return "mysql";
};

class Loader {
  protected query: ConnectionQueryOp;
  protected qb: Knex;
  protected configuration: LoadConfiguration;
  protected stageName: string;
  protected tableName: string;
  protected shareName: string;

  constructor(query: ConnectionQueryOp, configuration: LoadConfiguration) {
    this.query = query;
    this.configuration = configuration;

    this.qb = knex({
      client: getDialectFromDestination(
        configuration.destination.destinationType,
      ),
    });
    this.stageName = getTempStageName(configuration.id);
    this.tableName = getUniqueTableName({
      nickname: configuration.destination.nickname,
      configurationId: configuration.id,
    });
    this.shareName = getUniqueShareName({
      nickname: configuration.destination.nickname,
      configurationId: configuration.id,
    });
  }

  // note: DDL statements will be autocommitted even if wrapped in begin..commit
  // this pattern will only work for DML
  // should replace or check if object exists when executing DDL statements
  beginTransaction = async () => {
    const begin = this.qb.raw("begin transaction").toSQL().toNative();
    await this.query(begin);
  };

  commitTransaction = async () => {
    const commit = this.qb.raw("commit").toSQL().toNative();
    await this.query(commit);
  };

  rollbackTransaction = async () => {
    const rollback = this.qb.raw("rollback").toSQL().toNative();
    await this.query(rollback);
  };
}

interface LoadingActions extends Loader {
  beginTransaction: () => Promise<void>;
  commitTransaction: () => Promise<void>;
  rollbackTransaction: () => Promise<void>;
  createShare: (params: { schema: string; database: string }) => Promise<void>;
  createTable: (params: { schema: string; database: string }) => Promise<void>;
  stage: (contents: Gzip, schema?: string) => Promise<void>;
  upsert: (schema?: string) => Promise<void>;
  tearDown: (schema?: string) => Promise<void>;
}

export { LoadingActions, Loader };
