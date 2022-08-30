import express, {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import pg from "pg";

import { env } from "../lib/env.js";
import { ErrorApiSchema } from "../lib/handlers.js";
import { httpLogger, logger } from "../lib/logger.js";
import { CustomSnowflakeError } from "../lib/snowflake/client.js";
import { HttpStatusCode } from "../utils/http.js";
import { indexRouter } from "./routes/index.js";

const app = express();

app.disable("x-powered-by");
app.disable("etag");

app.use(express.json());
app.use(httpLogger);

app.use(
  async (req: Request, res: Response<ErrorApiSchema>, next: NextFunction) => {
    if (
      !req.headers.authorization ||
      !req.headers.authorization.split("Bearer ")[1] ||
      req.headers.authorization.split("Bearer ")[1] !== env.SECRET_KEY
    ) {
      return res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json({ code: "unauthorized" });
    }
    return next();
  },
);
app.use(indexRouter);

const errorHandler: ErrorRequestHandler = (
  err,
  _req: Request,
  res: Response<ErrorApiSchema>,
  next,
) => {
  if (err) {
    logger.error(err);
    const isDBError =
      err instanceof pg.DatabaseError || err instanceof CustomSnowflakeError;

    if (isDBError) {
      const message =
        err.message ?? "A database request could not be completed";
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ code: "database_error", message });
    }

    return res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ code: "unhandled_exception" });
  }
  return next();
};

app.use(errorHandler);

export { app };
