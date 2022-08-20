import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../env.js";

const {
  S3_USER_ACCESS_ID: accessKeyId,
  S3_USER_SECRET_KEY: secretAccessKey,
  AWS_REGION: region,
} = env;

export const S3 = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
