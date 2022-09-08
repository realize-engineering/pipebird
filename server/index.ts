import http from "http";
import { app } from "./app.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import got from "got";

http.createServer(app).listen(env.PORT, async () => {
  logger.info(`Server listening on :${env.PORT}`);
  try {
    await got.patch(`${env.CONTROL_PLANE_URL}/api/deployment`, {
      headers: {
        "x-pipebird-monitor-secret-key":
          process.env.PIPEBIRD_MONITOR_SECRET_KEY || "",
      },
      json: { state: "RUNNING" },
    });
    logger.info("Notified Pipebird monitor that instance is running.");
  } catch (e) {
    logger.warn({
      monitorError: e,
      message:
        "Failed to notify Pipebird monitor that instance started running.",
    });
  }
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGUSR2", shutdown);

async function shutdown(signal: NodeJS.Signals) {
  logger.warn(signal);
  try {
    logger.info("Graceful shutdown pending");
    await got.patch(`${env.CONTROL_PLANE_URL}/api/deployment`, {
      headers: {
        "x-pipebird-monitor-secret-key":
          process.env.PIPEBIRD_MONITOR_SECRET_KEY || "",
      },
      json: {
        state: "GRACEFUL_SHUTDOWN_COMPLETED",
      },
    });
    logger.info("Graceful shutdown complete");
  } catch (e) {
    logger.error(e);
  }
  process.exit(0);
}
