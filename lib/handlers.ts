import { Response } from "express";
import { z } from "zod";

export type ApiResponse<T> = Response<ErrorApiSchema | T>;
export type ListApiResponse<T> = Response<ErrorApiSchema | { content: T[] }>;
const errorCodeSchema = z.enum([
  "unauthorized",
  "body_validation_error",
  "destination_not_currently_supported",
  "configuration_id_not_found",
  "destination_id_not_found",
  "source_id_not_found",
  "unhandled_exception",
  "internal_server_error",
  "resource_already_exists",
  "query_validation_error",
  "params_validation_error",
]);

export type ErrorApiSchema = {
  code: z.infer<typeof errorCodeSchema>;
  validationIssues?: z.ZodIssue[];
  message?: string;
};
