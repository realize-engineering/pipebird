import "express-async-errors";
import { Router } from "express";
import { configurationRouter } from "./configurations/index.js";
import { destinationRouter } from "./destinations/index.js";
import { healthzRouter } from "./healthz.js";
import { sourceRouter } from "./sources/index.js";
import { viewRouter } from "./views/index.js";
import { transferRouter } from "./transfers/index.js";
import { webhookRouter } from "./webhooks/index.js";

const indexRouter = Router();

indexRouter.use("/healthz", healthzRouter);
indexRouter.use("/sources", sourceRouter);
indexRouter.use("/views", viewRouter);
indexRouter.use("/destinations", destinationRouter);
indexRouter.use("/configurations", configurationRouter);
indexRouter.use("/transfers", transferRouter);
indexRouter.use("/webhooks", webhookRouter);

export { indexRouter };
