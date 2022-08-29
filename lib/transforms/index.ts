interface DTConversions {
  [key: string]: {
    [key: string]: {
      [key: string]: string;
    };
  };
}

/*
 * Table for determining conversions between types across DBs
 * Usage example: dataTypeConversions[src.sourceType][dest.destinationType][srcColumnType]
 */
export const dataTypeConversions: DTConversions = {
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
};

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

  return srcConversionToDest[columnType];
};
