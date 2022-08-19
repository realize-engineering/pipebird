import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

export const db = new PrismaClient();

db.$queryRaw`PRAGMA journal_mode = WAL;`.then(() => {
  logger.info('Set journal mode to "WAL"');
});

db.$queryRaw`PRAGMA busy_timeout = 5000;`.then(() => {
  logger.info("Set busy timeout to 5000ms");
});

db.$queryRaw`PRAGMA foreign_keys = ON;`.then(() => {
  logger.info("Enabled enforcement of foreign key constraints");
});

db.$queryRaw`PRAGMA synchronous = NORMAL;`.then(() => {
  logger.info('Set "synchronous" flag to "NORMAL"');
});
