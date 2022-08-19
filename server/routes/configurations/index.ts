import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../../lib/db.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { default as validator } from "validator";
import { cursorPaginationValidator } from "../../../lib/pagination.js";
import { TransferModel } from "../../../lib/models/transfer.js";
import { LogModel } from "../../../lib/models/log.js";
import { logger } from "../../../lib/logger.js";

const configurationRouter = Router();

type ConfigurationResponse = Prisma.ConfigurationGetPayload<{
  select: {
    id: true;
    viewId: true;
    columns: {
      select: {
        nameInSource: true;
        nameInDestination: true;
        destinationFormatString: true;
        transformer: true;
        isPrimaryKey: true;
        isLastModified: true;
      };
    };
  };
}>;

// List configurations
configurationRouter.get(
  "/",
  async (req, res: ListApiResponse<ConfigurationResponse>) => {
    const queryParams = cursorPaginationValidator.safeParse(req.query);

    if (!queryParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "query_validation_error",
        validationIssues: queryParams.error.issues,
      });
    }

    const { take, cursor } = queryParams.data;

    const configurations = await db.configuration.findMany({
      select: {
        viewId: true,
        id: true,
        columns: {
          select: {
            nameInSource: true,
            nameInDestination: true,
            destinationFormatString: true,
            transformer: true,
            isPrimaryKey: true,
            isLastModified: true,
          },
        },
      },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take,
    });
    return res.status(HttpStatusCode.OK).json({ content: configurations });
  },
);

// Create configuration
configurationRouter.post(
  "/",
  async (req, res: ApiResponse<ConfigurationResponse>) => {
    const body = z
      .object({
        viewId: z.number().nonnegative(),
        columns: z
          .object({
            nameInSource: z.string().min(1),
            nameInDestination: z.string().min(1),
            destinationFormatString: z.string().min(1),
            transformer: z.string().min(1),
            isPrimaryKey: z.boolean().default(false),
            isLastModified: z.boolean().default(false),
          })
          .array(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "body_validation_error",
        validationIssues: body.error.issues,
      });
    }
    try {
      const configuration = await db.configuration.create({
        data: {
          viewId: body.data.viewId,
        },
        select: {
          id: true,
          viewId: true,
        },
      });
      const columns = await db.$transaction(
        body.data.columns.map((column) =>
          db.columnTransformation.create({
            data: {
              configurationId: configuration.id,
              destinationFormatString: column.destinationFormatString,
              isLastModified: column.isLastModified,
              isPrimaryKey: column.isPrimaryKey,
              nameInDestination: column.nameInDestination,
              nameInSource: column.nameInSource,
              transformer: column.transformer,
            },
            select: {
              nameInSource: true,
              nameInDestination: true,
              destinationFormatString: true,
              transformer: true,
              isPrimaryKey: true,
              isLastModified: true,
            },
          }),
        ),
      );

      return res
        .status(HttpStatusCode.CREATED)
        .json({ ...configuration, columns });
    } catch (e) {
      logger.error(e);
      return res.status(HttpStatusCode.NOT_FOUND).json({
        code: "view_id_not_found",
        message: `Failed to create configuration. Verify view id=${body.data.viewId} exists.`,
      });
    }
  },
);

// Get configuration
configurationRouter.get(
  "/:configurationId",
  async (req, res: ApiResponse<ConfigurationResponse>) => {
    const queryParams = z
      .object({
        configurationId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The configurationId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.params);
    if (!queryParams.success) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        code: "query_validation_error",
        message: "Invalid or missing configuration_id in path.",
        validationIssues: queryParams.error.issues,
      });
    }
    const configuration = await db.configuration.findUnique({
      where: {
        id: queryParams.data.configurationId,
      },
      select: {
        id: true,
        viewId: true,
        columns: {
          select: {
            nameInSource: true,
            nameInDestination: true,
            destinationFormatString: true,
            transformer: true,
            isPrimaryKey: true,
            isLastModified: true,
          },
        },
      },
    });
    if (!configuration) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "configuration_id_not_found" });
    }
    return res.status(HttpStatusCode.OK).json(configuration);
  },
);

// Delete configuration
configurationRouter.delete(
  "/:configurationId",
  async (req, res: ApiResponse<null>) => {
    const queryParams = z
      .object({
        configurationId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The configurationId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.params);

    if (!queryParams.success) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        code: "query_validation_error",
        message: "Invalid or missing configuration_id in path.",
        validationIssues: queryParams.error.issues,
      });
    }
    const configurationExists = await db.configuration.findUnique({
      where: {
        id: queryParams.data.configurationId,
      },
    });
    if (!configurationExists) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ code: "configuration_id_not_found" });
    }

    const results = await db.$transaction(async (prisma) => {
      const configurationNoWithPendingTransfers =
        await prisma.configuration.findFirst({
          where: {
            id: queryParams.data.configurationId,
            destinations: {
              every: {
                transfers: {
                  every: {
                    status: { notIn: TransferModel.pendingTypes.slice() },
                  },
                },
              },
            },
          },
        });

      if (!configurationNoWithPendingTransfers) {
        // TODO(cumason) make log + log create atomic functions
        logger.warn({
          error: `Attempted to delete configuration ${queryParams.data.configurationId} where transfer is pending.`,
        });
        await LogModel.create(
          {
            source: "CONFIGURATION",
            action: "DELETE",
            eventId: queryParams.data.configurationId,
            meta: {
              message: `Attempted to delete configuration ${queryParams.data.configurationId} where transfer is pending.`,
            },
          },
          prisma,
        );
        return null; // don't delete if pending transfers
      }

      const configuration = await prisma.configuration.delete({
        where: {
          id: queryParams.data.configurationId,
        },
        select: {
          id: true,
          destinations: {
            select: {
              id: true,
            },
          },
        },
      });

      await LogModel.create(
        {
          source: "CONFIGURATION",
          action: "DELETE",
          eventId: queryParams.data.configurationId,
          meta: {
            message: `Deleted configuration attached to destination ids: ${JSON.stringify(
              configuration.destinations,
            )}`,
          },
        },
        prisma,
      );

      return configuration;
    });

    if (results === null) {
      return res.status(HttpStatusCode.PRECONDITION_FAILED).json({
        code: "transfer_in_progress",
        message:
          "You cannot delete configurations of ongoing transfers. You must explicitly cancel all transfers associated with this configuration first.",
      });
    }
    return res.status(HttpStatusCode.NO_CONTENT).json(null);
  },
);

export { configurationRouter };
