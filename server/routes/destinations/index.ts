import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { default as validator } from "validator";

import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { LogModel } from "../../../lib/models/log.js";
import { pendingTransferTypes } from "../../../lib/transfer.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { cursorPaginationValidator } from "../../../lib/pagination.js";
import { useConnection } from "../../../lib/connections.js";
import { HttpStatusCode } from "../../../utils/http.js";

const destinationRouter = Router();

type DestinationResponse = Prisma.DestinationGetPayload<{
  select: {
    id: true;
    nickname: true;
    destinationType: true;
  };
}>;

// List destinations
destinationRouter.get(
  "/",
  async (req, res: ListApiResponse<DestinationResponse>) => {
    const queryParams = cursorPaginationValidator.safeParse(req.query);
    if (!queryParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "query_validation_error",
        validationIssues: queryParams.error.issues,
      });
    }
    const { cursor, take } = queryParams.data;
    const destinations = await db.destination.findMany({
      select: {
        id: true,
        nickname: true,
        destinationType: true,
      },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take,
    });
    return res.status(HttpStatusCode.OK).json({ content: destinations });
  },
);

// Create destination
destinationRouter.post(
  "/",
  async (req, res: ApiResponse<DestinationResponse>) => {
    const body = z
      .discriminatedUnion("destinationType", [
        z.object({
          nickname: z.string().min(1),
          destinationType: z.literal("PROVISIONED_S3"),
          tenantId: z.string().min(1),
        }),
        z.object({
          nickname: z.string().min(1),
          destinationType: z.literal("REDSHIFT"),
          tenantId: z.string().min(1),
          warehouse: z.string().optional(),
          host: z.string(),
          port: z.number().nonnegative(),
          schema: z.string(),
          database: z.string(),
          username: z.string(),
          password: z.string(),
        }),
        z.object({
          nickname: z.string().min(1),
          destinationType: z.literal("SNOWFLAKE"),
          tenantId: z.string().min(1),
          warehouse: z.string().min(1, {
            message: "A default warehouse is needed for Snowflake destinations",
          }),
          host: z.string(),
          port: z.number().nonnegative(),
          schema: z.string(),
          database: z.string(),
          username: z.string(),
          password: z.string(),
        }),
      ])
      .safeParse(req.body);

    if (!body.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "body_validation_error",
        validationIssues: body.error.issues,
      });
    }
    switch (body.data.destinationType) {
      case "PROVISIONED_S3": {
        const destination = await db.destination.create({
          data: {
            destinationType: body.data.destinationType,
            nickname: body.data.nickname,
            status: "REACHABLE",
          },
          select: {
            id: true,
            nickname: true,
            destinationType: true,
          },
        });
        return res.status(HttpStatusCode.CREATED).json(destination);
      }

      case "SNOWFLAKE":
      case "REDSHIFT": {
        const {
          nickname,
          destinationType,
          warehouse,
          host,
          port,
          schema,
          database,
          username,
          password,
        } = body.data;

        const connection = await useConnection({
          dbType: destinationType,
          warehouse,
          host,
          port,
          username,
          password,
          database,
          schema,
        });

        if (connection.error) {
          return res
            .status(HttpStatusCode.SERVICE_UNAVAILABLE)
            .json({ code: "source_db_unreachable" });
        }

        const destination = await db.destination.create({
          data: {
            destinationType,
            nickname,
            warehouse,
            host,
            port,
            schema,
            database,
            username,
            password,
            status: "REACHABLE",
          },
          select: {
            id: true,
            nickname: true,
            destinationType: true,
            warehouse: true,
          },
        });

        return res.status(HttpStatusCode.CREATED).json(destination);
      }

      default: {
        return res.status(HttpStatusCode.NOT_IMPLEMENTED).json({
          code: "destination_not_currently_supported",
          message: `The specified destination type is not currently supported`,
        });
      }
    }
  },
);

// Update destination
destinationRouter.patch(
  "/:destinationId",
  async (req, res: ApiResponse<null>) => {
    const queryParams = z
      .object({
        destinationId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The destinationId query param must be an integer.",
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
        name: z.string().min(1).optional(),
      })
      .safeParse(req.body);

    if (!bodyParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "body_validation_error",
        validationIssues: bodyParams.error.issues,
      });
    }
    const destination = await db.destination.findUnique({
      where: { id: queryParams.data.destinationId },
    });
    if (!destination) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "destination_id_not_found" });
    }
    try {
      await db.destination.update({
        where: {
          id: queryParams.data.destinationId,
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
  },
);

// Get destination
destinationRouter.get(
  "/:destinationId",
  async (req, res: ApiResponse<DestinationResponse>) => {
    const queryParams = z
      .object({
        destinationId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The configurationId query param must be an integer.",
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
    const destination = await db.destination.findUnique({
      where: {
        id: queryParams.data.destinationId,
      },
      select: {
        id: true,
        nickname: true,
        destinationType: true,
      },
    });
    if (!destination) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "destination_id_not_found" });
    }
    return res.status(HttpStatusCode.OK).json(destination);
  },
);

// Delete destination
destinationRouter.delete(
  "/:destinationId",
  async (req, res: ApiResponse<null>) => {
    const queryParams = z
      .object({
        destinationId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The destinationId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.params);
    if (!queryParams.success) {
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ code: "query_validation_error" });
    }
    const destinationExists = await db.destination.findUnique({
      where: { id: queryParams.data.destinationId },
    });
    if (!destinationExists) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "destination_id_not_found" });
    }
    const results = await db.$transaction(async (prisma) => {
      const hasPendingTransfer = await prisma.transfer.findFirst({
        where: {
          share: {
            destinationId: queryParams.data.destinationId,
          },
          status: {
            in: pendingTransferTypes.slice(),
          },
        },
      });
      if (hasPendingTransfer) {
        logger.warn({
          error: `Attempted to delete destination ${queryParams.data.destinationId} where transfer is pending.`,
        });
        await LogModel.create(
          {
            domain: "CONFIGURATION",
            action: "DELETE",
            domainId: queryParams.data.destinationId,
            meta: {
              message: `Attempted to delete destination ${queryParams.data.destinationId} where transfer is pending.`,
            },
          },
          prisma,
        );
        return null;
      }
      const destination = await prisma.destination.delete({
        where: {
          id: queryParams.data.destinationId,
        },
        select: {
          id: true,
        },
      });

      await LogModel.create(
        {
          domain: "DESTINATION",
          action: "DELETE",
          domainId: destination.id,
          meta: {
            message: `Deleted destination ${destination.id} because it had no pending transfers.`,
          },
        },
        prisma,
      );
      return destination;
    });

    if (results === null) {
      return res.status(HttpStatusCode.PRECONDITION_FAILED).json({
        code: "transfer_in_progress",
        message:
          "You cannot delete configurations of ongoing transfers. You must explicitly cancel all transfers associated with this configuration first.",
      });
    }
    return res.status(HttpStatusCode.NO_CONTENT).end();
  },
);
export { destinationRouter };
