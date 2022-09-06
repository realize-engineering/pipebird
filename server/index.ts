import http from "http";
import { app } from "./app.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { transferQueue } from "./queues/transfer/scheduler.js";
import got from "got";

const gracefulShutdown = async () => {
  await transferQueue.close();
  try {
    logger.info("Graceful shutdown pending");
    await got.post("https://my.pipebird.com/api/deployment", {
      headers: {
        "x-pipebird-monitor-secret-key":
          process.env.PIPEBIRD_MONITOR_SECRET_KEY || "",
      },
      body: {
        state: "GRACEFUL_SHUTDOWN_COMPLETED",
      },
    });
    logger.info("Graceful shutdown complete");
  } catch (e) {
    logger.error(e);
  }
};

http.createServer(app).listen(env.PORT, () => {
  logger.info(`Server listening on :${env.PORT}`);
});

process.on("uncaughtException", async (error) => {
  logger.fatal(error);
  await gracefulShutdown();
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  await gracefulShutdown();
  throw reason;
});

process.on("SIGTERM", async (reason) => {
  logger.warn(reason);
  await gracefulShutdown();
});
