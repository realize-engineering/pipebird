import { DestinationType, Prisma } from "@prisma/client";
import { default as knex, Knex } from "knex";
import { Gzip } from "zlib";

import { ConnectionQueryOp } from "../connections.js";

export type LoadShare = Prisma.ShareGetPayload<{
  select: {
    id: true;
    tenantId: true;
    warehouseAccountId: true;
    destination: {
      select: {
        nickname: true;
        destinationType: true;
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
  warehouseAccountId,
}: {
  nickname: string;
  warehouseAccountId: string;
}) => `SharedData_${nickname.replaceAll(" ", "_")}_${warehouseAccountId}`;

const getUniqueShareName = ({
  nickname,
  warehouseAccountId,
}: {
  nickname: string;
  warehouseAccountId: string;
}) => `Share_${nickname.replaceAll(" ", "_")}_${warehouseAccountId}`;

const getTempStageName = (warehouseAccountId: string) =>
  `SharedData_TempStage_${warehouseAccountId}_${new Date().getTime()}`;

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
    this.stageName = getTempStageName(share.warehouseAccountId);
    this.tableName = getUniqueTableName({
      nickname: share.destination.nickname,
      warehouseAccountId: share.warehouseAccountId,
    });
    this.shareName = getUniqueShareName({
      nickname: share.destination.nickname,
      warehouseAccountId: share.warehouseAccountId,
    });
  }
}

interface LoadingActions extends Loader {
  createShare: (params: { schema: string; database: string }) => Promise<void>;
  createTable: (params: { schema: string; database: string }) => Promise<void>;
  stage: (contents: Gzip) => Promise<void>;
  upsert: (schema?: string) => Promise<void>;
  tearDown: (schema?: string) => Promise<void>;
}

export { LoadingActions, Loader };
