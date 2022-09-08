import { Connection, WorkflowClient } from "@temporalio/client";
import { env } from "../env.js";
import fs from "node:fs/promises";
import { transfer } from "./workflows.js";

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

const client = new WorkflowClient({
  connection,
});

export const startTransfer = ({ id }: { id: number }) =>
  client.start(transfer, {
    taskQueue: "transfer",
    workflowId: `txfer_${id}`,
    args: [{ id }],
  });
