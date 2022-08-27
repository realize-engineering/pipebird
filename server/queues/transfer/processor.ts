import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";
import { getConnection } from "../../../lib/connections.js";

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
            destinationType: true,
            tenantId: true,
            lastModifiedAt: true,
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
      sourceType: dbType,
      host,
      port,
      username,
      password,
      database,
    } = source;

    const conn = await getConnection({
      dbType,
      host,
      port,
      username,
      password,
      database,
    });

    if (conn.status !== "REACHABLE") {
      throw new Error(
        `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
      );
    }

    switch (destination.destinationType) {
      case "PROVISIONED_S3": {
        await uploadObject(
          conn.extractToCsvUnsafe(
            buildTemplatedQuery({
              viewColumns: view.columns.map((col) => col.name),
              resultColumns: configuration.columns,
              tableName: view.tableName,
              tenantColumn: view.columns.filter((col) => col.isTenantColumn)[0]
                .name,
              tenantId: destination.tenantId,
              lastModifiedColumn: view.columns.filter(
                (col) => col.isLastModified,
              )[0].name,
              lastModifiedAt: destination.lastModifiedAt.toISOString(),
            }),
          ),
        );
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
