import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { S3 } from "./s3.js";
import { env } from "../env.js";

const BUCKET = env.PROVISIONED_BUCKET_NAME;

export const getPresignedURL = async (key: string, bucket: string = BUCKET) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const signedUrl = await getSignedUrl(S3, command, {
    expiresIn: 3600,
  });

  return signedUrl;
};
