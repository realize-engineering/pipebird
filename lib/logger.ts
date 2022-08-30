import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";

export const logger = pino({ level: env.LOG_LEVEL });
export const httpLogger = pinoHttp({ level: env.LOG_LEVEL });
