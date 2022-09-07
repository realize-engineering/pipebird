import { proxyActivities, proxyLocalActivities } from "@temporalio/workflow";
// Only import the activity types
import type * as activities from "./activities.js";

const { getWebhooks } = proxyLocalActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
});

const { processTransfer, processWebhook } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

export async function transfer({ id }: { id: number }) {
  await processTransfer({ id });

  const webhooks = await getWebhooks();

  // todo(ianedwards): retry on failed webhook send
  await Promise.allSettled(
    webhooks.map((wh) => processWebhook({ transferId: id, webhook: wh })),
  );
}
