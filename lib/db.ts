import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();
export const pendingTransferTypes = ["PENDING", "STARTED"] as const;
