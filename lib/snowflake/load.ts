import { Prisma } from "@prisma/client";
import sql, { Sql, raw } from "sql-template-tag";
import { ConnectionQueryOp } from "../connections.js";
import {
  db,
  quoteIdentifier,
  quoteIdentifierPairs,
  quoteIdentifiers,
} from "../db.js";
import { getColumnTypeForDest } from "../transforms/index.js";

export const getUniqueTableName = ({
  nickname,
  tenantId,
  destinationId,
}: {
  nickname: string;
  tenantId: string;
  destinationId: number;
}) => `ShareData_${nickname.replaceAll(" ", "_")}_${tenantId}_${destinationId}`;

/*
 * Creates a new table in Snowflake for each added destination
 * using a consistent naming format.
 */
export const createDestinationTable = async ({
  query,
  schema,
  database,
  destination,
}: {
  query: ConnectionQueryOp;
  schema: string;
  database: string;
  destination: Prisma.DestinationGetPayload<{
    select: {
      id: true;
      tenantId: true;
      configurationId: true;
      destinationType: true;
      nickname: true;
    };
  }>;
}) => {
  const { id, tenantId, configurationId, nickname } = destination;

  const configuration = await db.configuration.findUnique({
    where: {
      id: configurationId,
    },
    select: {
      columns: {
        select: {
          nameInDestination: true,
          viewColumn: {
            select: {
              dataType: true,
            },
          },
        },
      },
    },
  });

  if (!configuration) {
    throw new Error("Configuration not associated with destination.");
  }

  const schemaCreateOperation = sql`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(
    database,
  )}.${quoteIdentifier(schema)} WITH MANAGED ACCESS;`;
  await query(schemaCreateOperation);

  const tableName = getUniqueTableName({
    nickname,
    tenantId,
    destinationId: id,
  });

  const columnsWithType = configuration.columns.map((destCol) => {
    const columnType = destCol.viewColumn.dataType;

    // todo(ianedwards): change this to use additional source and destination types
    return `${destCol.nameInDestination} ${
      getColumnTypeForDest({
        sourceType: "POSTGRES",
        destinationType: "SNOWFLAKE",
        columnType,
      }) ?? "varchar"
    }`;
  });

  const tableCreateOperation = sql`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(
    schema,
  )}.${quoteIdentifier(tableName)} ( ${quoteIdentifierPairs(
    columnsWithType,
    true,
  )} );`;

  await query(tableCreateOperation);

  return tableName;
};

/*
 * Builds and returns a merge query that upserts data for a given destination.
 */
export const buildInitiateUpsert = ({
  columns,
  schema,
  stageName,
  tableName,
  primaryKeyCol,
}: {
  columns: Prisma.ColumnTransformationGetPayload<{
    select: {
      nameInSource: true;
      nameInDestination: true;
    };
  }>[];
  schema: string;
  stageName: string;
  tableName: string;
  primaryKeyCol: string;
}): Sql => {
  const stageSelect = sql`
        SELECT 
          ${quoteIdentifierPairs(
            columns.map((col, idx) => `$${idx + 1} ${col.nameInDestination}`),
            false,
          )}
        from @${quoteIdentifier(schema)}.${quoteIdentifier(stageName)}
    `;

  const initiateUpsertOperation = sql`
      MERGE INTO ${quoteIdentifier(schema)}.${quoteIdentifier(
    tableName,
  )} USING (${stageSelect}) newData 
      ON ${quoteIdentifier(schema)}.${quoteIdentifier(
    tableName,
  )}.${quoteIdentifier(primaryKeyCol)} = newData.${quoteIdentifier(
    primaryKeyCol,
  )}
      WHEN MATCHED THEN UPDATE SET
        ${raw(
          columns
            .filter((col) => col.nameInDestination !== primaryKeyCol)
            .map(
              (col) =>
                `${quoteIdentifier(col.nameInDestination).text} = newData.${
                  quoteIdentifier(col.nameInDestination).text
                }`,
            )
            .join(", "),
        )}
      WHEN NOT MATCHED THEN
        INSERT (
          ${quoteIdentifiers(columns.map((col) => col.nameInDestination))}
        )
        VALUES (
          ${raw(
            columns
              .map(
                (col) =>
                  `newData.${quoteIdentifier(col.nameInDestination).text}`,
              )
              .join(", "),
          )}
        )
    `;

  return initiateUpsertOperation;
};

/*
 * Deletes a stage and its files in S3
 */
export const removeLoadedData = async ({
  query,
  schema,
  tempStageName,
}: {
  query: ConnectionQueryOp;
  schema: string;
  tempStageName: string;
}) => {
  const removeFilesOperation = sql`REMOVE @${quoteIdentifier(
    schema,
  )}.${quoteIdentifier(tempStageName)}`;
  await query(removeFilesOperation);

  const dropStageOperation = sql`DROP STAGE ${quoteIdentifier(
    schema,
  )}.${quoteIdentifier(tempStageName)}`;
  await query(dropStageOperation);
};
