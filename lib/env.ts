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
});

export const env = envSchema.parse(process.env);
