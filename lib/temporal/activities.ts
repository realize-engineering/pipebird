import { parseISO } from "date-fns";
import { default as knex } from "knex";
import { z } from "zod";
import { useConnection } from "../connections.js";
import { db } from "../db.js";
import { logger } from "../logger.js";
import * as csv from "csv";
import { uploadObject } from "../aws/upload.js";
import { getPresignedURL } from "../aws/signer.js";
import zlib from "node:zlib";
import SnowflakeLoader from "../snowflake/load.js";
import RedshiftLoader from "../redshift/load.js";
import { TransferStatus } from "@prisma/client";

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

  // TODO: implement separate activity
  // const webhooks = await db.webhook.findMany();
  // webhooks.forEach((wh) =>
  //   webhookQueue.add(queueNames.SEND_WEBHOOK, {
  //     webhook: { id: wh.id },
  //     transfer: { id: transferId },
  //   }),
  // );
};

export async function processTransfer({ id }: { id: number }) {
  try {
    const transfer = await db.transfer.findUnique({
      where: { id },
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
            configurationId: true,
            configuration: {
              select: {
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
      .where(tenantColumn, "=", destination.tenantId)
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
          .where(tenantColumn, "=", destination.tenantId)
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

        const loader = new SnowflakeLoader(
          destConnection.query,
          destination,
          destConnection.queryUnsafe,
        );

        await loader.createTable({
          schema: destSchema,
          database: destDatabase,
        });
        await loader.stage(queryDataStream, destSchema);
        await loader.upsert(destSchema);
        await loader.tearDown(destSchema);

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

        const loader = new RedshiftLoader(
          destConnection.query,
          destination,
          destConnection.queryUnsafe,
        );

        await loader.createTable({
          schema: destSchema,
          database: destDatabase,
        });
        await loader.stage(queryDataStream);
        await loader.upsert();
        await loader.tearDown();

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
      transferId: id,
      status: "FAILED",
    });
  }
}
