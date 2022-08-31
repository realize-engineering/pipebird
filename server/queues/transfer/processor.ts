import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";
import { useConnection } from "../../../lib/connections.js";
import { env } from "../../../lib/env.js";
import {
  buildInitiateUpsert,
  getUniqueTableName,
  removeLoadedData,
} from "../../../lib/snowflake/load.js";
import zlib from "node:zlib";
import { z } from "zod";
import { parseISO } from "date-fns";
import * as csv from "csv";
import { default as knex } from "knex";

export default async function (job: Job<TransferQueueJobData>) {
  try {
    const transfer = await db.transfer.findUnique({
      where: { id: job.data.id },
      select: {
        id: true,
        status: true,
        finalizedAt: true,
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
        await uploadObject({ contents: queryDataStream, extension: "gz" });
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

        const pathPrefix = `snowflake/${destination.tenantId}/${destination.id}`;
        await uploadObject({
          contents: queryDataStream,
          pathPrefix,
          extension: "gz",
        });

        const tempStageName = `SharedData_TempStage_${
          destination.id
        }_${new Date().getTime()}`;

        const createStageOperation = `
          create or replace stage "${destSchema}"."${tempStageName}"
            url='s3://${env.PROVISIONED_BUCKET_NAME}/${pathPrefix}'
            credentials = (aws_key_id='${env.S3_USER_ACCESS_ID}' aws_secret_key='${env.S3_USER_SECRET_KEY}')
            encryption = (TYPE='AWS_SSE_KMS' KMS_KEY_ID='${env.KMS_KEY_ID}')
            file_format = (TYPE='CSV' FIELD_DELIMITER=',' SKIP_HEADER=1);
          `;

        await destConnection.queryUnsafe(createStageOperation);

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

        break;
      }
    }

    await db.transfer.update({
      where: {
        id: transfer.id,
      },
      data: {
        status: "COMPLETE",
        finalizedAt: new Date(),
      },
    });

    await db.destination.update({
      where: { id: destination.id },
      data: { lastModifiedAt: newLastModifiedAt },
    });
  } catch (error) {
    logger.error(error);

    // todo(ianedwards): perform any necessary rollbacks on external stages on failure

    await db.transfer.update({
      where: {
        id: job.data.id,
      },
      data: {
        status: "FAILED",
        finalizedAt: new Date(),
      },
    });
  }
}
