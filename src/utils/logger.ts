import { redact, redactString } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LogRecord {
  time: string;
  level: Exclude<LogLevel, "silent">;
  scope: string;
  message: string;
  data?: unknown;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  child(scope: string): Logger;
  level: LogLevel;
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  scope?: string;
  sink?: LogSink;
  /** Mirror records to a file (JSONL). Must be safe & already redacted. */
  fileSink?: (line: string) => void;
}

/** Console sink that writes to stderr so it never corrupts TUI/stdout piping. */
export const stderrSink: LogSink = (record) => {
  const data = record.data === undefined ? "" : ` ${safeJson(record.data)}`;
  process.stderr.write(`[${record.level}] ${record.scope}: ${redactString(record.message)}${data}\n`);
};

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? "warn";
  const scope = options.scope ?? "onyx";
  const sink = options.sink ?? stderrSink;

  const emit = (lvl: Exclude<LogLevel, "silent">, message: string, data?: unknown) => {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return;
    const record: LogRecord = {
      time: new Date().toISOString(),
      level: lvl,
      scope,
      message: redactString(message),
      ...(data === undefined ? {} : { data: redact(data) }),
    };
    sink(record);
    options.fileSink?.(safeJson(record));
  };

  const logger: Logger = {
    level,
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
    child: (sub: string) => createLogger({ ...options, level, scope: `${scope}:${sub}` }),
  };
  return logger;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(redact(value));
  } catch {
    return '"[unserializable]"';
  }
}

export const nullLogger: Logger = createLogger({ level: "silent", sink: () => {} });
