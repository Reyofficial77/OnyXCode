/**
 * Structured error taxonomy. Every error carries a stable code so CLI, TUI and
 * doctor can react differently without string matching.
 */
export type ErrorCode =
  | "E_USAGE"
  | "E_CONFIG_INVALID"
  | "E_CONFIG_NOT_FOUND"
  | "E_CREDENTIAL_MISSING"
  | "E_CREDENTIAL_INVALID"
  | "E_CREDENTIAL_STORE"
  | "E_PROVIDER_UNKNOWN"
  | "E_PROVIDER_UNSUPPORTED"
  | "E_MODEL_NOT_FOUND"
  | "E_ENDPOINT_INVALID"
  | "E_NETWORK"
  | "E_TIMEOUT"
  | "E_RATE_LIMIT"
  | "E_QUOTA"
  | "E_AUTH"
  | "E_BAD_RESPONSE"
  | "E_TOOL_NOT_FOUND"
  | "E_TOOL_INVALID_ARGS"
  | "E_TOOL_FAILED"
  | "E_PERMISSION_DENIED"
  | "E_PATH_OUTSIDE_WORKSPACE"
  | "E_PATH_SENSITIVE"
  | "E_FILE_NOT_FOUND"
  | "E_FILE_NOT_WRITABLE"
  | "E_SESSION_NOT_FOUND"
  | "E_SESSION_CORRUPT"
  | "E_TERMINAL_UNSUPPORTED"
  | "E_CANCELLED"
  | "E_STEP_LIMIT"
  | "E_INTERNAL";

const EXIT_CODE_BY_CODE: Partial<Record<ErrorCode, number>> = {
  E_USAGE: 2,
  E_CONFIG_INVALID: 3,
  E_CONFIG_NOT_FOUND: 3,
  E_CREDENTIAL_MISSING: 4,
  E_CREDENTIAL_INVALID: 4,
  E_CREDENTIAL_STORE: 4,
  E_PROVIDER_UNKNOWN: 5,
  E_PROVIDER_UNSUPPORTED: 5,
  E_MODEL_NOT_FOUND: 5,
  E_ENDPOINT_INVALID: 5,
  E_AUTH: 6,
  E_NETWORK: 7,
  E_TIMEOUT: 7,
  E_RATE_LIMIT: 8,
  E_QUOTA: 8,
  E_BAD_RESPONSE: 9,
  E_PERMISSION_DENIED: 10,
  E_CANCELLED: 130,
};

export class OnyxError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { hint?: string; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "OnyxError";
    this.code = code;
    if (options.hint !== undefined) this.hint = redactObject(options.hint) as string;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  get exitCode(): number {
    return EXIT_CODE_BY_CODE[this.code] ?? 1;
  }
}

export function isOnyxError(value: unknown): value is OnyxError {
  return value instanceof OnyxError;
}

/** Convert anything thrown into an OnyxError without leaking raw internals. */
export function toOnyxError(error: unknown, fallbackCode: ErrorCode = "E_INTERNAL"): OnyxError {
  if (isOnyxError(error)) return error;
  if (error instanceof Error) {
    return new OnyxError(fallbackCode, redactObject(error.message) as string, { cause: error });
  }
  return new OnyxError(fallbackCode, redactObject(String(error)) as string);
}

export function exitCodeFor(error: unknown): number {
  return isOnyxError(error) ? error.exitCode : 1;
}

// Lazy import avoids a cycle with the logger module.
function redactObject(value: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return redact(value);
}

let redactImpl: (value: unknown) => unknown = (v) => v;

/** Registered by utils/redact at module load to keep error formatting leak-free. */
export function registerRedactor(fn: (value: unknown) => unknown): void {
  redactImpl = fn;
}

function redact(value: unknown): unknown {
  return redactImpl(value);
}
