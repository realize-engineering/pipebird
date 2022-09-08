import { Runtime, Worker } from "@temporalio/worker";
import * as activities from "./activities.js";
import cluster from "node:cluster";
import { cpus } from "node:os";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { bundlePath, workflowsPath } from "./paths.js";

Runtime.install({
  logger: {
    log(level, message, meta) {
      this[level.toLowerCase() as Lowercase<typeof level>](message, meta);
    },
    trace: (message, meta) =>
      meta ? logger.trace(meta, message) : logger.trace(message),
    debug: (message, meta) =>
      meta ? logger.debug(meta, message) : logger.debug(message),
    info: (message, meta) =>
      meta ? logger.info(meta, message) : logger.info(message),
    warn: (message, meta) =>
      meta ? logger.warn(meta, message) : logger.warn(message),
    error: (message, meta) =>
      meta ? logger.error(meta, message) : logger.error(message),
  },
});

if (cluster.isPrimary) {
  logger.info(`Worker cluster primary is running`);

  const numLogicalCores = cpus().length;
  if (env.NUM_WORKERS > numLogicalCores) {
    logger.warn(
      { numWorkers: env.NUM_WORKERS, numLogicalCores },
      `Provided worker count is greater than logical core count`,
    );
  }

  for (let i = 0; i < env.NUM_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("online", (worker) => {
    logger.info(`Worker ${worker.id} is online`);
  });

  cluster.on("exit", (worker, code, signal) => {
    logger.info(
      `Worker ${worker.id} exited with code ${code} (signal: ${signal})`,
    );
  });
} else {
  const transferWorker = await Worker.create({
    ...(env.NODE_ENV === "production"
      ? { workflowBundle: { codePath: bundlePath } }
      : { workflowsPath }),
    activities,
    taskQueue: "transfer",
  });

  await transferWorker.run();
}
