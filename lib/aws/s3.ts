import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../env.js";

const ACCESS_KEY = env.S3_USER_ACCESS_ID;
const SECRET_KEY = env.S3_USER_SECRET_KEY;
const REGION = env.AWS_REGION;

export const S3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});
