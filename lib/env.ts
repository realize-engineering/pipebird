import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.preprocess(Number, z.number()),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SECRET_KEY: z.string().min(128),
});

export const env = envSchema.parse(process.env);
