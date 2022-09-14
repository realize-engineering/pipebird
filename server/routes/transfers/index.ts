import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../../lib/db.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { default as validator } from "validator";
import { LogModel } from "../../../lib/models/log.js";
import { cursorPaginationValidator } from "../../../lib/pagination.js";
import { startTransfer } from "../../../lib/temporal/client.js";

const transferRouter = Router();

type TransferResponse = Prisma.TransferGetPayload<{
  select: {
    id: true;
    status: true;
    configurationId: true;
    result: {
      select: {
        finalizedAt: true;
        objectUrl: true;
      };
    };
  };
}>;

// List transfers
transferRouter.get("/", async (req, res: ListApiResponse<TransferResponse>) => {
  const queryParams = z
    .object({
      status: z
        .preprocess(
          (val) => String(val).toUpperCase(),
          z.enum(["STARTED", "PENDING", "COMPLETE", "FAILED", "CANCELLED"]),
        )
        .nullish(),
    })
    .merge(cursorPaginationValidator)
    .safeParse(req.query);

  if (!queryParams.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "query_validation_error",
      validationIssues: queryParams.error.issues,
    });
  }
  const { cursor, take, status } = queryParams.data;

  const transfers = await db.transfer.findMany({
    ...(status && { where: { status } }),
    select: {
      id: true,
      status: true,
      configurationId: true,
      result: {
        select: {
          finalizedAt: true,
          objectUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    take,
  });
  return res.status(HttpStatusCode.OK).json({ content: transfers });
});

// Create transfer
transferRouter.post(
  "/",
  async (req, res: ListApiResponse<TransferResponse>) => {
    const bodyParams = z
      .object({
        configurationIds: z.number().nonnegative().array().optional(),
      })
      .safeParse(req.body);

    if (!bodyParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "body_validation_error",
        validationIssues: bodyParams.error.issues,
      });
    }

    const relevantConfigs = await db.configuration.findMany({
      ...(bodyParams.data.configurationIds && {
        where: {
          id: { in: bodyParams.data.configurationIds },
        },
      }),
    });

    if (!relevantConfigs) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "share_id_not_found" });
    }

    const transfers = await db.$transaction(
      relevantConfigs.map((config) => {
        return db.transfer.create({
          data: {
            status: "STARTED",
            configurationId: config.id,
          },
          select: {
            id: true,
            status: true,
            configurationId: true,
            result: {
              select: {
                finalizedAt: true,
                objectUrl: true,
              },
            },
          },
        });
      }),
    );

    transfers.map(async (t) => await startTransfer({ id: t.id }));

    return res.status(HttpStatusCode.CREATED).json({ content: transfers });
  },
);

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
            message: "The transferId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.params);

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
      select: {
        id: true,
        status: true,
        configurationId: true,
        result: {
          select: {
            finalizedAt: true,
            objectUrl: true,
          },
        },
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
  async (req, res: ApiResponse<TransferResponse>) => {
    const queryParams = z
      .object({
        transferId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The transferId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.params);

    if (!queryParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "query_validation_error",
        validationIssues: queryParams.error.issues,
      });
    }

    const results = await db.$transaction(async (prisma) => {
      const transfer = await prisma.transfer.findUnique({
        where: {
          id: queryParams.data.transferId,
        },
      });

      if (!transfer) {
        return "NOT_FOUND";
      }

      switch (transfer.status) {
        case "PENDING":
        case "STARTED": {
          const newTransfer = await prisma.transfer.update({
            where: {
              id: transfer.id,
            },
            data: {
              status: "CANCELLED",
            },
            select: {
              id: true,
              status: true,
              configurationId: true,
              result: {
                select: {
                  finalizedAt: true,
                  objectUrl: true,
                },
              },
            },
          });
          await LogModel.create(
            {
              domain: "TRANSFER",
              action: "DELETE",
              domainId: newTransfer.id,
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
              domain: "TRANSFER",
              action: "DELETE",
              domainId: transfer.id,
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
              domain: "TRANSFER",
              action: "DELETE",
              domainId: transfer.id,
              meta: {
                message: `Failed to cancel transfer on id=${transfer.id} with existing raw transfer status=${transfer.status} and parsed status=${transfer.status}`,
              },
            },
            prisma,
          );
          return {
            transfer,
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

    return res.status(HttpStatusCode.ACCEPTED).json(results.transfer);
  },
);

export { transferRouter };
