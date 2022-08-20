import { Prisma } from "@prisma/client";
import { logger } from "../logger.js";

// You are only allowed to append to this log event type.
// Deleting fields will ruin the underlying database type
// safety on our log model.
type CreateLogEvent = { domainId: number; meta: { message: string } } & (
  | {
      domain: "SOURCE";
      action: "CREATE" | "DELETE";
    }
  | {
      domain: "VIEW";
      action: "CREATE" | "DELETE";
    }
  | {
      domain: "CONFIGURATION";
      action: "CREATE" | "DELETE";
    }
  | {
      domain: "DESTINATION";
      action: "CREATE" | "DELETE";
    }
  | {
      domain: "TRANSFER";
      action: "CREATE" | "DELETE" | "UPDATE";
    }
);

class LogModel {
  static create(event: CreateLogEvent, client: Prisma.TransactionClient) {
    logger.info({ storedLogEvent: event.meta });

    return client.log.create({
      data: {
        domainId: event.domainId.toString(),
        domain: event.domain,
        action: event.action,
        meta: event.meta,
      },
    });
  }
}

export { LogModel };
