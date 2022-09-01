import path from "path";
import { Gzip } from "zlib";

import { env } from "../env.js";
import { uploadObject } from "../aws/upload.js";
import { getColumnTypeForDest } from "../transform/index.js";
import { ConnectionQueryOp, ConnectionQueryUnsafeOp } from "../connections.js";
import { LoadDestination, Loader, LoadingActions } from "../load/index.js";

class SnowflakeLoader extends Loader implements LoadingActions {
  #queryUnsafe: ConnectionQueryUnsafeOp;

  constructor(
    query: ConnectionQueryOp,
    destination: LoadDestination,
    queryUnsafe: ConnectionQueryUnsafeOp,
  ) {
    super(query, destination);
    this.#queryUnsafe = queryUnsafe;
  }

  public createTable = async ({
    schema,
    database,
  }: {
    schema: string;
    database: string;
  }) => {
    const schemaCreateOperation = this.qb
      .raw("create schema if not exists ?? with managed access", [
        `${database}.${schema}`,
      ])
      .toSQL()
      .toNative();

    await this.query(schemaCreateOperation);

    const { configuration } = this.destination;

    const columnsWithType = configuration.columns.map((destCol) => {
      const columnType = destCol.viewColumn.dataType;

      // todo(ianedwards): change this to use additional source and destination types
      return `?? ${
        getColumnTypeForDest({
          sourceType: "POSTGRES",
          destinationType: "REDSHIFT",
          columnType,
        }) ?? "varchar"
      }`;
    });

    const tableCreateOperation = this.qb
      .raw(`create table if not exists ?? ( ${columnsWithType.join(", ")} );`, [
        `${schema}.${this.tableName}`,
        ...configuration.columns.map((col) => col.nameInDestination),
      ])
      .toSQL()
      .toNative();

    await this.query(tableCreateOperation);
  };

  stage = async (contents: Gzip, schema = "public") => {
    const pathPrefix = `snowflake/${this.destination.id}`;
    const { key } = await uploadObject({
      contents,
      pathPrefix,
      extension: "gz",
    });

    const filePath = path.posix.join(
      env.PROVISIONED_BUCKET_NAME,
      pathPrefix,
      `${key}.gz`,
    );

    const loadStageOperation = this.qb
      .raw(
        `
        create or replace stage ??
          url=?
          credentials = (aws_key_id=? aws_secret_key=?)
          encryption = (TYPE='AWS_SSE_KMS' KMS_KEY_ID=?)
          file_format = (TYPE='CSV' FIELD_DELIMITER=',' SKIP_HEADER=1);
      `,
        [
          `${schema}.${this.stageName}`,
          `s3://${filePath}`,
          `${env.S3_USER_ACCESS_ID}`,
          `${env.S3_USER_SECRET_KEY}`,
          `${env.KMS_KEY_ID}`,
        ],
      )
      .toString();

    await this.#queryUnsafe(loadStageOperation);
  };

  upsert = async (schema = "public") => {
    const { configuration } = this.destination;
    const { tableName, stageName } = this;

    const names = configuration.columns.map((col) => col.nameInDestination);
    const primaryKeyCol = configuration.view.columns.find(
      (col) => col.isPrimaryKey,
    );

    if (!primaryKeyCol) {
      throw new Error(
        `View used by configuration ID = ${this.destination.configurationId} does not have a primary key col`,
      );
    }

    const namesWithoutKey = names.filter((n) => n !== primaryKeyCol.name);

    const upsertCommand = this.qb
      .raw(
        `merge into ?? using ( 
          select 
            ${names.map((_, i) => `$${i + 1} ??`).join(", ")} 
          from @?? ) newData 
        on ?? = newData.??
        when matched then update set
          ${"?? = newData.??, ".repeat(namesWithoutKey.length).slice(0, -2)}
        when not matched then insert ( 
          ${"??, ".repeat(names.length).slice(0, -2)} 
        ) values (
          ${"newData.??, ".repeat(names.length).slice(0, -2)}
        )
        `,
        [
          `${schema}.${tableName}`,
          ...names,
          `${schema}.${stageName}`,
          `${schema}.${tableName}.${primaryKeyCol.name}`,
          primaryKeyCol.name,
          ...namesWithoutKey.flatMap((n) => [n, n]),
          ...names,
          ...names,
        ],
      )
      .toSQL()
      .toNative();

    await this.query(upsertCommand);
  };

  tearDown = async (schema = "public") => {
    const stageFullPath = `${schema}.${this.stageName}`;
    const removeFilesOperation = this.qb
      .raw("remove @??", [stageFullPath])
      .toSQL()
      .toNative();
    await this.query(removeFilesOperation);

    const dropStageOperation = this.qb
      .raw("drop stage ??", [stageFullPath])
      .toSQL()
      .toNative();
    await this.query(dropStageOperation);
  };
}

export default SnowflakeLoader;
