import { Prisma, Transfer } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";

const transferTypeValidator = z.enum([
  "PENDING",
  "COMPLETE",
  "CANCELLED",
  "STARTED",
  "FAILED",
]);

class TransferModel {
  static create = async (
    args: Omit<Prisma.TransferCreateInput, "status"> & {
      status: z.infer<typeof transferTypeValidator>;
    },
    client: Prisma.TransactionClient = db,
  ) => {
    return client.transfer.create({
      data: {
        ...args,
        status: args.status,
      },
      select: {
        id: true,
      },
    });
  };

  static parse = <T extends Pick<Partial<Transfer>, "status">>(
    transfer: T,
  ): T & { status: z.infer<typeof transferTypeValidator> | "UNKNOWN" } => {
    const validation = transferTypeValidator.safeParse(transfer.status);
    if (!validation.success) {
      return { ...transfer, status: "UNKNOWN" };
    }
    return { ...transfer, status: validation.data };
  };
}

export { TransferModel };
