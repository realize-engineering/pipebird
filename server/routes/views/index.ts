import { Router } from "express";
import { Prisma } from "@prisma/client";
import { default as validator } from "validator";
import { z } from "zod";

import { HttpStatusCode } from "../../../utils/http.js";
import { useConnection } from "../../../lib/connections/index.js";
import { db } from "../../../lib/db.js";
import { pendingTransferTypes } from "../../../lib/transfer.js";
import { ApiResponse, ListApiResponse } from "../../../lib/handlers.js";
import { cursorPaginationValidator } from "../../../lib/pagination.js";
import { LogModel } from "../../../lib/models/log.js";
import { default as knex } from "knex";

type ViewResponse = Prisma.ViewGetPayload<{
  select: {
    id: true;
    sourceId: true;
    tableName: true;
    columns: {
      select: {
        id: true;
        name: true;
        dataType: true;
      };
    };
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
      tableName: true,
      columns: {
        select: {
          id: true,
          name: true,
          dataType: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
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
      sourceId: z.number(),
      tableName: z.string(),
      columns: z
        .object({
          name: z.string(),
          isPrimaryKey: z.boolean().default(false),
          isLastModified: z.boolean().default(false),
          isTenantColumn: z.boolean().default(false),
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

  const { tableName, columns, sourceId } = body.data;
  const source = await db.source.findUnique({
    where: {
      id: sourceId,
    },
    select: {
      sourceType: true,
      host: true,
      port: true,
      schema: true,
      database: true,
      username: true,
      password: true,
    },
  });

  if (!source) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      code: "source_id_not_found",
    });
  }

  if (
    columns.filter((col) => col.isLastModified).length !== 1 ||
    columns.filter((col) => col.isPrimaryKey).length !== 1 ||
    columns.filter((col) => col.isTenantColumn).length !== 1
  ) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      code: "body_validation_error",
      message:
        "Exactly one last modified column, one primary key column, and one tenant column must be used.",
    });
  }

  const { sourceType, host, port, schema, database, username, password } =
    source;

  const conn = await useConnection({
    dbType: sourceType,
    host,
    port,
    username,
    password: password || undefined,
    database,
  });

  if (conn.error) {
    await db.source.update({
      where: {
        id: sourceId,
      },
      data: {
        status: "UNREACHABLE",
      },
    });

    return res.status(HttpStatusCode.SERVICE_UNAVAILABLE).json({
      code: "source_db_unreachable",
    });
  }

  const qb = knex({ client: sourceType.toLowerCase() });

  // ping DB to ensure valid column names for given schema + table
  await conn.query(
    qb
      .select(columns.map((column) => column.name))
      .from(schema ? `${schema}.${tableName}` : `${tableName}`)
      .limit(1)
      .toSQL()
      .toNative(),
  );
  const infoResult = await conn.query(
    qb
      .select("column_name", "data_type")
      .from("information_schema.columns")
      .where("table_name", "=", tableName)
      .toSQL()
      .toNative(),
  );

  const viewColumnCreateData = columns.map((col) => {
    const columnInfo = infoResult.rows.find(
      (row) => row.column_name === col.name,
    );

    return {
      ...col,
      dataType: columnInfo?.data_type
        ? (columnInfo.data_type as string)
        : "varchar",
    };
  });

  const view = await db.view.create({
    data: {
      sourceId,
      tableName,
      columns: {
        createMany: {
          data: viewColumnCreateData,
        },
      },
    },
    select: {
      id: true,
      sourceId: true,
      tableName: true,
      columns: {
        select: {
          id: true,
          name: true,
          dataType: true,
        },
      },
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
    .safeParse(req.params);
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
      tableName: true,
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
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ code: "view_id_not_found" });
  }
  return res.status(HttpStatusCode.OK).json(view);
});

// Delete view
viewRouter.delete("/:viewId", async (req, res: ApiResponse<null>) => {
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
    .safeParse(req.params);
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
      tableName: true,
    },
  });
  if (!view) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ code: "view_id_not_found" });
  }
  const results = await db.$transaction(async (prisma) => {
    const hasPendingTransfer = await prisma.transfer.findFirst({
      where: {
        configuration: {
          viewId: queryParams.data.viewId,
        },
        status: {
          in: pendingTransferTypes.slice(),
        },
      },
    });
    if (hasPendingTransfer) {
      await LogModel.create(
        {
          action: "DELETE",
          domainId: queryParams.data.viewId,
          domain: "VIEW",
          meta: {
            message: `Attempted to delete view ${queryParams.data.viewId} but failed to do so because there is a pending transfer.`,
          },
        },
        prisma,
      );
      return "PENDING";
    }

    const deletedView = await prisma.view.delete({
      where: {
        id: view.id,
      },
    });
    await LogModel.create(
      {
        action: "DELETE",
        domainId: queryParams.data.viewId,
        domain: "VIEW",
        meta: {
          message: `Successfully deleted view ${queryParams.data.viewId}`,
        },
      },
      prisma,
    );
    return deletedView;
  });
  if (results === "PENDING") {
    return res.status(HttpStatusCode.PRECONDITION_FAILED).json({
      code: "transfer_in_progress",
      message:
        "You cannot delete views of ongoing transfers. You must explicitly cancel all transfers associated with this view first.",
    });
  }

  return res.status(HttpStatusCode.NO_CONTENT).end();
});

export { viewRouter };
