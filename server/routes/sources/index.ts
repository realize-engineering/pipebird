import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../../lib/db.js";
import { pendingTransferTypes } from "../../../lib/transfer.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { getConnection } from "../../../lib/connections.js";
import { default as validator } from "validator";
import { LogModel } from "../../../lib/models/log.js";
const sourceRouter = Router();

type SourceResponse = Prisma.SourceGetPayload<{
  select: {
    name: true;
    status: true;
    sourceType: true;
    id: true;
  };
}>;

// List sources
sourceRouter.get("/", async (_req, res: ListApiResponse<SourceResponse>) => {
  const sources = await db.source.findMany({
    select: {
      name: true,
      status: true,
      sourceType: true,
      id: true,
    },
  });

  return res.status(HttpStatusCode.OK).json({ content: sources });
});

// Create source
sourceRouter.post("/", async (req, res: ApiResponse<SourceResponse>) => {
  const body = z
    .object({
      name: z.string(),
      sourceType: z.enum([
        "MYSQL",
        "POSTGRES",
        "SNOWFLAKE",
        "REDSHIFT",
        "BIGQUERY",
      ]),
      host: z.string(),
      port: z.string().transform(Number),
      username: z.string(),
      password: z.string(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      validationIssues: body.error.issues,
    });
  }

  const { name, sourceType, host, port, username, password } = body.data;
  const { status } = await getConnection({
    dbType: sourceType,
    host,
    port,
    username,
    password,
    dbName: name,
  });

  if (status !== "REACHABLE") {
    return res.status(HttpStatusCode.SERVICE_UNAVAILABLE).json({
      code: "source_db_unreachable",
    });
  }

  const source = await db.source.create({
    data: {
      name,
      sourceType,
      host,
      port,
      username,
      password,
      status: "REACHABLE",
    },
    select: {
      id: true,
      name: true,
      status: true,
      sourceType: true,
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
        name: true,
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
      name: true,
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
          message: `Succesfully deleted source=${params.data.sourceId}`,
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
