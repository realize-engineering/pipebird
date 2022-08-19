import { Router } from "express";
import { HttpStatusCode } from "../../utils/http.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

const healthzRouter = Router();

healthzRouter.get("/", async (_req, res) => {
  const [dbCheckResult] = await Promise.allSettled([db.$executeRaw`SELECT 1;`]);

  logger.info(
    `Sent "SELECT 1;" to DB. Result: "${
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
          dbCheckResult.status === "fulfilled" && dbCheckResult.value === 1
            ? HttpStatusCode.OK
            : HttpStatusCode.SERVICE_UNAVAILABLE,
      },
    ],
  });
});

export { healthzRouter };
