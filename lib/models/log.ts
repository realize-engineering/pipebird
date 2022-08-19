import { Prisma } from "@prisma/client";
import { logger } from "../logger.js";

// You are only allowed to append to this log event type.
// Deleting fields will ruin the underlying database type
// safety on our log model.
type CreateLogEvent = { eventId: number; meta: { message: string } } & (
  | {
      source: "SOURCE";
      action: "CREATE" | "DELETE";
    }
  | {
      source: "VIEW";
      action: "CREATE" | "DELETE";
    }
  | {
      source: "CONFIGURATION";
      action: "CREATE" | "DELETE";
    }
  | {
      source: "DESTINATION";
      action: "CREATE" | "DELETE";
    }
  | {
      source: "TRANSFER";
      action: "CREATE" | "DELETE" | "UPDATE";
    }
);

class LogModel {
  static async create(event: CreateLogEvent, client: Prisma.TransactionClient) {
    logger.info({ storedLogEvent: event.meta });
    const logCreate = await client.logs.create({
      data: {
        eventId: event.eventId.toString(),
        eventSource: event.source,
        eventAction: event.action,
        meta: JSON.stringify(event.meta),
      },
    });
    return logCreate;
  }
}

export { LogModel };
