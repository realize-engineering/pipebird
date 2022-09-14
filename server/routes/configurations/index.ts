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
import { initiateNewShare } from "../../../lib/share/index.js";

const configurationRouter = Router();

type ConfigurationResponse = Prisma.ConfigurationGetPayload<{
  select: {
    id: true;
    nickname: true;
    tenantId: true;
    warehouseId: true;
    viewId: true;
    destinationId: true;
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
        id: true,
        nickname: true,
        tenantId: true,
        warehouseId: true,
        viewId: true,
        destinationId: true,
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
        nickname: z.string().optional(),
        tenantId: z.string().min(1),
        destinationId: z.number().nonnegative(),
        viewId: z.number().nonnegative(),
        warehouseId: z
          .string()
          .min(1)
          .refine((val) => validator.isAlphanumeric(val), {
            message: "The warehouseId param must be alphanumeric.",
          })
          .optional(),
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
    const { nickname, tenantId, destinationId, viewId, warehouseId, columns } =
      body.data;
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

    const destination = await db.destination.findUnique({
      where: { id: destinationId },
    });

    if (!destination) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        code: "destination_id_not_found",
      });
    }

    try {
      const result = await db.$transaction(async (prisma) => {
        const config = await db.configuration.create({
          data: {
            nickname,
            tenantId,
            warehouseId,
            destinationId,
            viewId,
          },
          select: {
            id: true,
            nickname: true,
            tenantId: true,
            warehouseId: true,
            viewId: true,
            destinationId: true,
          },
        });

        // todo: ensure that primary key is included in config for upserts

        const mappedCols = columns.map((col) => {
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

        const configColumns = await Promise.all(
          mappedCols.map(async (column) => {
            return prisma.columnTransformation.create({
              data: {
                configurationId: config.id,
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

        if (warehouseId) {
          await initiateNewShare({ shareId: config.id, prisma });
        }

        return { config, configColumns };
      });

      return res
        .status(HttpStatusCode.CREATED)
        .json({ ...result.config, columns: result.configColumns });
    } catch (e) {
      logger.error(e);
      const message =
        e instanceof Error
          ? e.message
          : "The configuration could not be created as specified";
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "body_validation_error",
        message,
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
        nickname: true,
        tenantId: true,
        warehouseId: true,
        viewId: true,
        destinationId: true,
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
      const hasPendingTransfer = await prisma.transfer.findFirst({
        where: {
          configurationId: queryParams.data.configurationId,
          status: {
            in: pendingTransferTypes.slice(),
          },
        },
      });

      if (hasPendingTransfer) {
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
          transfers: {
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
            message: `Deleted configuration attached to transfer ids: ${JSON.stringify(
              configuration.transfers,
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
