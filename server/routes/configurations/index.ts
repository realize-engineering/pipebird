import { Prisma } from "@prisma/client";
import { Router } from "express";
import { pendingTransferTypes } from "../../../lib/transfer.js";
import { db } from "../../../lib/db.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { default as validator } from "validator";
import { cursorPaginationValidator } from "../../../lib/pagination.js";
import { LogModel } from "../../../lib/models/log.js";
import { logger } from "../../../lib/logger.js";

const configurationRouter = Router();

type ConfigurationResponse = Prisma.ConfigurationGetPayload<{
  select: {
    viewId: true;
    id: true;
    columns: {
      select: {
        nameInSource: true;
        nameInDestination: true;
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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
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
            nameInSource: z
              .string()
              .min(1)
              .regex(/^[a-zA-Z0-9_]*$/g),
            nameInDestination: z
              .string()
              .min(1)
              .regex(/^[a-zA-Z0-9_]*$/g),
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
      const { viewId, columns } = body.data;
      const view = await db.view.findUnique({
        where: { id: viewId },
        select: {
          columns: {
            select: {
              id: true,
              name: true,
              dataType: true,
            },
          },
        },
      });

      if (!view) {
        return res.status(HttpStatusCode.NOT_FOUND).json({
          code: "view_id_not_found",
        });
      }

      const configuration = await db.configuration.create({
        data: {
          viewId,
        },
        select: {
          id: true,
          viewId: true,
        },
      });

      // todo: ensure that primary key is included in config for upserts

      let mappedCols = [];
      try {
        mappedCols = columns.map((col) => {
          const sourceCol = view.columns.find(
            (viewCol) => viewCol.name === col.nameInSource,
          );
          if (!sourceCol) {
            throw new Error(
              `Column ${col.nameInSource} does not exist on the given view`,
            );
          }
          return {
            ...col,
            sourceCol,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Given columns were not valid";
        return res.status(HttpStatusCode.BAD_REQUEST).json({
          code: "body_validation_error",
          message,
        });
      }

      const configColumns = await db.$transaction(
        mappedCols.map((column) => {
          return db.columnTransformation.create({
            data: {
              configurationId: configuration.id,
              nameInSource: column.nameInSource,
              nameInDestination: column.nameInDestination,
              viewColumnId: column.sourceCol.id,
            },
            select: {
              nameInSource: true,
              nameInDestination: true,
            },
          });
        }),
      );

      return res
        .status(HttpStatusCode.CREATED)
        .json({ ...configuration, columns: configColumns });
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
        viewId: true,
        id: true,
        columns: {
          select: {
            nameInSource: true,
            nameInDestination: true,
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
                    status: { notIn: pendingTransferTypes.slice() },
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
            domain: "CONFIGURATION",
            action: "DELETE",
            domainId: queryParams.data.configurationId,
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
          domain: "CONFIGURATION",
          action: "DELETE",
          domainId: configuration.id,
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
    return res.status(HttpStatusCode.NO_CONTENT).end();
  },
);

export { configurationRouter };
