import { env } from "./env.js";

const queueNames = {
  INITIATE_TRANSFER: "INITIATE_TRANSFER",
};

const connection = {
  host: env.REDIS_HOST,
  port: env.PORT,
};

export { queueNames, connection };
