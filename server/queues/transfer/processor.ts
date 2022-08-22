import { Job } from "bullmq";
import { QueryTypes } from "sequelize";
import { getConnection } from "../../../lib/connections.js";
import { logger } from "../../../lib/logger.js";
import dfd from "danfojs-node";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";

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

    const rows = await conn.connection.query(view.tableExpression, {
      type: QueryTypes.SELECT,
    });

    const df = new dfd.DataFrame(rows);

    switch (destination.destinationType) {
      case "PROVISIONED_S3": {
        await uploadObject(Buffer.from(df.toCSV()));
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
