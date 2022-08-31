import { z } from "zod";

/*
 * Table for determining conversions between types across DBs
 * Usage example: dataTypeConversions[src.sourceType][dest.destinationType][srcColumnType]
 */
const dataTypeConversionSchema = z.object({
  SNOWFLAKE: z.object({
    POSTGRES: z.object({
      smallint: z.literal("smallint"),
      bigint: z.literal("bigint"),
      integer: z.literal("integer"),
      decimal: z.literal("decimal"),
      real: z.literal("real"),
      "double precision": z.literal("double precision"),
      boolean: z.literal("boolean"),
      varchar: z.literal("varchar"),
      text: z.literal("text"),
      binary: z.literal("bytea"),
      timestamp: z.literal("timestamp"),
      timestamptz: z.literal("timestamp with time zone"),
      date: z.literal("date"),
      time: z.literal("time"),
      object: z.literal("jsonb"),
    }),
  }),
  POSTGRES: z.object({
    SNOWFLAKE: z.object({
      smallint: z.literal("smallint"),
      bigint: z.literal("bigint"),
      integer: z.literal("integer"),
      decimal: z.literal("decimal"),
      real: z.literal("real"),
      "double precision": z.literal("double precision"),
      boolean: z.literal("boolean"),
      varchar: z.literal("varchar"),
      text: z.literal("text"),
      bytea: z.literal("binary"),
      timestamp: z.literal("timestamp"),
      "timestamp without time zone": z.literal("timestamp"),
      "timestamp with time zone": z.literal("timestamptz"),
      date: z.literal("date"),
      time: z.literal("time"),
      jsonb: z.literal("variant"),
      "USER-DEFINED": z.literal("varchar"),
    }),
  }),
});
export const dataTypeConversions: Readonly<
  z.infer<typeof dataTypeConversionSchema>
> = Object.freeze({
  SNOWFLAKE: {
    POSTGRES: {
      smallint: "smallint",
      bigint: "bigint",
      integer: "integer",
      decimal: "decimal",
      real: "real",
      "double precision": "double precision",
      boolean: "boolean",
      varchar: "varchar",
      text: "text",
      binary: "bytea",
      timestamp: "timestamp",
      timestamptz: "timestamp with time zone",
      date: "date",
      time: "time",
      object: "jsonb",
    },
  },
  POSTGRES: {
    SNOWFLAKE: {
      smallint: "smallint",
      bigint: "bigint",
      integer: "integer",
      decimal: "decimal",
      real: "real",
      "double precision": "double precision",
      boolean: "boolean",
      varchar: "varchar",
      text: "text",
      bytea: "binary",
      timestamp: "timestamp",
      "timestamp without time zone": "timestamp",
      "timestamp with time zone": "timestamptz",
      date: "date",
      time: "time",
      jsonb: "variant",
      "USER-DEFINED": "varchar",
    },
  },
});

export const getColumnTypeForDest = ({
  sourceType,
  destinationType,
  columnType,
}: {
  sourceType: "POSTGRES";
  destinationType: "SNOWFLAKE";
  columnType: string;
}) => {
  if (!Object.hasOwn(dataTypeConversions, sourceType)) {
    return null;
  }

  const conversionsBySrc = dataTypeConversions[sourceType];
  if (!Object.hasOwn(conversionsBySrc, destinationType)) {
    return null;
  }

  const srcConversionToDest = conversionsBySrc[destinationType];
  if (!Object.hasOwn(srcConversionToDest, columnType)) {
    return null;
  }

  return srcConversionToDest[
    dataTypeConversionSchema.shape[sourceType].shape[destinationType]
      .keyof()
      .parse(columnType)
  ];
};
