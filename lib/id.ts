import { customAlphabet } from "nanoid/async";
import crypto from "crypto";

const generate = async (prefix: string, length: number) =>
  `${prefix}_${await customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    length,
  )()}`;

export const id32 = (prefix: string) => generate(prefix, 32);
export const id128 = (prefix: string) => generate(prefix, 128);

export const hashId = ({
  prefix,
  data,
  encoding = "utf-8",
}: {
  prefix: string;
  data: string;
  encoding?: BufferEncoding;
}) =>
  `${prefix}_${crypto
    .createHash("sha256")
    .update(Buffer.from(data, encoding))
    .digest("hex")}`;
