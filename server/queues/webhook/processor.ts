import { Prisma } from "@prisma/client";
import { Job } from "bullmq";
import got from "got";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";

export default async function (
  job: Job<{
    webhook: Prisma.WebhookGetPayload<{
      select: {
        id: true;
      };
    }>;
  }>,
) {
  const webhook = await db.webhook.findUnique({
    where: {
      id: job.data.webhook.id,
    },
  });
  if (!webhook) {
    throw new Error(`Webhook id not found for webhook=${job.data.webhook.id}`)
  }
  try {
    const res = await got.post(webhook.url, {'body': });
    return "true";
  } catch (e) {}
  logger.info("Processor is handling job with webhook:", job.data.webhook.id);
  return "true";
}
