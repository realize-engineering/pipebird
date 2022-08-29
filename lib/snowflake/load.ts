import { Prisma } from "@prisma/client";
import { Sequelize } from "sequelize";
import { db } from "../db.js";
import { getColumnTypeForDest } from "../transforms/index.js";

export const sanitizeQueryParam = (value: string) => value.replace(/\W/g, "");

export const getUniqueTableName = ({
  nickname,
  tenantId,
  destinationId,
}: {
  nickname: string;
  tenantId: string;
  destinationId: number;
}) =>
  `ShareData_${sanitizeQueryParam(
    nickname.replaceAll(" ", "_"),
  )}_${sanitizeQueryParam(tenantId)}_${destinationId}`;

/*
 * Creates a new table in Snowflake for each added destination
 * using a consistent naming format.
 */
export const createDestinationTable = async ({
  client,
  schema,
  database,
  destination,
}: {
  client: Sequelize;
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

  const schemaCreateOperation = `CREATE SCHEMA IF NOT EXISTS "${sanitizeQueryParam(
    database,
  )}"."${sanitizeQueryParam(schema)}" WITH MANAGED ACCESS;`;
  await client.query(schemaCreateOperation);

  const tableName = getUniqueTableName({
    nickname,
    tenantId,
    destinationId: id,
  });

  const columnsWithType = configuration.columns.map((destCol) => {
    const columnType = destCol.viewColumn.dataType;

    // todo(ianedwards): change this to use additional source and destination types
    return `"${sanitizeQueryParam(destCol.nameInDestination)}" ${
      getColumnTypeForDest({
        sourceType: "POSTGRES",
        destinationType: "SNOWFLAKE",
        columnType,
      }) ?? "varchar"
    }`;
  });

  const tableCreateOperation = `CREATE TABLE IF NOT EXISTS "${sanitizeQueryParam(
    schema,
  )}"."${sanitizeQueryParam(tableName)}" ( ${columnsWithType.join(", ")} );`;
  await client.query(tableCreateOperation);

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
}) => {
  const stageSelect = `
        SELECT 
          ${columns
            .map(
              (col, idx) =>
                `$${idx + 1} "${sanitizeQueryParam(col.nameInDestination)}"`,
            )
            .join(",\n")}
        from @"${sanitizeQueryParam(schema)}"."${sanitizeQueryParam(stageName)}"
    `;

  const SCHEMA_WITH_TABLE_NAME = `"${sanitizeQueryParam(
    schema,
  )}"."${sanitizeQueryParam(tableName)}"`;
  const initiateUpsertOperation = `
      MERGE INTO ${SCHEMA_WITH_TABLE_NAME} USING (${stageSelect}) newData 
      ON ${SCHEMA_WITH_TABLE_NAME}."${primaryKeyCol}" = newData."${primaryKeyCol}"
      WHEN MATCHED THEN UPDATE SET
        ${columns
          .filter((col) => col.nameInDestination !== primaryKeyCol)
          .map(
            (col) =>
              `"${sanitizeQueryParam(
                col.nameInDestination,
              )}" = newData."${sanitizeQueryParam(col.nameInDestination)}"`,
          )
          .join(",\n")}
      WHEN NOT MATCHED THEN
        INSERT (
          ${columns
            .map((col) => `"${sanitizeQueryParam(col.nameInDestination)}"`)
            .join(",\n")}
        )
        VALUES (
          ${columns
            .map(
              (col) => `newData."${sanitizeQueryParam(col.nameInDestination)}"`,
            )
            .join(",\n")}
        )
    `;

  return initiateUpsertOperation;
};

/*
 * Deletes a stage and its files in S3
 */
export const removeLoadedData = async ({
  client,
  schema,
  tempStageName,
}: {
  client: Sequelize;
  schema: string;
  tempStageName: string;
}) => {
  const removeFilesOperation = `REMOVE @"${sanitizeQueryParam(
    schema,
  )}"."${sanitizeQueryParam(tempStageName)}"`;
  await client.query(removeFilesOperation);

  const dropStageOperation = `DROP STAGE "${sanitizeQueryParam(
    schema,
  )}"."${sanitizeQueryParam(tempStageName)}"`;
  await client.query(dropStageOperation);
};
