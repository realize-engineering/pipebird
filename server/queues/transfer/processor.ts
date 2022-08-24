import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";
import { getConnection } from "../../../lib/connections.js";

export default async function (job: Job<TransferQueueJobData>) {
  try {
    await db.transfer.update({
      where: {
        id: job.data.id,
      },
      data: {
        status: "PENDING",
      },
    });

    logger.info("Processor is handling job with transfer:", job.data);

    const transfer = job.data;
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
      name: dbName,
    } = source;

    const conn = await getConnection({
      dbType,
      host,
      port,
      username,
      password,
      dbName,
    });

    if (conn.status !== "REACHABLE") {
      throw new Error(
        `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
      );
    }

    switch (destination.destinationType) {
      case "PROVISIONED_S3": {
        await uploadObject(
          conn.extractToCsv(
            `SELECT * FROM (${view.tableExpression}) AS t WHERE "${view.tenantColumn}" = '${destination.tenantId}'`, // TODO(timothygoltser): use tagged template literal
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
      },
    });
  }
}
