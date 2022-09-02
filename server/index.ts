import http from "http";
import { app } from "./app.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { transferQueue } from "./queues/transfer/scheduler.js";
import got from "got";

http.createServer(app).listen(env.PORT, () => {
  logger.info(`Server listening on :${env.PORT}`);
});

process.on("uncaughtException", (error) => {
  logger.fatal(error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  throw reason;
});

process.on("SIGTERM", async (reason) => {
  logger.warn(reason);
  await transferQueue.close();
  try {
    await got.delete("https://my.pipebird.com/api/deployment", {
      headers: {
        Authorization: `Bearer ${env.LICENSE_KEY}`,
        "x-pipebird-public-key": env.PUBLIC_KEY,
      },
    });
  } catch (e) {
    logger.error(e);
  }
});
