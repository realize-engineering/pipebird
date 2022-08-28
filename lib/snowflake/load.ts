import { Prisma } from "@prisma/client";
import { Sequelize } from "sequelize";
import { db } from "../db.js";
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

  const schemaCreateOperation = `CREATE SCHEMA IF NOT EXISTS "${database}"."${schema}" WITH MANAGED ACCESS;`;
  await client.query(schemaCreateOperation);

  const tableName = getUniqueTableName({
    nickname,
    tenantId,
    destinationId: id,
  });

  const columnsWithType = configuration.columns.map((destCol) => {
    const columnType = destCol.viewColumn.dataType;

    // todo(ianedwards): change this to use additional source and destination types
    return `"${destCol.nameInDestination}" ${getColumnTypeForDest({
      sourceType: "POSTGRES",
      destinationType: "SNOWFLAKE",
      columnType,
    })}`;
  });

  const tableCreateOperation = `CREATE TABLE IF NOT EXISTS "${schema}"."${tableName}" ( ${columnsWithType.join(
    ", ",
  )} );`;
  await client.query(tableCreateOperation);

  return tableName;
};

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
            .map((col, idx) => `$${idx + 1} "${col.nameInDestination}"`)
            .join(",\n")}
        from @"${schema}"."${stageName}"
    `;

  const initiateUpsertOperation = `
      MERGE INTO "${schema}"."${tableName}" USING (${stageSelect}) newData 
      ON "${schema}"."${tableName}"."${primaryKeyCol}" = newData."${primaryKeyCol}"
      WHEN MATCHED THEN UPDATE SET
        ${columns
          .filter((col) => col.nameInDestination !== primaryKeyCol)
          .map(
            (col) =>
              `"${col.nameInDestination}" = newData."${col.nameInDestination}"`,
          )
          .join(",\n")}
      WHEN NOT MATCHED THEN
        INSERT (
          ${columns.map((col) => `"${col.nameInDestination}"`).join(",\n")}
        )
        VALUES (
          ${columns
            .map((col) => `newData."${col.nameInDestination}"`)
            .join(",\n")}
        )
    `;

  return initiateUpsertOperation;
};
