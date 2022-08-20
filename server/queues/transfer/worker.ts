import { Worker } from "bullmq";
import { connection, queueNames } from "../../../lib/queues.js";
import processor from "./processor.js";
export const worker = new Worker(queueNames.INITIATE_TRANSFER, processor, {
  connection,
  concurrency: 1, // TODO(cumason) increase concurrency/create more workers
});

worker.on("completed", (job) =>
  console.log(
    `Completed job ${job.id} successfully, sent email to ${job.data.to}`,
  ),
);
worker.on("failed", (job, err) =>
  console.log(`Failed job ${job.id} with ${err}`),
);

worker.on("progress", (job, progress) =>
  console.log(`Progress for job ${job.id}=${progress}`),
);
