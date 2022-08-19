import { Router } from "express";
import { HttpStatusCode } from "../../utils/http.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

const healthzRouter = Router();

healthzRouter.get("/", async (_req, res) => {
  const [dbCheckResult] = await Promise.allSettled([
    db.$queryRaw`SELECT 1 LIMIT 1;`,
  ]);

  logger.info(
    `Sent "SELECT 1;" to Postgres. Result: "${
      dbCheckResult.status === "fulfilled"
        ? dbCheckResult.value
        : dbCheckResult.reason
    }"`,
  );

  res.status(HttpStatusCode.MULTI_STATUS).json({
    data: [
      {
        service: "db",
        status:
          dbCheckResult.status === "fulfilled" &&
          Array.isArray(dbCheckResult.value) &&
          dbCheckResult.value.length === 1
            ? HttpStatusCode.OK
            : HttpStatusCode.SERVICE_UNAVAILABLE,
      },
    ],
  });
});

export { healthzRouter };
