import fs from "node:fs";
import path from "node:path";
import { OnyxError } from "../utils/errors.js";
import { getAppPaths, readJsonSafe, writeFilePrivate, fileExists, type AppPaths } from "../utils/paths.js";
import { ConfigSchema, type Config } from "./schema.js";

export const PROJECT_CONFIG_DIR = ".onyxcode";
export const PROJECT_CONFIG_FILE = "config.json";

export interface LoadConfigOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  paths?: AppPaths;
  /** CLI overrides win over everything. */
  overrides?: Partial<Config>;
}

export interface LoadedConfig {
  config: Config;
  sources: string[];
  projectFile?: string;
  globalFile: string;
  warnings: string[];
}

/** Map environment variables onto config keys. */
export function envOverrides(env: NodeJS.ProcessEnv): Partial<Config> {
  const out: Partial<Config> = {};
  const pick = (key: string) => env[key]?.trim();
  const provider = pick("ONYXCODE_PROVIDER");
  if (provider) out.defaultProvider = provider;
  const model = pick("ONYXCODE_MODEL");
  if (model) out.defaultModel = model;
  const mode = pick("ONYXCODE_PERMISSION_MODE");
  if (mode && ["read-only", "confirm-risky", "allow-all"].includes(mode)) {
    out.permissionMode = mode as Config["permissionMode"];
  }
  const theme = pick("ONYXCODE_THEME");
  if (theme && ["auto", "dark", "light", "none"].includes(theme)) out.theme = theme as Config["theme"];
  if (pick("ONYXCODE_PERSIST_SESSIONS") === "0") out.persistSessions = false;
  if (pick("NO_COLOR") !== undefined) out.color = false;
  const steps = pick("ONYXCODE_MAX_STEPS");
  if (steps && /^\d+$/.test(steps)) out.maxAgentSteps = Number(steps);
  const timeout = pick("ONYXCODE_REQUEST_TIMEOUT_MS");
  if (timeout && /^\d+$/.test(timeout)) out.requestTimeoutMs = Number(timeout);
  const baseUrl = pick("ONYXCODE_BASE_URL");
  if (baseUrl || pick("ONYXCODE_API_KEY")) {
    const id = provider ?? "openai-compatible";
    out.providers = {
      [id]: {
        type: (pick("ONYXCODE_PROVIDER_TYPE") as "openai-compatible") ?? "openai-compatible",
        ...(baseUrl ? { baseUrl } : {}),
        apiKeyEnv: "ONYXCODE_API_KEY",
        models: model ? [model] : [],
        ...(model ? { defaultModel: model } : {}),
      },
    };
  }
  return out;
}

export function findProjectConfigDir(cwd: string, stopAt?: string): string | undefined {
  let dir = path.resolve(cwd);
  const stop = stopAt ? path.resolve(stopAt) : path.parse(dir).root;
  for (;;) {
    const candidate = path.join(dir, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
    if (fileExists(candidate)) return dir;
    const gitMarker = path.join(dir, ".git");
    if (fs.existsSync(gitMarker) && dir === path.resolve(cwd)) {
      // Prefer nearest project config; keep walking up to repo root.
    }
    if (dir === stop) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Deep-merge plain objects; arrays replaced (not concatenated). */
export function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    const existing = out[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

function parseConfigFile(file: string, warnings: string[]): Record<string, unknown> {
  const raw = readJsonSafe<unknown>(file);
  if (raw === undefined) {
    warnings.push(`Config file is unreadable or invalid JSON: ${file}`);
    return {};
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    warnings.push(`Config file must contain a JSON object: ${file}`);
    return {};
  }
  return raw as Record<string, unknown>;
}

/**
 * Priority (highest first): CLI overrides > env vars > project config > global config > defaults.
 */
export function loadConfig(options: LoadConfigOptions): LoadedConfig {
  const env = options.env ?? process.env;
  const paths = options.paths ?? getAppPaths(env);
  const warnings: string[] = [];
  const sources: string[] = [];

  let merged: Record<string, unknown> = {};

  if (fileExists(paths.configFile)) {
    merged = deepMerge(merged, parseConfigFile(paths.configFile, warnings));
    sources.push(paths.configFile);
  }

  const projectDir = findProjectConfigDir(options.cwd);
  const projectFile = projectDir ? path.join(projectDir, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE) : undefined;
  if (projectFile) {
    const project = parseConfigFile(projectFile, warnings);
    // Project config cannot silently widen permissions to allow-all.
    if (project.permissionMode === "allow-all" && merged.permissionMode !== "allow-all") {
      warnings.push(`Project config requested permissionMode=allow-all; ignored for safety (${projectFile})`);
      delete project.permissionMode;
    }
    merged = deepMerge(merged, project);
    sources.push(projectFile);
  }

  merged = deepMerge(merged, envOverrides(env) as Record<string, unknown>);
  if (options.overrides) merged = deepMerge(merged, options.overrides as Record<string, unknown>);

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new OnyxError("E_CONFIG_INVALID", `Invalid configuration: ${issues}`, {
      hint: "Run `onyxcode doctor` or fix the config file.",
      details: { issues: parsed.error.issues },
    });
  }
  return {
    config: parsed.data,
    sources,
    globalFile: paths.configFile,
    ...(projectFile ? { projectFile } : {}),
    warnings,
  };
}

/** Write the global config with schema validation. */
export function saveGlobalConfig(config: Config, paths = getAppPaths()): void {
  const validated = ConfigSchema.parse(config);
  writeFilePrivate(paths.configFile, `${JSON.stringify(validated, null, 2)}\n`);
}

/** Get/set dotted config keys for `onyxcode config`. */
export function getConfigValue(config: Config, dotted: string): unknown {
  let cur: unknown = config;
  for (const part of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setConfigValue(config: Config, dotted: string, rawValue: string): Config {
  const clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const parts = dotted.split(".");
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (cur[key] === undefined || typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  cur[last] = coerceValue(rawValue);
  const parsed = ConfigSchema.safeParse(clone);
  if (!parsed.success) {
    throw new OnyxError(
      "E_CONFIG_INVALID",
      `Invalid value for ${dotted}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return parsed.data;
}

export function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw);
  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}
