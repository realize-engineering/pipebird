import { Prisma } from "@prisma/client";
import { default as knex, Knex } from "knex";

import { db } from "../db.js";
import { ConnectionQueryOp, ConnectionQueryUnsafeOp } from "../connections.js";
import { getColumnTypeForDest } from "../transforms/index.js";
import { env } from "../env.js";

// todo(ianedwards): look into support snowflake dialect directly with knex
// this will serve our purposes for building safe raw statements for the time being
// using postgres as it will double quote identifiers
const knexBuilder = knex({
  client: "postgres",
});

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

  const schemaCreateOperation = knexBuilder
    .raw("CREATE SCHEMA IF NOT EXISTS ?? WITH MANAGED ACCESS", [
      `${database}.${schema}`,
    ])
    .toSQL()
    .toNative();

  await query(schemaCreateOperation);

  const tableName = getUniqueTableName({
    nickname,
    tenantId,
    destinationId: id,
  });

  const columnsWithType = configuration.columns.map((destCol) => {
    const columnType = destCol.viewColumn.dataType;

    // todo(ianedwards): change this to use additional source and destination types
    return `?? ${
      getColumnTypeForDest({
        sourceType: "POSTGRES",
        destinationType: "SNOWFLAKE",
        columnType,
      }) ?? "varchar"
    }`;
  });

  const tableCreateOperation = knexBuilder
    .raw(`CREATE TABLE IF NOT EXISTS ?? ( ${columnsWithType.join(", ")} );`, [
      `${schema}.${tableName}`,
      ...configuration.columns.map((col) => col.nameInDestination),
    ])
    .toSQL()
    .toNative();

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
}): Knex.SqlNative => {
  const names = columns.map((col) => col.nameInDestination);
  const namesWithoutKey = names.filter((n) => n !== primaryKeyCol);

  const upsertCommand = knexBuilder
    .raw(
      `MERGE INTO ?? USING ( SELECT ${names
        .map((_, i) => `$${i + 1} ??`)
        .join(", ")} FROM @?? ) newData ON ?? = newData.??
      WHEN MATCHED THEN UPDATE SET
        ${"?? = newData.??, ".repeat(namesWithoutKey.length).slice(0, -2)}
      WHEN NOT MATCHED THEN INSERT ( ${"??, "
        .repeat(names.length)
        .slice(0, -2)} ) VALUES
        ( ${"newData.??, ".repeat(names.length).slice(0, -2)})
      `,
      [
        `${schema}.${tableName}`,
        ...names,
        `${schema}.${stageName}`,
        `${schema}.${tableName}.${primaryKeyCol}`,
        primaryKeyCol,
        ...namesWithoutKey.flatMap((n) => [n, n]),
        ...names,
        ...names,
      ],
    )
    .toSQL()
    .toNative();

  return upsertCommand;
};

export const createStage = async ({
  queryUnsafe,
  schema,
  tempStageName,
  pathPrefix,
}: {
  queryUnsafe: ConnectionQueryUnsafeOp;
  schema: string;
  tempStageName: string;
  pathPrefix: string;
}) => {
  const stageFullPath = `${schema}.${tempStageName}`;
  const createStageOperation = knexBuilder
    .raw(
      `
      create or replace stage ??
        url=?
        credentials = (aws_key_id=? aws_secret_key=?)
        encryption = (TYPE='AWS_SSE_KMS' KMS_KEY_ID=?)
        file_format = (TYPE='CSV' FIELD_DELIMITER=',' SKIP_HEADER=1);
    `,
      [
        stageFullPath,
        `s3://${env.PROVISIONED_BUCKET_NAME}/${pathPrefix}`,
        `${env.S3_USER_ACCESS_ID}`,
        `${env.S3_USER_SECRET_KEY}`,
        `${env.KMS_KEY_ID}`,
      ],
    )
    .toString();

  await queryUnsafe(createStageOperation);
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
  const stageFullPath = `${schema}.${tempStageName}`;
  const removeFilesOperation = knexBuilder
    .raw("REMOVE @??", [stageFullPath])
    .toSQL()
    .toNative();
  await query(removeFilesOperation);

  const dropStageOperation = knexBuilder
    .raw("DROP STAGE ??", [stageFullPath])
    .toSQL()
    .toNative();
  await query(dropStageOperation);
};
