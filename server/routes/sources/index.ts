import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../../lib/db.js";
import { pendingTransferTypes } from "../../../lib/transfer.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { default as validator } from "validator";
import { LogModel } from "../../../lib/models/log.js";
import { useConnection } from "../../../lib/connections.js";
const sourceRouter = Router();

type SourceResponse = Prisma.SourceGetPayload<{
  select: {
    id: true;
    nickname: true;
    status: true;
    sourceType: true;
    schema: true;
    database: true;
  };
}>;

// List sources
sourceRouter.get("/", async (_req, res: ListApiResponse<SourceResponse>) => {
  const sources = await db.source.findMany({
    select: {
      id: true,
      nickname: true,
      status: true,
      sourceType: true,
      schema: true,
      database: true,
    },
  });

  return res.status(HttpStatusCode.OK).json({ content: sources });
});

// Create source
sourceRouter.post("/", async (req, res: ApiResponse<SourceResponse>) => {
  const body = z
    .object({
      nickname: z.string(), // TODO(timothygoltser): This should be optional
      sourceType: z.enum([
        "MYSQL",
        "POSTGRES",
        "SNOWFLAKE",
        "REDSHIFT",
        "BIGQUERY",
      ]),
      host: z.string(),
      port: z.number().int().nonnegative(),
      schema: z.string(),
      database: z.string(),
      username: z.string(),
      password: z.string(), // TODO(timothygoltser): This should be optional
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      validationIssues: body.error.issues,
    });
  }

  const {
    nickname,
    sourceType,
    host,
    port,
    schema,
    database,
    username,
    password,
  } = body.data;

  const connection = await useConnection({
    dbType: sourceType,
    host,
    port,
    username,
    password,
    database,
  });

  if (connection.error) {
    return res
      .status(HttpStatusCode.SERVICE_UNAVAILABLE)
      .json({ code: "source_db_unreachable" });
  }

  const source = await db.source.create({
    data: {
      nickname,
      sourceType,
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
      status: true,
      sourceType: true,
      schema: true,
      database: true,
    },
  });

  return res.status(HttpStatusCode.CREATED).json(source);
});

// Get source
sourceRouter.get(
  "/:sourceId",
  async (req, res: ApiResponse<SourceResponse>) => {
    const params = z
      .object({
        sourceId: z
          .string()
          .min(1)
          .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
            message: "The sourceId query param must be an integer.",
          })
          .transform((s) => parseInt(s)),
      })
      .safeParse(req.params);

    if (!params.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "params_validation_error",
        validationIssues: params.error.issues,
      });
    }

    const source = await db.source.findUnique({
      where: { id: params.data.sourceId },
      select: {
        id: true,
        nickname: true,
        status: true,
        sourceType: true,
        schema: true,
        database: true,
      },
    });

    if (!source) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        code: "source_id_not_found",
        message: `Could not locate source with ID of "${params.data.sourceId}"`,
      });
    }

    return res.status(HttpStatusCode.OK).json(source);
  },
);

// Delete source
sourceRouter.delete("/:sourceId", async (req, res: ApiResponse<null>) => {
  const params = z
    .object({
      sourceId: z
        .string()
        .min(1)
        .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
          message: "The sourceId query param must be an integer.",
        })
        .transform((s) => parseInt(s)),
    })
    .safeParse(req.params);

  if (!params.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "params_validation_error",
      validationIssues: params.error.issues,
    });
  }
  const source = await db.source.findUnique({
    where: { id: params.data.sourceId },
    select: {
      id: true,
      nickname: true,
      status: true,
      sourceType: true,
    },
  });
  if (!source) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      code: "source_id_not_found",
      message: `Could not locate source with ID of "${params.data.sourceId}"`,
    });
  }

  const results = await db.$transaction(async (prisma) => {
    const sourceWithNoPendingTransfers = await prisma.source.findFirst({
      where: {
        id: params.data.sourceId,
        views: {
          every: {
            configurations: {
              every: {
                destinations: {
                  every: {
                    transfers: {
                      every: {
                        status: {
                          notIn: pendingTransferTypes.slice(),
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!sourceWithNoPendingTransfers) {
      await LogModel.create(
        {
          action: "DELETE",
          domainId: params.data.sourceId,
          domain: "SOURCE",
          meta: {
            message: `Attempted to delete source ${params.data.sourceId} but failed to do so because there is a pending transfer.`,
          },
        },
        prisma,
      );
      return "PENDING_TRANSFERS";
    }
    await LogModel.create(
      {
        action: "DELETE",
        domain: "SOURCE",
        domainId: params.data.sourceId,
        meta: {
          message: `Successfully deleted source=${params.data.sourceId}`,
        },
      },
      prisma,
    );
    const deletedSource = await prisma.source.delete({
      where: { id: params.data.sourceId },
    });
    return deletedSource;
  });
  if (results === "PENDING_TRANSFERS") {
    return res.status(HttpStatusCode.PRECONDITION_FAILED).json({
      code: "transfer_in_progress",
      message:
        "You must first cancel all transfers associated with this source before deleting this source.",
    });
  }

  return res.status(HttpStatusCode.NO_CONTENT).end();
});
export { sourceRouter };
