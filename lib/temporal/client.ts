import { Connection, WorkflowClient } from "@temporalio/client";
import { env } from "../env.js";
import fs from "node:fs/promises";
import { transfer } from "./workflows.js";
import { logger } from "../logger.js";

let client: WorkflowClient;

try {
  const connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
    ...(env.TEMPORAL_CLIENT_CERT_PATH &&
      env.TEMPORAL_CLIENT_KEY_PATH && {
        tls: {
          clientCertPair: {
            crt: await fs.readFile(env.TEMPORAL_CLIENT_CERT_PATH),
            key: await fs.readFile(env.TEMPORAL_CLIENT_KEY_PATH),
          },
        },
      }),
  });
  client = new WorkflowClient({
    connection,
  });
} catch (e) {
  logger.error({
    connectionError: e,
    message: "Failed to create workflow client connection.",
  });
  process.exit(1);
}

export const startTransfer = ({ id }: { id: number }) =>
  client.start(transfer, {
    taskQueue: "transfer",
    workflowId: `txfer_${id}`,
    args: [{ id }],
  });
