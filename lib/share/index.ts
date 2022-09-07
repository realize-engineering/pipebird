import { useConnection } from "../connections.js";
import { db } from "../db.js";
import RedshiftLoader from "../redshift/load.js";
import SnowflakeLoader from "../snowflake/load.js";

export const initiateNewShare = async ({ shareId }: { shareId: number }) => {
  const share = await db.share.findUnique({
    where: { id: shareId },
    select: {
      id: true,
      tenantId: true,
      warehouseId: true,
      destination: {
        select: {
          host: true,
          port: true,
          username: true,
          password: true,
          schema: true,
          database: true,
          nickname: true,
          destinationType: true,
        },
      },
      configuration: {
        select: {
          id: true,
          columns: {
            select: {
              nameInSource: true,
              nameInDestination: true,
              viewColumn: true,
            },
          },
          view: {
            select: {
              columns: true,
            },
          },
        },
      },
    },
  });

  if (!share) {
    throw new Error("Share object was not created properly");
  }

  const { destinationType, host, port, username, password, schema, database } =
    share.destination;

  const credentialsExist =
    !!host && !!port && !!username && !!password && !!database && !!schema;

  if (!credentialsExist) {
    throw new Error(`Incomplete credentials for destination`);
  }

  const connection = await useConnection({
    dbType: destinationType,
    host,
    port,
    username,
    password,
    schema,
    database,
  });

  if (connection.error) {
    throw new Error(`Destination is unreachable`);
  }

  switch (destinationType) {
    case "SNOWFLAKE": {
      const loader = new SnowflakeLoader(
        connection.query,
        share,
        connection.queryUnsafe,
      );

      await loader.createShare({
        schema,
        database,
      });

      break;
    }
    case "REDSHIFT": {
      const loader = new RedshiftLoader(
        connection.query,
        share,
        connection.queryUnsafe,
      );

      await loader.createShare({
        schema,
        database,
      });

      break;
    }
    default: {
      throw new Error(`Destination is not supported`);
    }
  }
};
