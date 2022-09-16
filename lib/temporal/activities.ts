import { Prisma, TransferStatus } from "@prisma/client";
import { parseISO } from "date-fns";
import { default as knex } from "knex";
import zlib from "node:zlib";
import crypto from "crypto";
import got from "got";
import * as csv from "csv";
import { z } from "zod";

import { BigQueryServiceAccount, useConnection } from "../connections/index.js";
import { useBucketConnection } from "../connections/bucket.js";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { uploadObject } from "../aws/upload.js";
import { getPresignedURL } from "../aws/signer.js";
import { LoadingActions } from "../load/index.js";
import SnowflakeLoader from "../snowflake/load.js";
import RedshiftLoader from "../redshift/load.js";
import BigQueryLoader from "../bigquery/load.js";

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
};

export async function processTransfer({ id }: { id: number }) {
  let loader: LoadingActions | null = null;
  try {
    const transfer = await db.transfer.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        configuration: {
          select: {
            id: true,
            tenantId: true,
            warehouseId: true,
            lastModifiedAt: true,
            destination: {
              select: {
                id: true,
                nickname: true,
                destinationType: true,
                warehouse: true,
                host: true,
                port: true,
                username: true,
                password: true,
                database: true,
                schema: true,
                serviceAccountJson: true,
                stagingBucket: {
                  select: {
                    bucketName: true,
                    bucketRegion: true,
                  },
                },
              },
            },
            columns: {
              select: {
                nameInSource: true,
                nameInDestination: true,
                viewColumn: true,
              },
            },
            view: {
              select: {
                id: true,
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
    });

    if (!transfer) {
      throw new Error(`Transfer with ID ${id} does not exist`);
    }

    if (transfer.status !== "STARTED") {
      throw new Error(
        `Transfer with ID ${transfer.id} has already been processed`,
      );
    }

    await db.transfer.update({
      where: {
        id,
      },
      data: {
        status: "PENDING",
      },
    });

    const configuration = transfer.configuration;
    if (!configuration) {
      throw new Error(
        `No configuration found for transfer with ID ${transfer.id}, aborting`,
      );
    }

    const destination = configuration.destination;
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
      warehouse: destWarehouse,
      serviceAccountJson,
    } = destination;

    const sourceConnection = await useConnection({
      dbType: srcDbType,
      host: srcHost,
      port: srcPort,
      username: srcUsername,
      password: srcPassword || undefined,
      database: srcDatabase,
    });

    if (sourceConnection.error) {
      throw new Error(
        `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
      );
    }

    const qb = knex({ client: source.sourceType.toLowerCase() });
    const lastModifiedColumn = view.columns.find(
      (col) => col.isLastModified,
    )?.name;

    if (!lastModifiedColumn) {
      throw new Error(
        `Missing lastModified column for configuration ${view.id}`,
      );
    }

    const tenantColumn = view.columns.find((col) => col.isTenantColumn)?.name;

    if (!tenantColumn) {
      throw new Error(`Missing lastModified column for view ${view.id}`);
    }

    const lastModifiedQuery = qb
      .select(lastModifiedColumn)
      .from(view.tableName)
      .where(tenantColumn, "=", configuration.tenantId)
      .orderBy(lastModifiedColumn, "desc")
      .limit(1)
      .toSQL()
      .toNative();
    const { rows } = await sourceConnection.query(lastModifiedQuery);

    if (!rows[0]) {
      logger.warn(
        lastModifiedQuery,
        "Zero rows returned by lastModified query",
      );

      return db.transfer.update({
        where: { id: transfer.id },
        data: { status: "CANCELLED" },
      });
    }

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
          .where(tenantColumn, "=", configuration.tenantId)
          .where(
            lastModifiedColumn,
            ">",
            configuration.lastModifiedAt.toISOString(),
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
          warehouse: destWarehouse,
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

        loader = new SnowflakeLoader(
          destConnection.query,
          transfer.configuration,
          destConnection.queryUnsafe,
        );

        // starting load into Snowflake
        await loader.beginTransaction();

        // table should exist after creating share
        // need to create in cases when directly pushing
        await loader.createTable({
          schema: destSchema,
          database: destDatabase,
        });

        await loader.stage(queryDataStream, destSchema);
        await loader.upsert(destSchema);
        await loader.tearDown(destSchema);

        // committing load into Snowflake
        await loader.commitTransaction();

        await finalizeTransfer({
          transferId: transfer.id,
          status: "COMPLETE",
        });

        break;
      }
      case "REDSHIFT": {
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
          dbType: "REDSHIFT",
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

        loader = new RedshiftLoader(
          destConnection.query,
          transfer.configuration,
          destConnection.queryUnsafe,
        );

        // Starting load into Redshift
        await loader.beginTransaction();

        // table should exist after creating share
        // need to create in cases when directly pushing
        await loader.createTable({
          schema: destSchema,
          database: destDatabase,
        });

        await loader.stage(queryDataStream);
        await loader.upsert();
        await loader.tearDown();

        // Committing load into Redshift
        await loader.commitTransaction();

        await finalizeTransfer({
          transferId: transfer.id,
          status: "COMPLETE",
        });

        break;
      }

      case "BIGQUERY": {
        const credentialsExist =
          !!destUsername &&
          !!destDatabase &&
          !!destSchema &&
          !!serviceAccountJson;

        if (!credentialsExist) {
          throw new Error(
            `Incomplete credentials for destination with ID ${destination.id}, aborting transfer ${transfer.id}`,
          );
        }
        const serviceAccount: BigQueryServiceAccount =
          JSON.parse(serviceAccountJson);

        const destConnection = await useConnection({
          dbType: "BIGQUERY",
          database: destDatabase,
          username: destUsername,
          schema: destSchema,
          serviceAccount,
        });

        if (destConnection.error) {
          throw new Error(
            `Destination with ID ${destination.id} is unreachable, aborting transfer ${transfer.id}`,
          );
        }

        loader = new BigQueryLoader(
          destConnection.query,
          transfer.configuration,
          destConnection.queryUnsafe,
        );

        if (!destination.stagingBucket) {
          throw new Error("Staging bucket required for loading into BigQuery");
        }

        const { bucketName } = destination.stagingBucket;
        const bucketConnection = await useBucketConnection({
          projectId: destDatabase,
          bucketName,
          serviceAccount,
        });

        if (bucketConnection.error) {
          throw new Error(
            `Destination with ID ${destination.id} has unreachable staging bucket, aborting transfer ${transfer.id}`,
          );
        }

        // table should exist after creating share
        // need to create in cases when directly pushing
        await loader.createTable({
          schema: destSchema,
          database: destDatabase,
        });

        await loader.stage(
          queryDataStream,
          destSchema,
          bucketConnection.bucket,
          serviceAccount,
        );
        await loader.upsert(destSchema, destDatabase);
        await loader.tearDown(destSchema);

        await finalizeTransfer({
          transferId: transfer.id,
          status: "COMPLETE",
        });

        break;
      }
    }

    await db.configuration.update({
      where: { id: configuration.id },
      data: { lastModifiedAt: newLastModifiedAt },
    });
  } catch (error) {
    logger.error(error);

    // rollback if loader has been initialized
    // todo(ianedwards): review transactions for BigQuery
    await loader?.rollbackTransaction();

    await finalizeTransfer({
      transferId: id,
      status: "FAILED",
    });
  }
}

export async function getWebhooks() {
  return db.webhook.findMany({
    select: { id: true, url: true, secretKey: true },
  });
}

export async function processWebhook({
  transferId,
  webhook,
}: {
  transferId: number;
  webhook: Prisma.WebhookGetPayload<{
    select: { id: true; url: true; secretKey: true };
  }>;
}) {
  try {
    const transfer = await db.transfer.findUnique({
      where: {
        id: transferId,
      },
      select: {
        id: true,
        status: true,
        configuration: {
          select: {
            tenantId: true,
            nickname: true,
            lastModifiedAt: true,
          },
        },
        result: {
          select: {
            finalizedAt: true,
            objectUrl: true,
          },
        },
      },
    });

    if (!transfer) {
      throw new Error(`Transfer id not found for Transfer=${transferId}`);
    }

    // todo(ianedwards): increase event type specificity as needed
    const body = {
      type: "transfer.finalized",
      object: transfer,
    };

    await got.post(webhook.url, {
      headers: {
        "X-Pipebird-Signature": crypto
          .createHmac("sha256", webhook.secretKey)
          .update(JSON.stringify(body))
          .digest("hex"),
      },
      json: body,
    });
  } catch (error) {
    logger.error(error);
  }
}
