import { z } from "zod";

export const PermissionModeSchema = z.enum(["read-only", "confirm-risky", "allow-all"]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const ThemeSchema = z.enum(["auto", "dark", "light", "none"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const ProviderIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, "Provider id must be alphanumeric with . _ -");

export const ProviderConfigSchema = z.object({
  /** Adapter kind used to talk to the API. */
  type: z.enum(["openai", "anthropic", "gemini", "groq", "openai-compatible", "ollama"]),
  /** Override base URL. */
  baseUrl: z.string().url().optional(),
  /** Env var name that holds the key (avoid storing keys in config). */
  apiKeyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
  /** Published model ids (may be stale; `models list` refreshes). */
  models: z.array(z.string().min(1)).default([]),
  defaultModel: z.string().min(1).optional(),
  /** Extra headers sent to the endpoint (no secrets). */
  headers: z.record(z.string(), z.string()).optional(),
  /** Marks endpoints the user explicitly configured. */
  custom: z.boolean().optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const PermissionsSchema = z.object({
  /** Extra directories (absolute or relative to project) allowed for file tools. */
  allowReadRoots: z.array(z.string()).default([]),
  allowWriteRoots: z.array(z.string()).default([]),
  /** Command prefixes that never require confirmation in confirm-risky mode. */
  allowCommands: z.array(z.string()).default([]),
  /** Command patterns that are always denied. */
  denyCommands: z.array(z.string()).default([]),
});

export const ConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
  theme: ThemeSchema.default("auto"),
  stream: z.boolean().default(true),
  permissionMode: PermissionModeSchema.default("confirm-risky"),
  maxAgentSteps: z.number().int().min(1).max(200).default(30),
  requestTimeoutMs: z.number().int().min(5_000).max(1_800_000).default(120_000),
  maxToolOutputBytes: z.number().int().min(1_024).max(5_000_000).default(200_000),
  toolTimeoutMs: z.number().int().min(1_000).max(1_800_000).default(120_000),
  commandTimeoutMs: z.number().int().min(1_000).max(1_800_000).default(180_000),
  persistSessions: z.boolean().default(true),
  maxContextBytes: z.number().int().min(1_000).max(10_000_000).default(400_000),
  retries: z.number().int().min(0).max(5).default(1),
  color: z.boolean().default(true),
  /** Use openTUI renderer when available. */
  experimentalTui: z.boolean().default(false),
  telemetry: z.boolean().default(false),
  providers: z.record(ProviderIdSchema, ProviderConfigSchema).default({}),
  permissions: PermissionsSchema.default({
    allowReadRoots: [],
    allowWriteRoots: [],
    allowCommands: [],
    denyCommands: [],
  }),
});
export type Config = z.infer<typeof ConfigSchema>;

export type ConfigKey = keyof Config;

/** Full config with all defaults applied. */
export function withDefaults(partial: unknown): Config {
  return ConfigSchema.parse(partial ?? {});
}
