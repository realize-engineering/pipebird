import { proxyActivities } from "@temporalio/workflow";
// Only import the activity types
import type * as activities from "./activities.js";

const { processTransfer } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

export async function transfer({ id }: { id: number }) {
  return processTransfer({ id });
}
