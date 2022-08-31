import { Job } from "bullmq";
import got from "got";
import crypto from "crypto";

import { logger } from "../../../lib/logger.js";
import { db } from "../../../lib/db.js";
import { WebhookQueueJobData } from "./scheduler.js";

export default async function (job: Job<WebhookQueueJobData>) {
  try {
    const webhook = await db.webhook.findUnique({
      where: {
        id: job.data.webhook.id,
      },
    });

    if (!webhook) {
      throw new Error(
        `Webhook id not found for webhook=${job.data.webhook.id}`,
      );
    }

    const transfer = await db.transfer.findUnique({
      where: {
        id: job.data.transfer.id,
      },
      select: {
        id: true,
        status: true,
        destinationId: true,
        result: {
          select: {
            finalizedAt: true,
            objectUrl: true,
          },
        },
      },
    });

    if (!transfer) {
      throw new Error(
        `Transfer id not found for Transfer=${job.data.webhook.id}`,
      );
    }

    // todo(ianedwards): increase event type specificity as needed
    const body = JSON.stringify({
      type: "transfer.finalized",
      object: transfer,
    });

    await got.post(webhook.url, {
      headers: {
        "Content-Type": "application/json",
        "X-Pipebird-Signature": crypto
          .createHmac("sha1", webhook.secretKey)
          .update(body)
          .digest("hex"),
      },
      body,
    });
  } catch (error) {
    logger.error(error);
  }
}
