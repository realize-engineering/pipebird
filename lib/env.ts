import "dotenv/config";
import { cpus } from "os";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.preprocess(Number, z.number()),
  DATABASE_URL: z.string().min(1),
  SECRET_KEY: z.string().min(128),
  S3_USER_ACCESS_ID: z.string(),
  S3_USER_SECRET_KEY: z.string(),
  PROVISIONED_BUCKET_NAME: z.string(),
  AWS_REGION: z.string(),
  ENCRYPTION_KEY: z.string().min(128),
  KMS_KEY_ID: z.string().min(1),
  LICENSE_KEY: z
    .string()
    .min(67)
    .default(
      "lk_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  TEMPORAL_ADDRESS: z.string().min(1),
  TEMPORAL_CLIENT_CERT_PATH: z.string().optional(),
  TEMPORAL_CLIENT_KEY_PATH: z.string().optional(),
  NUM_WORKERS: z
    .preprocess(Number, z.number().int().positive())
    .default(cpus().length),
  CONTROL_PLANE_URL: z.string().min(1).default("https://my.pipebird.com"),
});

export const env = envSchema.parse(process.env);
