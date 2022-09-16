import path from "path";
import { Gzip } from "zlib";

import {
  BigQueryServiceAccount,
  ConnectionQueryOp,
  ConnectionQueryUnsafeOp,
} from "../connections/index.js";
import { LoadConfiguration, Loader, LoadingActions } from "../load/index.js";
import { Bucket } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { BigQuery } from "@google-cloud/bigquery";

interface BQTypeMap {
  [key: string]: string;
}

const typeMap: BQTypeMap = {
  tinyint: "int64",
  smallint: "int64",
  mediumint: "int64",
  integer: "int64",
  bigint: "int64",
  decimal: "numeric",
  real: "float64",
  "double precision": "float64",
  boolean: "bool",
  char: "string",
  varchar: "string",
  bytea: "bytes",
  tinytext: "string",
  text: "string",
  mediumtext: "string",
  longtext: "string",
  timestamp: "timestamp",
  "timestamp without time zone": "timestamp",
  "timestamp with time zone": "timestamp",
  date: "date",
  time: "time",
  jsonb: "json",
};

const uploadStream = ({
  filePath,
  contents,
  bucket,
}: {
  filePath: string;
  contents: Gzip;
  bucket: Bucket;
}) => {
  return new Promise<void>((resolve, reject) => {
    contents
      .pipe(bucket.file(filePath).createWriteStream())
      .on("finish", () => {
        resolve();
      })
      .on("error", () => {
        reject();
      });
  });
};

class BigQueryLoader extends Loader implements LoadingActions {
  #queryUnsafe: ConnectionQueryUnsafeOp;

  constructor(
    query: ConnectionQueryOp,
    configuration: LoadConfiguration,
    queryUnsafe: ConnectionQueryUnsafeOp,
  ) {
    super(query, configuration);
    this.#queryUnsafe = queryUnsafe;
  }

  createShare = async () => {
    throw new Error("Sharing not yet implemented for BigQuery.");
  };

  createTable = async ({
    schema,
    database,
  }: {
    schema: string;
    database: string;
  }) => {
    const schemaCreateOperation = this.qb
      .raw("create schema if not exists ??", [`${database}.${schema}`])
      .toSQL()
      .toNative();

    await this.query(schemaCreateOperation);
    const columnsWithType = this.configuration.columns.map((destCol) => {
      const columnType = destCol.viewColumn.dataType;

      // todo(ianedwards): verify types for BQ
      return `?? ${typeMap[columnType] ?? "string"}`;
    });

    const tableCreateOperation = this.qb
      .raw(`create table if not exists ?? ( ${columnsWithType.join(", ")} );`, [
        `${database}.${schema}.${this.tableName}`,
        ...this.configuration.columns.map((col) => col.nameInDestination),
      ])
      .toSQL()
      .toNative();

    await this.query(tableCreateOperation);
  };

  stage = async ({
    contents,
    schema,
    bucket,
    serviceAccount,
  }: {
    contents: Gzip;
    schema: string;
    bucket: Bucket;
    serviceAccount: BigQueryServiceAccount;
  }) => {
    const key = randomUUID();
    const pathPrefix = `bigquery/${this.configuration.id}`;
    const filePath = path.posix.join(pathPrefix, `${key}.gz`);

    // await bucket.file(filePath).create();
    await uploadStream({ filePath, contents, bucket });

    const bigquery = new BigQuery({
      credentials: serviceAccount,
    });

    // Create an external table linked to the GCS file
    await bigquery.dataset(schema).createTable(this.stageName, {
      externalDataConfiguration: {
        sourceFormat: "CSV",
        sourceUris: [`gs://${path.posix.join(bucket.name, filePath)}`],
        csvOptions: { skipLeadingRows: "1" },
        compression: "GZIP",
        schema: {
          fields: this.configuration.columns.map((destCol) => ({
            name: destCol.nameInDestination,
            type: typeMap[destCol.viewColumn.dataType] ?? "string", // todo(ianedwards): verify types for BQ
          })),
        },
      },
    });
  };

  upsert = async (schema = "public", database?: string) => {
    const { tableName, stageName, configuration } = this;

    const names = configuration.columns.map((col) => col.nameInDestination);
    const primaryKeyCol = configuration.view.columns.find(
      (col) => col.isPrimaryKey,
    );

    if (!primaryKeyCol) {
      throw new Error(
        `View used by configuration ID = ${configuration.id} does not have a primary key col`,
      );
    }

    const namesWithoutKey = names.filter((n) => n !== primaryKeyCol.name);

    const upsertCommand = this.qb
      .raw(
        `merge into ?? using ( 
          select 
            ${names.map((_) => "??").join(", ")} 
          from ?? ) newData 
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
          `${database}.${schema}.${tableName}`,
          ...names,
          `${database}.${schema}.${stageName}`,
          `${tableName}.${primaryKeyCol.name}`,
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
      .raw("drop table ??", [stageFullPath])
      .toSQL()
      .toNative();
    await this.query(removeFilesOperation);

    // todo(ianedwards): ensure files are deleted from GCS
  };
}

export default BigQueryLoader;
