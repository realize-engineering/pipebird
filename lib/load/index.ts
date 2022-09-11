import { DestinationType, Prisma } from "@prisma/client";
import { default as knex, Knex } from "knex";
import { Gzip } from "zlib";

import { ConnectionQueryOp } from "../connections.js";

export type LoadShare = Prisma.ShareGetPayload<{
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
    configuration: {
      select: {
        id: true;
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
    };
  };
}>;

const getUniqueTableName = ({
  nickname,
  warehouseId,
}: {
  nickname: string;
  warehouseId: string;
}) => `SharedData_${nickname.replaceAll(" ", "_")}_${warehouseId}`;

const getUniqueShareName = ({
  nickname,
  warehouseId,
}: {
  nickname: string;
  warehouseId: string;
}) => `Share_${nickname.replaceAll(" ", "_")}_${warehouseId}`;

const getTempStageName = (warehouseId: string) =>
  `SharedData_TempStage_${warehouseId}_${new Date().getTime()}`;

const getDialectFromDestination = (type: DestinationType) => {
  if (type === "POSTGRES" || type === "REDSHIFT" || type === "SNOWFLAKE") {
    return "postgres";
  }

  return "mysql";
};

class Loader {
  protected query: ConnectionQueryOp;
  protected qb: Knex<any, unknown[]>;
  protected share: LoadShare;
  protected stageName: string;
  protected tableName: string;
  protected shareName: string;

  constructor(query: ConnectionQueryOp, share: LoadShare) {
    this.query = query;
    this.share = share;

    this.qb = knex({
      client: getDialectFromDestination(share.destination.destinationType),
    });
    this.stageName = getTempStageName(share.warehouseId);
    this.tableName = getUniqueTableName({
      nickname: share.destination.nickname,
      warehouseId: share.warehouseId,
    });
    this.shareName = getUniqueShareName({
      nickname: share.destination.nickname,
      warehouseId: share.warehouseId,
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
