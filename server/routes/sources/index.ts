import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../../lib/db.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";

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

  const source = await db.source.create({
    data: {
      name: body.data.name,
      sourceType: body.data.sourceType,
      host: body.data.host,
      port: body.data.port,
      username: body.data.username,
      password: body.data.password,
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
