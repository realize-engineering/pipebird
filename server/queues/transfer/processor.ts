import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";
import { useConnection } from "../../../lib/connections.js";
import {
  buildInitiateUpsert,
  createStage,
  getUniqueTableName,
  removeLoadedData,
} from "../../../lib/snowflake/load.js";
import zlib from "node:zlib";
import { z } from "zod";
import { parseISO } from "date-fns";
import * as csv from "csv";
import { default as knex } from "knex";
import { TransferStatus } from "@prisma/client";
import { getPresignedURL } from "../../../lib/aws/signer.js";
import { webhookQueue } from "../webhook/scheduler.js";
import { queueNames } from "../../../lib/queues.js";

const finalizeTransfer = async ({
  transferId,
  status,
  objectUrl,
}: {
  transferId: number;
  status: TransferStatus;
  objectUrl?: string;
}) => {
  await db.transfer.update({
    where: {
      id: transferId,
    },
    data: {
      status,
    },
  });

  await db.transferResult.upsert({
    where: {
      transferId,
    },
    update: {
      finalizedAt: new Date(),
      objectUrl,
    },
    create: {
      transferId,
      finalizedAt: new Date(),
      objectUrl,
    },
  });

  const webhooks = await db.webhook.findMany();
  webhooks.forEach(
    async (wh) =>
      await webhookQueue.add(queueNames.SEND_WEBHOOK, {
        webhook: { id: wh.id },
        transfer: { id: transferId },
      }),
  );
};

export default async function (job: Job<TransferQueueJobData>) {
  try {
    const transfer = await db.transfer.findUnique({
      where: { id: job.data.id },
      select: {
        id: true,
        status: true,
        destination: {
          select: {
            id: true,
            nickname: true,
            destinationType: true,
            tenantId: true,
            lastModifiedAt: true,
            host: true,
            port: true,
            username: true,
            password: true,
            database: true,
            schema: true,
            configuration: {
              select: {
                columns: {
                  select: {
                    nameInSource: true,
                    nameInDestination: true,
                  },
                },
                view: {
                  select: {
                    tableName: true,
                    columns: true,
                    source: {
                      select: {
                        id: true,
                        host: true,
                        port: true,
                        username: true,
                        password: true,
                        database: true,
                        sourceType: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!transfer) {
      throw new Error(`Transfer with ID ${job.data.id} does not exist`);
    }

    if (transfer.status !== "STARTED") {
      throw new Error(
        `Transfer with ID ${transfer.id} has already been processed`,
      );
    }

    await db.transfer.update({
      where: {
        id: job.data.id,
      },
      data: {
        status: "PENDING",
      },
    });

    logger.info("Processor is handling job with transfer:", job.data);

    const destination = transfer.destination;
    const configuration = destination.configuration;

    if (!configuration) {
      throw new Error(
        `No configuration found for transfer with ID ${transfer.id}, aborting`,
      );
    }

    const view = configuration.view;
    const source = view.source;

    const {
      sourceType: srcDbType,
      host: srcHost,
      port: srcPort,
      username: srcUsername,
      password: srcPassword,
      database: srcDatabase,
    } = source;

    const {
      host: destHost,
      port: destPort,
      username: destUsername,
      password: destPassword,
      database: destDatabase,
      schema: destSchema,
    } = destination;

    const sourceConnection = await useConnection({
      dbType: srcDbType,
      host: srcHost,
      port: srcPort,
      username: srcUsername,
      password: srcPassword,
      database: srcDatabase,
    });

    if (sourceConnection.error) {
      throw new Error(
        `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
      );
    }

    const qb = knex({ client: source.sourceType.toLowerCase() });
    const lastModifiedColumn = view.columns.filter(
      (col) => col.isLastModified,
    )[0].name;
    const { rows } = await sourceConnection.query(
      qb
        .select(lastModifiedColumn)
        .from(view.tableName)
        .orderBy(lastModifiedColumn, "desc")
        .limit(1)
        .toSQL()
        .toNative(),
    );
    const newLastModifiedAt = z
      .string()
      .transform((str) => parseISO(str))
      .or(z.date())
      .parse(rows[0][lastModifiedColumn]);

    const queryDataStream = (
      await sourceConnection.queryStream(
        qb
          .select(
            configuration.columns.map(
              (col) => `${col.nameInSource} as ${col.nameInDestination}`,
            ),
          )
          .from(
            qb
              .select(view.columns.map((col) => col.name))
              .from(view.tableName)
              .as("t"),
          )
          .where(
            view.columns.filter((col) => col.isTenantColumn)[0].name,
            "=",
            destination.tenantId,
          )
          .where(
            lastModifiedColumn,
            ">",
            destination.lastModifiedAt.toISOString(),
          )
          .toSQL()
          .toNative(),
      )
    )
      .pipe(
        csv.stringify({
          delimiter: ",",
          header: true,
          bom: true,
        }),
      )
      .pipe(zlib.createGzip());

    switch (destination.destinationType) {
      case "PROVISIONED_S3": {
        const { key } = await uploadObject({
          contents: queryDataStream,
          extension: "gz",
        });

        const objectUrl = await getPresignedURL({ key, extension: "gz" });

        await finalizeTransfer({
          transferId: transfer.id,
          status: "COMPLETE",
          objectUrl,
        });

        break;
      }

      case "SNOWFLAKE": {
        const credentialsExist =
          !!destHost &&
          !!destPort &&
          !!destUsername &&
          !!destPassword &&
          !!destDatabase &&
          !!destSchema;

        if (!credentialsExist) {
          throw new Error(
            `Incomplete credentials for destination with ID ${destination.id}, aborting transfer ${transfer.id}`,
          );
        }

        const destConnection = await useConnection({
          dbType: "SNOWFLAKE",
          host: destHost,
          port: destPort,
          username: destUsername,
          password: destPassword,
          database: destDatabase,
          schema: destSchema,
        });

        if (destConnection.error) {
          throw new Error(
            `Destination with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
          );
        }

        const pathPrefix = `snowflake/${destination.id}`;
        await uploadObject({
          contents: queryDataStream,
          pathPrefix,
          extension: "gz",
        });

        const tempStageName = `SharedData_TempStage_${
          destination.id
        }_${new Date().getTime()}`;

        await createStage({
          queryUnsafe: destConnection.queryUnsafe,
          schema: destSchema,
          tempStageName,
          pathPrefix,
        });

        const primaryKeyCol = destination.configuration.view.columns.filter(
          (col) => col.isPrimaryKey,
        )[0].name;
        const tableName = getUniqueTableName({
          nickname: destination.nickname,
          destinationId: destination.id,
          tenantId: destination.tenantId,
        });
        const upsertOperation = buildInitiateUpsert({
          columns: destination.configuration.columns,
          schema: destSchema,
          stageName: tempStageName,
          tableName,
          primaryKeyCol,
        });
        await destConnection.query(upsertOperation);

        await removeLoadedData({
          query: destConnection.query,
          schema: destSchema,
          tempStageName,
        });

        await finalizeTransfer({
          transferId: transfer.id,
          status: "COMPLETE",
        });

        break;
      }
    }

    await db.destination.update({
      where: { id: destination.id },
      data: { lastModifiedAt: newLastModifiedAt },
    });
  } catch (error) {
    logger.error(error);

    // todo(ianedwards): perform any necessary rollbacks on external stages on failure

    await finalizeTransfer({
      transferId: job.data.id,
      status: "FAILED",
    });
  }
}
