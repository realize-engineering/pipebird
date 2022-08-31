import { Prisma } from "@prisma/client";
import { Queue, Worker } from "bullmq";

import processor from "./processor.js";

import { env } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { queueNames } from "../../../lib/queues.js";

export type WebhookQueueJobData = {
  transfer: Prisma.TransferGetPayload<{
    select: {
      id: true;
    };
  }>;
  webhook: Prisma.WebhookGetPayload<{
    select: {
      id: true;
    };
  }>;
};

const webhookQueue = new Queue<WebhookQueueJobData>(queueNames.SEND_WEBHOOK, {
  connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
});

const worker = new Worker(queueNames.SEND_WEBHOOK, processor, {
  connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
  concurrency: 1, // TODO(cumason) increase concurrency/create more workers
});

worker.on("completed", (job) =>
  logger.info(`Completed job ${job.id} successfully.`),
);
worker.on("failed", (job, err) =>
  logger.info(`Failed job ${job.id} with ${err}`),
);

worker.on("progress", (job, progress) =>
  logger.info(`Progress for job ${job.id}=${progress}`),
);

export { webhookQueue };
