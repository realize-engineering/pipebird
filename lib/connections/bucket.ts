import { Bucket, Storage } from "@google-cloud/storage";
import { logger } from "../logger.js";
import { BigQueryServiceAccount } from "./index.js";

export const useBucketConnection = async ({
  projectId,
  bucketName,
  serviceAccount,
}: {
  projectId: string;
  bucketName: string;
  serviceAccount: BigQueryServiceAccount;
}): Promise<
  | {
      error: true;
      code: "not_implemented" | "connection_refused";
      message: string;
    }
  | {
      error: false;
      code: "connection_reachable";
      bucket: Bucket;
    }
> => {
  try {
    // For now, we will only support connections to user provided GCS buckets only
    const storage = new Storage({ projectId, credentials: serviceAccount });

    const [exists] = await storage.bucket(bucketName).exists();
    if (!exists) {
      throw new Error("Bucket does not exist");
    }

    return {
      error: false,
      code: "connection_reachable",
      bucket: storage.bucket(bucketName),
    };
  } catch (error) {
    logger.error({ bucketConnectionError: error });
    const message =
      error instanceof Error
        ? error.message
        : `The bucket ${bucketName} could not be reached`;
    return {
      error: true,
      code: "connection_refused",
      message,
    };
  }
};
