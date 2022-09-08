import path from "path";
import { Gzip } from "zlib";

import { env } from "../env.js";
import { deleteObjects, uploadObject } from "../aws/upload.js";
import { getColumnTypeForDest } from "../transform/index.js";
import { ConnectionQueryOp, ConnectionQueryUnsafeOp } from "../connections.js";
import { LoadShare, Loader, LoadingActions } from "../load/index.js";

class RedshiftLoader extends Loader implements LoadingActions {
  #queryUnsafe: ConnectionQueryUnsafeOp;

  constructor(
    query: ConnectionQueryOp,
    share: LoadShare,
    queryUnsafe: ConnectionQueryUnsafeOp,
  ) {
    super(query, share);
    this.#queryUnsafe = queryUnsafe;
  }

  createShare = async ({
    schema,
    database,
  }: {
    schema: string;
    database: string;
  }) => {
    // ensure schema and table exist for results
    await this.createTable({ schema, database });

    const createShareOperation = this.qb
      .raw("create datashare ??", [this.shareName])
      .toSQL()
      .toNative();

    await this.query(createShareOperation);

    const grantSchemaUsageOperation = this.qb
      .raw("alter datashare ?? add schema ??", [this.shareName, schema])
      .toSQL()
      .toNative();
    await this.query(grantSchemaUsageOperation);

    const grantSelectUsageOperation = this.qb
      .raw("alter datashare ?? add table ??", [
        this.shareName,
        `${schema}.${this.tableName}`,
      ])
      .toSQL()
      .toNative();
    await this.query(grantSelectUsageOperation);

    const addAccountsOperation = this.qb
      .raw("grant usage on datashare ?? to account ?", [
        this.shareName,
        this.share.warehouseId,
      ])
      .toString();

    await this.#queryUnsafe(addAccountsOperation);
  };

  public createTable = async ({
    schema,
  }: {
    schema: string;
    database: string;
  }) => {
    const schemaCreateOperation = this.qb
      .raw("create schema if not exists ??", [schema])
      .toSQL()
      .toNative();

    await this.query(schemaCreateOperation);

    const { configuration } = this.share;

    const columnsWithType = configuration.columns.map((destCol) => {
      const columnType = destCol.viewColumn.dataType;

      return `?? ${
        getColumnTypeForDest({
          sourceType: "POSTGRES",
          destinationType: "REDSHIFT",
          columnType,
        }) ?? "varchar"
      }`;
    });

    const tableCreateOperation = this.qb
      .raw(`create table if not exists ?? ( ${columnsWithType.join(", ")} )`, [
        this.tableName,
        ...configuration.columns.map((col) => col.nameInDestination),
      ])
      .toSQL()
      .toNative();

    await this.query(tableCreateOperation);
  };

  stage = async (contents: Gzip) => {
    const createStageOperation = this.qb
      .raw(`create temp table if not exists ?? (like ??);`, [
        this.stageName,
        this.tableName,
      ])
      .toSQL()
      .toNative();

    await this.query(createStageOperation);

    const pathPrefix = `redshift/${this.share.id}`;
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
        copy ?? from ?
        credentials ? csv gzip timeformat as 'epochmillisecs' IGNOREHEADER 1
        `,
        [
          this.stageName,
          `s3://${filePath}`,
          `aws_access_key_id=${env.S3_USER_ACCESS_ID};aws_secret_access_key=${env.S3_USER_SECRET_KEY}`,
        ],
      )
      .toString();

    await this.#queryUnsafe(loadStageOperation);
  };

  upsert = async () => {
    const { configuration } = this.share;
    const { tableName, stageName } = this;

    const names = configuration.columns.map((col) => col.nameInDestination);
    const primaryKeyCol = configuration.view.columns.find(
      (col) => col.isPrimaryKey,
    );

    if (!primaryKeyCol) {
      throw new Error(
        `View used by configuration ID = ${this.share.configuration.id} does not have a primary key col`,
      );
    }

    const namesWithoutKey = names.filter((n) => n !== primaryKeyCol.name);

    const updateCommand = this.qb
      .raw(
        `update ?? set
        ${"?? = newData.??, ".repeat(namesWithoutKey.length).slice(0, -2)}
        from ?? as newData
        where ?? = newData.??
      `,
        [
          tableName,
          ...namesWithoutKey.flatMap((n) => [n, n]),
          stageName,
          `${tableName}.${primaryKeyCol.name}`,
          primaryKeyCol.name,
        ],
      )
      .toSQL()
      .toNative();

    await this.query(updateCommand);

    const removeCommand = this.qb
      .raw(`delete from ?? using ?? where ?? = ??`, [
        stageName,
        tableName,
        `${stageName}.${primaryKeyCol.name}`,
        `${tableName}.${primaryKeyCol.name}`,
      ])
      .toSQL()
      .toNative();

    await this.query(removeCommand);

    const insertCommand = this.qb
      .raw("insert into ?? select * from ??", [tableName, stageName])
      .toSQL()
      .toNative();

    await this.query(insertCommand);
  };

  tearDown = async () => {
    const pathPrefix = `redshift/${this.share.id}`;
    await deleteObjects({ pathPrefix });

    const dropStageOperation = this.qb
      .raw("drop table ??", [this.tableName])
      .toSQL()
      .toNative();
    await this.query(dropStageOperation);
  };
}

export default RedshiftLoader;
