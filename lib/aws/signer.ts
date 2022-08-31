import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { S3 } from "./s3.js";
import { env } from "../env.js";

const BUCKET = env.PROVISIONED_BUCKET_NAME;
const DAY_IN_SECONDS = 86400;

export const getPresignedURL = async ({
  key,
  extension,
  bucket = BUCKET,
  expiresIn = DAY_IN_SECONDS,
}: {
  key: string;
  extension?: string;
  bucket?: string;
  expiresIn?: number;
}) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: `${key}.${extension}`,
  });

  const signedUrl = await getSignedUrl(S3, command, {
    expiresIn,
  });

  return signedUrl;
};
