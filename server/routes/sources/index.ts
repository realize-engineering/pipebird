import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../../lib/db.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { getConnection } from "../../../lib/connections.js";

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
        sourceId: z.string().transform(Number),
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

export { sourceRouter };
