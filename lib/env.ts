import "dotenv/config";
import { default as validator } from "validator";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.preprocess(Number, z.number()),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z
    .string()
    .refine(
      validator.isNumeric,
      "Environment variable REDIS_PORT must be a valid int",
    )
    .transform((s) => parseInt(s)),
  SECRET_KEY: z.string().min(128),
  S3_USER_ACCESS_ID: z.string(),
  PUBLIC_KEY: z.string().min(67),
  S3_USER_SECRET_KEY: z.string(),
  PROVISIONED_BUCKET_NAME: z.string(),
  AWS_REGION: z.string(),
  ENCRYPTION_KEY: z.string().min(128),
  KMS_KEY_ID: z.string().min(1),
  LICENSE_KEY: z.string().min(67),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export const env = envSchema.parse(process.env);
