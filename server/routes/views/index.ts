import { Router } from "express";
import { Prisma } from "@prisma/client";
import { default as validator } from "validator";
import { z } from "zod";

import { HttpStatusCode } from "../../../utils/http.js";
import { testQuery } from "../../../lib/connections.js";
import { db } from "../../../lib/db.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { cursorPaginationValidator } from "../../../lib/pagination.js";

type ViewResponse = Prisma.ViewGetPayload<{
  select: {
    id: true;
    sourceId: true;
    tenantColumn: true;
    tableExpression: true;
  };
}>;

const viewRouter = Router();

// List views
viewRouter.get("/", async (req, res: ListApiResponse<ViewResponse>) => {
  const queryParams = cursorPaginationValidator.safeParse(req.query);

  if (!queryParams.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "query_validation_error",
      validationIssues: queryParams.error.issues,
    });
  }

  const { take, cursor } = queryParams.data;

  const views = await db.view.findMany({
    select: {
      id: true,
      sourceId: true,
      tenantColumn: true,
      tableExpression: true,
    },
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    take,
  });
  return res.status(HttpStatusCode.OK).json({ content: views });
});

// Create view
viewRouter.post("/", async (req, res: ApiResponse<ViewResponse>) => {
  const body = z
    .object({
      tableExpression: z.string(),
      tenantColumn: z.string(),
      sourceId: z.number(),
    })
    .safeParse(req.body);
  if (!body.success) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      validationIssues: body.error.issues,
    });
  }

  const { tableExpression, tenantColumn, sourceId } = body.data;

  const source = await db.source.findUnique({
    where: {
      id: sourceId,
    },
    select: {
      sourceType: true,
      connectionString: true,
    },
  });

  if (!source) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      code: "source_id_not_found",
    });
  }

  const { sourceType, connectionString } = source;

  const test = await testQuery({
    dbType: sourceType,
    connectionString: connectionString,
    query: tableExpression,
  });

  if (test.error) {
    if (test.status === "UNREACHABLE") {
      await db.source.update({
        where: {
          id: sourceId,
        },
        data: {
          status: test.status,
        },
      });

      return res.status(HttpStatusCode.SERVICE_UNAVAILABLE).json({
        code: "source_db_unreachable",
      });
    }

    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "invalid_table_expression",
      message:
        test.message ||
        "Table expression is not valid for the provided source.",
    });
  }

  if (!test.columns || !test.columns.includes(tenantColumn)) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      message: "Table expression and tenant column mismatch.",
    });
  }

  const view = await db.view.create({
    data: {
      sourceId,
      tenantColumn,
      tableExpression,
    },
    select: {
      id: true,
      sourceId: true,
      tenantColumn: true,
      tableExpression: true,
    },
  });

  return res.status(HttpStatusCode.CREATED).json({ ...view });
});

// Get view
viewRouter.get("/:viewId", async (req, res: ApiResponse<ViewResponse>) => {
  const queryParams = z
    .object({
      viewId: z
        .string()
        .min(1)
        .refine((val) => validator.isNumeric(val, { no_symbols: true }), {
          message: "The viewId query param must be an integer.",
        })
        .transform((s) => parseInt(s)),
    })
    .safeParse(req.query);
  if (!queryParams.success) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      code: "query_validation_error",
      message: "Invalid or missing viewId in path.",
      validationIssues: queryParams.error.issues,
    });
  }

  const view = await db.view.findUnique({
    where: {
      id: queryParams.data.viewId,
    },
    select: {
      id: true,
      sourceId: true,
      tenantColumn: true,
      tableExpression: true,
    },
  });

  if (!view) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ code: "view_id_not_found" });
  }
  return res.status(HttpStatusCode.OK).json(view);
});

export { viewRouter };
