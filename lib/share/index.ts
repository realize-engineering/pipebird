import { Prisma } from "@prisma/client";
import { useConnection } from "../connections/index.js";
import RedshiftLoader from "../redshift/load.js";
import SnowflakeLoader from "../snowflake/load.js";

const checkWarehouseConnection = async (
  destination: Prisma.DestinationGetPayload<{
    select: {
      host: true;
      port: true;
      username: true;
      password: true;
      schema: true;
      database: true;
      nickname: true;
      destinationType: true;
    };
  }>,
) => {
  const { destinationType, host, port, username, password, schema, database } =
    destination;

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

  return {
    connection,
    credentials: {
      schema,
      database,
    },
  };
};

export const initiateNewShare = async ({
  shareId,
  prisma,
}: {
  shareId: number;
  prisma: Prisma.TransactionClient;
}) => {
  const share = await prisma.configuration.findUnique({
    where: { id: shareId },
    select: {
      id: true,
      tenantId: true,
      warehouseId: true,
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
    },
  });

  if (!share) {
    throw new Error("Share object was not created properly");
  }

  switch (share.destination.destinationType) {
    case "PROVISIONED_S3":
      break;
    case "SNOWFLAKE": {
      const { connection, credentials } = await checkWarehouseConnection(
        share.destination,
      );

      const loader = new SnowflakeLoader(
        connection.query,
        share,
        connection.queryUnsafe,
      );

      await loader.createShare({
        schema: credentials.schema,
        database: credentials.database,
      });

      break;
    }
    case "REDSHIFT": {
      const { connection, credentials } = await checkWarehouseConnection(
        share.destination,
      );

      const loader = new RedshiftLoader(
        connection.query,
        share,
        connection.queryUnsafe,
      );

      await loader.createShare({
        schema: credentials.schema,
        database: credentials.database,
      });

      break;
    }
    default: {
      throw new Error(`Destination is not supported`);
    }
  }
};
