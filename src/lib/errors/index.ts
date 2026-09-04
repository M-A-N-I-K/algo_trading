import { logger } from "@/lib/logger";

export type AppErrorCode =
  | "INVALID_INPUT"
  | "INSTRUMENT_NOT_FOUND"
  | "INSUFFICIENT_DATA"
  | "INVALID_POSITION_SIZE"
  | "INVALID_PRICE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  INVALID_INPUT: 400,
  INSTRUMENT_NOT_FOUND: 404,
  INSUFFICIENT_DATA: 422,
  INVALID_POSITION_SIZE: 422,
  INVALID_PRICE: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DATABASE_ERROR: 500,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  code: AppErrorCode;
  status: number;
  details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function appError(code: AppErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, message, details);
}

export interface ErrorResponseBody {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

// Converts any thrown value into a safe, user-facing error envelope. Known
// AppErrors pass their message through (already written to be user-safe);
// anything else is logged server-side and reduced to a generic message —
// raw DB/driver errors are never sent to the client.
export function toErrorResponse(err: unknown): { body: ErrorResponseBody; status: number } {
  if (err instanceof AppError) {
    return { body: { code: err.code, message: err.message, details: err.details }, status: err.status };
  }
  logger.error("Unhandled server error", { error: err instanceof Error ? err.message : String(err) });
  return {
    body: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    status: 500,
  };
}
