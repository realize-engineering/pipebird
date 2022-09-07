import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { default as validator } from "validator";

import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { LogModel } from "../../../lib/models/log.js";
import { pendingTransferTypes } from "../../../lib/transfer.js";
import { initiateNewShare } from "../../../lib/share/index.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { cursorPaginationValidator } from "../../../lib/pagination.js";
import { HttpStatusCode } from "../../../utils/http.js";

const shareRouter = Router();

type ShareResponse = Prisma.ShareGetPayload<{
  select: {
    id: true;
    tenantId: true;
    warehouseId: true;
    nickname: true;
    configuration: {
      select: {
        view: {
          select: {
            id: true;
            tableName: true;
          };
        };
      };
    };
    destination: {
      select: {
        id: true;
        destinationType: true;
      };
    };
  };
}>;

// List destinations
shareRouter.get("/", async (req, res: ListApiResponse<ShareResponse>) => {
  const queryParams = cursorPaginationValidator.safeParse(req.query);
  if (!queryParams.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "query_validation_error",
      validationIssues: queryParams.error.issues,
    });
  }
  const { cursor, take } = queryParams.data;
  const shares = await db.share.findMany({
    select: {
      id: true,
      tenantId: true,
      warehouseId: true,
      nickname: true,
      configuration: {
        select: {
          view: {
            select: {
              id: true,
              tableName: true,
            },
          },
        },
      },
      destination: {
        select: {
          id: true,
          destinationType: true,
        },
      },
    },
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    take,
  });
  return res.status(HttpStatusCode.OK).json({ content: shares });
});

// Create Share
shareRouter.post("/", async (req, res: ApiResponse<ShareResponse>) => {
  const body = z
    .object({
      nickname: z.string().optional(),
      tenantId: z.string().min(1),
      destinationId: z.number().nonnegative(),
      configurationId: z.number().nonnegative(),
      warehouseId: z.string().min(1),
    })
    .safeParse(req.body);
  if (!body.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      validationIssues: body.error.issues,
    });
  }

  const { nickname, tenantId, destinationId, configurationId, warehouseId } =
    body.data;

  const configuration = await db.configuration.findUnique({
    where: { id: configurationId },
  });

  if (!configuration) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      code: "configuration_id_not_found",
    });
  }

  const destination = await db.destination.findUnique({
    where: { id: destinationId },
  });

  if (!destination) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      code: "destination_id_not_found",
    });
  }

  const share = await db.share.create({
    data: {
      nickname,
      tenantId,
      destinationId,
      configurationId,
      warehouseId,
    },
    select: {
      id: true,
      tenantId: true,
      warehouseId: true,
      nickname: true,
      configuration: {
        select: {
          view: {
            select: {
              id: true,
              tableName: true,
            },
          },
        },
      },
      destination: {
        select: {
          id: true,
          destinationType: true,
        },
      },
    },
  });

  // todo(ianedwards): look into wrapping this in a transaction with above
  // reading the uncommitted share would require separate selects as the share return type does
  // not specify all the fields needed to initiate the share in the WH
  await initiateNewShare({ shareId: share.id });

  return res.status(HttpStatusCode.CREATED).json(share);
});

// Update destination
shareRouter.patch("/:shareId", async (req, res: ApiResponse<null>) => {
  const queryParams = z
    .object({
      shareId: z
        .string()
        .min(1)
        .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
          message: "The shareId query param must be an integer.",
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
  const bodyParams = z
    .object({
      nickname: z.string().optional(),
      tenantId: z.string().min(1).optional(),
      destinationId: z.number().nonnegative().optional(),
      configurationId: z.number().nonnegative().optional(),
      warehouseId: z.string().min(1).optional(),
    })
    .safeParse(req.body);

  if (!bodyParams.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      validationIssues: bodyParams.error.issues,
    });
  }
  try {
    const { destinationId, configurationId } = bodyParams.data;

    const configuration = await db.configuration.findUnique({
      where: { id: configurationId },
    });

    if (configurationId && !configuration) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        code: "configuration_id_not_found",
      });
    }

    const destination = await db.destination.findUnique({
      where: { id: destinationId },
    });
    if (destinationId && !destination) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "destination_id_not_found" });
    }

    await db.share.update({
      where: {
        id: queryParams.data.shareId,
      },
      data: {
        ...bodyParams.data,
      },
    });
  } catch (e) {
    logger.warn(e);
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      message:
        "Failed to update destination. Ensure that configuration id exists.",
    });
  }

  return res.status(HttpStatusCode.NO_CONTENT).end();
});

// Get destination
shareRouter.get("/:shareId", async (req, res: ApiResponse<ShareResponse>) => {
  const queryParams = z
    .object({
      shareId: z
        .string()
        .min(1)
        .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
          message: "The shareId query param must be an integer.",
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
  const share = await db.share.findUnique({
    where: {
      id: queryParams.data.shareId,
    },
    select: {
      id: true,
      tenantId: true,
      warehouseId: true,
      nickname: true,
      configuration: {
        select: {
          view: {
            select: {
              id: true,
              tableName: true,
            },
          },
        },
      },
      destination: {
        select: {
          id: true,
          destinationType: true,
        },
      },
    },
  });
  if (!share) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ code: "destination_id_not_found" });
  }
  return res.status(HttpStatusCode.OK).json(share);
});

// Delete destination
shareRouter.delete("/:shareId", async (req, res: ApiResponse<null>) => {
  const queryParams = z
    .object({
      shareId: z
        .string()
        .min(1)
        .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
          message: "The share query param must be an integer.",
        })
        .transform((s) => parseInt(s)),
    })
    .safeParse(req.params);
  if (!queryParams.success) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ code: "query_validation_error" });
  }
  const shareExists = await db.share.findUnique({
    where: { id: queryParams.data.shareId },
  });
  if (!shareExists) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ code: "share_id_not_found" });
  }

  const results = await db.$transaction(async (prisma) => {
    const hasPendingTransfer = await prisma.transfer.findFirst({
      where: {
        shareId: queryParams.data.shareId,
        status: {
          in: pendingTransferTypes.slice(),
        },
      },
    });
    if (hasPendingTransfer) {
      logger.warn({
        error: `Attempted to delete share ${queryParams.data.shareId} where transfer is pending.`,
      });
      await LogModel.create(
        {
          domain: "CONFIGURATION",
          action: "DELETE",
          domainId: queryParams.data.shareId,
          meta: {
            message: `Attempted to delete destination ${queryParams.data.shareId} where transfer is pending.`,
          },
        },
        prisma,
      );
      return null;
    }
    const share = await prisma.share.delete({
      where: {
        id: queryParams.data.shareId,
      },
      select: {
        id: true,
      },
    });

    await LogModel.create(
      {
        domain: "DESTINATION",
        action: "DELETE",
        domainId: share.id,
        meta: {
          message: `Deleted destination ${share.id} because it had no pending transfers.`,
        },
      },
      prisma,
    );
    return share;
  });

  if (results === null) {
    return res.status(HttpStatusCode.PRECONDITION_FAILED).json({
      code: "transfer_in_progress",
      message:
        "You cannot delete shares of ongoing transfers. You must explicitly cancel all transfers associated with this share first.",
    });
  }
  return res.status(HttpStatusCode.NO_CONTENT).end();
});

export { shareRouter };
