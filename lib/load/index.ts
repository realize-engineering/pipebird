import { DestinationType, Prisma } from "@prisma/client";
import { default as knex, Knex } from "knex";
import { Gzip } from "zlib";

import { ConnectionQueryOp } from "../connections.js";

export type LoadDestination = Prisma.DestinationGetPayload<{
  select: {
    id: true;
    tenantId: true;
    configurationId: true;
    destinationType: true;
    nickname: true;
    configuration: {
      select: {
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
  tenantId,
  destinationId,
}: {
  nickname: string;
  tenantId: string;
  destinationId: number;
}) => `ShareData_${nickname.replaceAll(" ", "_")}_${tenantId}_${destinationId}`;

const getTempStageName = (destinationId: number) =>
  `SharedData_TempStage_${destinationId}_${new Date().getTime()}`;

const getDialectFromDestination = (type: DestinationType) => {
  if (type === "POSTGRES" || type === "REDSHIFT" || type === "SNOWFLAKE") {
    return "postgres";
  }

  return "mysql";
};

class Loader {
  protected query: ConnectionQueryOp;
  protected qb: Knex<any, unknown[]>;
  protected destination: LoadDestination;
  protected tableName: string;
  protected stageName: string;

  constructor(query: ConnectionQueryOp, destination: LoadDestination) {
    this.query = query;
    this.destination = destination;

    this.qb = knex({
      client: getDialectFromDestination(destination.destinationType),
    });
    this.tableName = getUniqueTableName({
      nickname: destination.nickname,
      tenantId: destination.tenantId,
      destinationId: destination.id,
    });
    this.stageName = getTempStageName(destination.id);
  }
}

interface LoadingActions extends Loader {
  createTable: (params: { schema: string; database: string }) => Promise<void>;
  stage: (contents: Gzip) => Promise<void>;
  upsert: (schema?: string) => Promise<void>;
  tearDown: (schema?: string) => Promise<void>;
}

export { LoadingActions, Loader };
