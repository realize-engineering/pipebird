import { Prisma } from "@prisma/client";
import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";

export default async function (
  job: Job<{
    transfer: Prisma.TransferGetPayload<{
      select: {
        id: true;
        status: true;
        destinationId: true;
        finalizedAt: true;
      };
    }>;
  }>,
) {
  logger.info("Processor is handling job with transfer:", job.data.transfer);
  return "true";
}
