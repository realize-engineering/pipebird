import { Queue } from "bullmq";
import { queueNames, connection } from "../../../lib/queues.js";

const transferQueue = new Queue(queueNames.INITIATE_TRANSFER, { connection });
export { transferQueue };
