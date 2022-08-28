import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";
import { getConnection } from "../../../lib/connections.js";
import { getSnowflakeConnection } from "../../../lib/snowflake/connection.js";
import { env } from "../../../lib/env.js";
import {
  buildInitiateUpsert,
  getUniqueTableName,
} from "../../../lib/snowflake/load.js";

const buildTemplatedQuery = ({
  viewColumns,
  resultColumns,
  tableName,
  tenantColumn,
  tenantId,
  lastModifiedColumn,
  lastModifiedAt,
}: {
  viewColumns: string[];
  resultColumns: { nameInSource: string; nameInDestination: string }[];
  tableName: string;
  tenantColumn: string;
  tenantId: string;
  lastModifiedColumn: string;
  lastModifiedAt: string;
}) =>
  `SELECT ${resultColumns
    .map(
      (column) =>
        `"${column.nameInSource.replaceAll(
          '"',
          "",
        )}" AS "${column.nameInDestination.replaceAll('"', "")}"`,
    )
    .join(", ")} FROM (SELECT ${viewColumns
    .map((column) => `"${column.replaceAll('"', "")}"`)
    .join(
      ", ",
    )} FROM "${tableName}") AS t WHERE "${tenantColumn}" = '${tenantId}' AND "${lastModifiedColumn}" > '${lastModifiedAt}'`;

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
      username: destUsername,
      password: destPassword,
      database: destDatabase,
      schema: destSchema,
    } = destination;

    const sourceConnection = await getConnection({
      dbType: srcDbType,
      host: srcHost,
      port: srcPort,
      username: srcUsername,
      password: srcPassword,
      database: srcDatabase,
    });

    if (sourceConnection.status !== "REACHABLE") {
      throw new Error(
        `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
      );
    }

    const queryDataStream = sourceConnection.extractToCsvUnsafe(
      buildTemplatedQuery({
        viewColumns: view.columns.map((col) => col.name),
        resultColumns: configuration.columns,
        tableName: view.tableName,
        tenantColumn: view.columns.filter((col) => col.isTenantColumn)[0].name,
        tenantId: destination.tenantId,
        lastModifiedColumn: view.columns.filter((col) => col.isLastModified)[0]
          .name,
        lastModifiedAt: destination.lastModifiedAt.toISOString(),
      }),
    );

    switch (destination.destinationType) {
      case "PROVISIONED_S3": {
        await uploadObject(queryDataStream);
        break;
      }

      case "SNOWFLAKE": {
        const credentialsExist =
          !!destHost &&
          !!destUsername &&
          !!destPassword &&
          !!destDatabase &&
          !!destSchema;

        if (!credentialsExist) {
          throw new Error(
            `Incomplete credentials for destination with ID ${destination.id}, aborting transfer ${transfer.id}`,
          );
        }

        const destConnection = await getSnowflakeConnection({
          host: destHost,
          username: destUsername,
          password: destPassword,
          database: destDatabase,
          schema: destSchema,
        });

        if (destConnection.status !== "REACHABLE") {
          throw new Error(
            `Destination with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
          );
        }

        const pathPrefix = `snowflake/${destination.tenantId}/${destination.id}`;
        await uploadObject(queryDataStream, pathPrefix);

        const tempStageName = `SharedData_TempTable_${
          destination.id
        }_${new Date().getTime()}`;

        logger.info({ schemaName: destination.schema });

        const createStageOperation = `
          create or replace stage "${destination.schema}"."${tempStageName}"
          url='s3://${env.PROVISIONED_BUCKET_NAME}/${pathPrefix}'
          credentials = (aws_key_id='${env.S3_USER_ACCESS_ID}' aws_secret_key='${env.S3_USER_SECRET_KEY}')
          encryption = (TYPE='AWS_SSE_S3')
          file_format = (TYPE='CSV' FIELD_DELIMITER=',' SKIP_HEADER=1);
        `;
        await destConnection.client.query(createStageOperation);

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
        await destConnection.client.query(upsertOperation);

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
  } catch (error) {
    logger.error(error);

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
