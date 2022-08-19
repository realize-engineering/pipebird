import { Prisma } from "@prisma/client";
import { Response, Router } from "express";
import { db } from "../../../lib/db.js";
import {
  ApiResponse,
  ErrorApiSchema,
  ListApiResponse,
} from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { default as validator } from "validator";
import { TransferModel } from "../../../lib/models/transfer.js";
import { LogModel } from "../../../lib/models/log.js";
const transferRouter = Router();

type TransferResponse = Prisma.TransferGetPayload<{
  select: {
    status: true;
    id: true;
  };
}>;

// List transfers
transferRouter.get(
  "/",
  async (_req, res: ListApiResponse<TransferResponse>) => {
    const transfers = await db.transfer.findMany({
      select: {
        status: true,
        id: true,
      },
    });
    return res.status(HttpStatusCode.OK).json({ content: transfers });
  },
);

// Create transfer
transferRouter.post("/", async (req, res: ApiResponse<TransferResponse>) => {
  const bodyParams = z
    .object({
      destinationId: z
        .string()
        .min(1)
        .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
          message: "The configurationId query param must be an integer.",
        })
        .transform((s) => parseInt(s)),
    })
    .safeParse(req.body);
  if (!bodyParams.success) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ code: "body_validation_error" });
  }

  const destination = await db.destination.findUnique({
    where: {
      id: bodyParams.data.destinationId,
    },
  });
  if (!destination) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ code: "destination_id_not_found" });
  }
  const transfer = await TransferModel.create(
    {
      destination: {
        connect: {
          id: bodyParams.data.destinationId,
        },
      },
      status: "STARTED",
    },
    db,
  );

  return res.status(HttpStatusCode.CREATED).json(transfer);
});

// Get transfer
transferRouter.get(
  "/:transferId",
  async (req, res: ApiResponse<TransferResponse>) => {
    const queryParams = z
      .object({
        transferId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The configurationId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.query);

    if (!queryParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "query_validation_error",
        validationIssues: queryParams.error.issues,
      });
    }

    const transfer = await db.transfer.findUnique({
      where: {
        id: queryParams.data.transferId,
      },
    });
    if (!transfer) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "transfer_id_not_found" });
    }
    return res.status(HttpStatusCode.OK).json(transfer);
  },
);

// Delete transfer
transferRouter.delete(
  "/:transferId",
  async (req, res: Response<ErrorApiSchema>) => {
    const queryParams = z
      .object({
        transferId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The configurationId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.query);

    if (!queryParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "query_validation_error",
        validationIssues: queryParams.error.issues,
      });
    }

    const results = await db.$transaction(async (prisma) => {
      const rawTransfer = await prisma.transfer.findUnique({
        where: {
          id: queryParams.data.transferId,
        },
        select: {
          status: true,
          id: true,
        },
      });
      if (!rawTransfer) {
        return "NOT_FOUND";
      }
      const transfer = TransferModel.parse(rawTransfer);
      switch (transfer.status) {
        case "PENDING":
        case "STARTED": {
          const newTransfer = await TransferModel.update({
            where: {
              id: transfer.id,
            },
            client: prisma,
            data: {
              status: "CANCELLED",
            },
          });
          await LogModel.create(
            {
              source: "TRANSFER",
              action: "DELETE",
              eventId: newTransfer.id,
              meta: { message: `Cancelled transfer ${newTransfer.id}` },
            },
            prisma,
          );
          return { transfer: newTransfer, updateStatus: "SUCCESS" as const };
        }
        case "CANCELLED":
        case "COMPLETE":
        case "FAILED": {
          await LogModel.create(
            {
              source: "TRANSFER",
              action: "DELETE",
              eventId: rawTransfer.id,
              meta: {
                message: `Failed to cancel transfer on id=${transfer.id} and status=${transfer.status}`,
              },
            },
            prisma,
          );

          return { transfer, updateStatus: "PRECONDITION_FAILED" as const };
        }
        default:
          await LogModel.create(
            {
              source: "TRANSFER",
              action: "DELETE",
              eventId: rawTransfer.id,
              meta: {
                message: `Failed to cancel transfer on id=${transfer.id} with existing raw transfer status=${rawTransfer.status} and parsed status=${transfer.status}`,
              },
            },
            prisma,
          );
          return {
            transfer: rawTransfer,
            updateStatus: "UNKNOWN_STATE" as const,
          };
      }
    });
    if (results === "NOT_FOUND") {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "transfer_id_not_found" });
    }
    if (results.updateStatus === "PRECONDITION_FAILED") {
      return res.status(HttpStatusCode.PRECONDITION_FAILED).json({
        code: "transfer_not_in_progress",
        message: `Failed to cancel already terminated transfer with current status=${results.transfer.status}`,
      });
    } else if (results.updateStatus === "UNKNOWN_STATE") {
      return res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
        code: "internal_server_error",
        message: `Failed to terminate transfer with state=${results.transfer.status}`,
      });
    }

    return res.status(HttpStatusCode.ACCEPTED);
  },
);

export { transferRouter };
