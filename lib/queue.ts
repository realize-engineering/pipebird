import { run } from "graphile-worker";
import { env } from "./env.js";

const WorkerQueue = (async () => {
  const worker = await run({
    connectionString: env.DATABASE_URL,
    concurrency: 5,
    // Install signal handlers for graceful shutdown on SIGINT, SIGTERM, etc
    noHandleSignals: false,
    pollInterval: 1000,
    // you can set the taskList or taskDirectory but not both
    taskList: {},
  });
  return worker;
})();
export { WorkerQueue };
