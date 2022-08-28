import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

import { S3 } from "./s3.js";
import { env } from "../env.js";
import { Upload } from "@aws-sdk/lib-storage";

const BUCKET = env.PROVISIONED_BUCKET_NAME;

export const uploadObject = async ({
  contents,
  pathPrefix,
  extension,
  bucket = BUCKET,
}: {
  contents: PutObjectCommand["input"]["Body"];
  pathPrefix?: string;
  extension?: string;
  bucket?: string;
}) => {
  const key = randomUUID();
  const upload = new Upload({
    client: S3,
    params: {
      Bucket: bucket,
      Key: `${pathPrefix ? `${pathPrefix}/${key}` : key}${
        extension ? `.${extension}` : ""
      }`,
      Body: contents,
    },
  });

  return { result: await upload.done(), key };
};
