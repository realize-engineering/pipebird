import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

import { S3 } from "./s3.js";
import { env } from "../env.js";

const BUCKET = env.PROVISIONED_BUCKET_NAME;

export const uploadObject = async (
  contents: PutObjectCommand["input"]["Body"],
  bucket: string = BUCKET,
) => {
  const key = randomUUID();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: contents,
  });

  const uploadRes = await S3.send(command);

  return { result: uploadRes, key };
};
