import { Prisma, Transfer } from "@prisma/client";
import { z } from "zod";
import { EnumValidator } from "./enum_validator.js";

// TODO(cumason) make struct instead of class of static methods
class TransferModel {
  static pendingTypes = ["PENDING", "STARTED", "UNKNOWN"] as const;
  static typeValidator = new EnumValidator(
    z.enum(["PENDING", "COMPLETE", "CANCELLED", "STARTED", "FAILED"]),
  );

  static create = (
    args: Omit<Prisma.TransferCreateInput, "status"> & {
      status: z.infer<typeof TransferModel.typeValidator.validator>;
    },
    client: Prisma.TransactionClient,
  ) => {
    return client.transfer.create({
      data: {
        ...args,
        status: args.status,
      },
      select: {
        id: true,
        status: true,
        destinationId: true,
        finalizedAt: true,
      },
    });
  };

  static parse = <T extends Pick<Partial<Transfer>, "status">>(
    transfer: T,
  ): T & {
    status: z.infer<typeof TransferModel.typeValidator.validator> | "UNKNOWN";
  } => {
    return {
      ...transfer,
      status: TransferModel.typeValidator.cast(transfer.status),
    };
  };

  static update = ({
    data,
    where,
    client,
  }: {
    data: Prisma.TransferUpdateInput & {
      status?: z.infer<typeof TransferModel.typeValidator.validator>;
    };
    where: Prisma.TransferWhereInput & { id: number };
    client: Prisma.TransactionClient;
  }) => {
    const { status, ...updateData } = data;
    return client.transfer.update({
      data: {
        ...updateData,
        ...(status === undefined
          ? {}
          : { status: this.typeValidator.cast(status) }),
      },
      where,
      select: {
        id: true,
        status: true,
        destinationId: true,
        finalizedAt: true,
      },
    });
  };
}

export { TransferModel };
