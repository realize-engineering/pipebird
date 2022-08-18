import { Prisma } from "@prisma/client";
import { db } from "../db.js";

type CreateLogEvent = { eventId: number; meta: string } & (
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
      source: "Transfer";
      action: "CREATE" | "DELETE";
    }
);

class LogModel {
  static create(event: CreateLogEvent, client: Prisma.TransactionClient = db) {
    return client.logs.create({
      data: {
        eventId: event.eventId.toString(),
        eventSource: event.source,
        eventAction: event.action,
        meta: event.meta,
      },
    });
  }
}

export { LogModel };
