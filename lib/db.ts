import { PrismaClient } from "@prisma/client";
import { raw, Sql } from "sql-template-tag";

export const db = new PrismaClient();

export const quoteIdentifier = (value: string): Sql =>
  raw(
    `"${Array.from(value).reduce(
      (identifier, char) =>
        char === '"' ? identifier + '""' : identifier + char,
      "",
    )}"`,
  );

export const quoteIdentifiers = (
  value: (string | { nameInSource: string; nameInDestination: string })[],
): Sql =>
  raw(
    value
      .map((v) =>
        typeof v === "string"
          ? quoteIdentifier(v).sql
          : `${quoteIdentifier(v.nameInSource).sql} AS ${
              quoteIdentifier(v.nameInDestination).sql
            }`,
      )
      .join(","),
  );
