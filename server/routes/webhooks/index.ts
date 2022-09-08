import { Response, Router } from "express";
import { Prisma } from "@prisma/client";
import {
  ApiResponse,
  ErrorApiSchema,
  ListApiResponse,
} from "../../../lib/handlers.js";
import { db } from "../../../lib/db.js";
import { HttpStatusCode } from "../../../utils/http.js";
import { z } from "zod";
import { default as validator } from "validator";
import { id128 } from "../../../lib/id.js";

type WebhookResponse = Prisma.WebhookGetPayload<{
  select: {
    id: true;
    url: true;
  };
}>;

const webhookRouter = Router();

// List webhooks
webhookRouter.get("/", async (req, res: ListApiResponse<WebhookResponse>) => {
  const webhooks = await db.webhook.findMany({
    select: { id: true, url: true },
    orderBy: {
      createdAt: "desc",
    },
  });
  return res.status(HttpStatusCode.OK).json({ content: webhooks });
});

// Create webhook
webhookRouter.post(
  "/",
  async (
    req,
    res: ApiResponse<
      Prisma.WebhookGetPayload<{
        select: {
          id: true;
          url: true;
          secretKey: true;
        };
      }>
    >,
  ) => {
    const bodyParams = z
      .object({
        url: z
          .string()
          .refine(
            validator.isURL,
            "Url must be a well formatted url with protocol.",
          ),
      })
      .safeParse(req.body);
    if (!bodyParams.success) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        code: "body_validation_error",
        validationIssues: bodyParams.error.issues,
      });
    }
    const { url } = bodyParams.data;
    const webhook = await db.webhook.create({
      data: {
        url,
        secretKey: await id128("whk"),
      },
      select: {
        id: true,
        secretKey: true,
        url: true,
      },
    });
    return res.status(HttpStatusCode.CREATED).json(webhook);
  },
);

// Delete all webhook
webhookRouter.delete("/", async (req, res: Response<ErrorApiSchema>) => {
  await db.webhook.deleteMany({});
  return res.status(HttpStatusCode.NO_CONTENT).end();
});

export { webhookRouter };
