import { env } from "./env.js";

const queueNames = {
  INITIATE_TRANSFER: "INITIATE_TRANSFER",
  SEND_WEBHOOK: "SEND_WEBHOOK",
};

const connection = {
  host: env.REDIS_HOST,
  port: env.PORT,
};

export { queueNames, connection };
