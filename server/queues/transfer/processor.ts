import { Job } from "bullmq";
import { logger } from "../../../lib/logger.js";
import { uploadObject } from "../../../lib/aws/upload.js";
import { TransferQueueJobData } from "./scheduler.js";
import { db } from "../../../lib/db.js";
import { getConnection } from "../../../lib/connections.js";
import { parse, deparse, SelectStmt } from "pgsql-parser";

const buildExtractExpression = ({
  columns,
  subqueryStatement,
  tenantColumnName,
  tenantId,
  lastTransferXmin,
}: {
  columns: { nameInSource: string; nameInDestination: string }[];
  subqueryStatement: SelectStmt;
  tenantColumnName: string;
  tenantId: string;
  lastTransferXmin: number;
}) =>
  deparse([
    {
      RawStmt: {
        stmt: {
          SelectStmt: {
            targetList: columns.map((cc) => ({
              ResTarget: {
                name: cc.nameInDestination.replaceAll('"', ""),
                val: {
                  ColumnRef: {
                    fields: [
                      {
                        String: {
                          str: cc.nameInSource.replaceAll('"', ""),
                        },
                      },
                    ],
                  },
                },
              },
            })),
            fromClause: [
              {
                RangeSubselect: {
                  subquery: {
                    SelectStmt: subqueryStatement,
                  },
                  alias: { aliasname: "t" },
                },
              },
            ],
            whereClause: {
              BoolExpr: {
                boolop: "AND_EXPR",
                args: [
                  {
                    A_Expr: {
                      kind: "AEXPR_OP",
                      name: [{ String: { str: "=" } }],
                      lexpr: {
                        ColumnRef: {
                          fields: [{ String: { str: tenantColumnName } }],
                        },
                      },
                      rexpr: {
                        A_Const: {
                          val: { String: { str: tenantId } },
                        },
                      },
                    },
                  },
                  {
                    A_Expr: {
                      kind: "AEXPR_OP",
                      name: [{ String: { str: ">" } }],
                      lexpr: {
                        TypeCast: {
                          arg: {
                            TypeCast: {
                              arg: {
                                ColumnRef: {
                                  fields: [{ String: { str: "xmin" } }],
                                },
                              },
                              typeName: {
                                names: [{ String: { str: "text" } }],
                                typemod: -1,
                              },
                            },
                          },
                          typeName: {
                            names: [
                              { String: { str: "pg_catalog" } },
                              { String: { str: "int8" } },
                            ],
                            typemod: -1,
                          },
                        },
                      },
                      rexpr: {
                        A_Const: {
                          val: { Integer: { ival: lastTransferXmin } },
                        },
                      },
                    },
                  },
                ],
              },
            },
            limitOption: "LIMIT_OPTION_DEFAULT",
            op: "SETOP_NONE",
          },
        },
        stmt_location: 0,
      },
    },
  ]);

export default async function (job: Job<TransferQueueJobData>) {
  try {
    await db.transfer.update({
      where: {
        id: job.data.id,
      },
      data: {
        status: "PENDING",
      },
    });

    logger.info("Processor is handling job with transfer:", job.data);

    const transfer = job.data;
    const destination = transfer.destination;
    const configuration = destination.configuration;

    if (!configuration) {
      throw new Error(
        `No configuration found for transfer with ID ${transfer.id}, aborting`,
      );
    }

    const view = configuration.view;
    const source = view.source;

    const {
      sourceType: dbType,
      host,
      port,
      username,
      password,
      name: dbName,
    } = source;

    const conn = await getConnection({
      dbType,
      host,
      port,
      username,
      password,
      dbName,
    });

    if (conn.status !== "REACHABLE") {
      throw new Error(
        `Source with ID ${source.id} is unreachable, aborting transfer ${transfer.id}`,
      );
    }

    const parsedTableExpr = parse(view.tableExpression);

    if (!("SelectStmt" in parsedTableExpr[0].RawStmt.stmt)) {
      throw new Error();
    }

    parsedTableExpr[0].RawStmt.stmt.SelectStmt.targetList.unshift({
      ResTarget: {
        val: {
          ColumnRef: {
            fields: [
              {
                String: {
                  str: "xmin",
                },
              },
            ],
          },
        },
      },
    });

    switch (destination.destinationType) {
      case "PROVISIONED_S3": {
        await uploadObject(
          conn.extractToCsvUnsafe(
            buildExtractExpression({
              columns: configuration.columns,
              subqueryStatement: parsedTableExpr[0].RawStmt.stmt.SelectStmt,
              tenantColumnName: view.tenantColumn,
              tenantId: destination.tenantId,
              lastTransferXmin: 0,
            }),
          ),
        );
        break;
      }
    }

    await db.transfer.update({
      where: {
        id: transfer.id,
      },
      data: {
        status: "COMPLETE",
      },
    });
  } catch (error) {
    logger.error(error);

    await db.transfer.update({
      where: {
        id: job.data.id,
      },
      data: {
        status: "FAILED",
      },
    });
  }
}
