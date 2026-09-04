// Structured, deterministic error codes for the risk calculation domain.
// The engine never throws for expected bad input and never lets NaN/Infinity
// reach a caller — invalid input always resolves to one or more of these.
export type RiskCalculationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_ACCOUNT_SIZE"
  | "INVALID_RISK_PERCENT"
  | "INVALID_PRICE"
  | "INVALID_STOP"
  | "INVALID_TAKE_PROFIT"
  | "INVALID_INSTRUMENT"
  | "INVALID_POSITION_SIZE"
  | "INVALID_COSTS";

export interface RiskValidationError {
  code: RiskCalculationErrorCode;
  field: string;
  message: string;
}

export function riskError(code: RiskCalculationErrorCode, field: string, message: string): RiskValidationError {
  return { code, field, message };
}
