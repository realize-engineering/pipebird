import { Job } from "bullmq";
import { QueryTypes } from "sequelize";
import { getConnection } from "../../../lib/connections.js";
import { logger } from "../../../lib/logger.js";
import dfd from "danfojs-node";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";

export default async function (
  job: Job<{
    transfer: TransferQueueJobData;
  }>,
) {
  logger.info("Processor is handling job with transfer:", job.data.transfer);

  const transfer = job.data.transfer;
  const destination = transfer.destination;
  const configuration = destination.configuration;

  if (!configuration) {
    logger.error(
      `No configuration found for transfer with ID ${transfer.id}, aborting`,
    );

    return "false";
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
    logger.error(
      `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
    );
    return "false";
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

  return "true";
}
