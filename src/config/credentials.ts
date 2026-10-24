import fs from "node:fs";
import { z } from "zod";
import { OnyxError } from "../utils/errors.js";
import { getAppPaths, isFilePermissionTight, readJsonSafe, writeFilePrivate, type AppPaths } from "../utils/paths.js";

/**
 * Credentials file layout (schema v1):
 *   { "version": 1, "credentials": { "<provider>": { "apiKey": "...", "updatedAt": "..." } } }
 *
 * Stored as a JSON file with mode 0600. There is no OS keychain integration yet;
 * this is documented as a limitation (see docs/SECURITY.md).
 */
const CredentialsFileSchema = z.object({
  version: z.literal(1),
  credentials: z.record(
    z.string(),
    z.object({ apiKey: z.string().min(1), updatedAt: z.string(), label: z.string().optional() }),
  ),
});

export type CredentialsFile = z.infer<typeof CredentialsFileSchema>;

export interface CredentialStoreOptions {
  paths?: AppPaths;
  /** When true, nothing is persisted; useful for `--ephemeral` and tests. */
  ephemeral?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class CredentialStore {
  private cache: Map<string, string> = new Map();
  private loaded = false;
  private readonly paths: AppPaths;

  constructor(private readonly options: CredentialStoreOptions = {}) {
    this.paths = options.paths ?? getAppPaths(options.env);
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (this.options.ephemeral) return;
    const raw = readJsonSafe<unknown>(this.paths.credentialsFile);
    if (raw === undefined) return;
    const parsed = CredentialsFileSchema.safeParse(raw);
    if (!parsed.success) return; // corrupt file: ignore and allow overwrite
    for (const [provider, entry] of Object.entries(parsed.data.credentials)) {
      this.cache.set(provider, entry.apiKey);
    }
  }

  get(provider: string): string | undefined {
    if (this.options.ephemeral) return this.cache.get(provider);
    this.load();
    const fromFile = this.cache.get(provider);
    if (fromFile) return fromFile;
    // Fall back to an env var convention: ONYXCODE_API_KEY_<PROVIDER>
    const envKey = `ONYXCODE_API_KEY_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    return process.env[envKey]?.trim() || undefined;
  }

  /** Set in-memory only, without writing to disk. */
  setEphemeral(provider: string, apiKey: string): void {
    this.cache.set(provider, apiKey);
  }

  set(provider: string, apiKey: string, label?: string): void {
    const trimmed = apiKey.trim();
    if (!trimmed) throw new OnyxError("E_CREDENTIAL_INVALID", "API key must not be empty");
    this.cache.set(provider, trimmed);
    if (this.options.ephemeral) return;
    this.persist(provider, trimmed, label);
  }

  delete(provider: string): boolean {
    const existed = this.cache.delete(provider);
    if (this.options.ephemeral) return existed;
    const file = this.readFile();
    if (file && file.credentials[provider]) {
      delete file.credentials[provider];
      this.writeFile(file);
      return true;
    }
    return existed;
  }

  listProviders(): string[] {
    this.load();
    const set = new Set(this.cache.keys());
    const file = this.readFile();
    if (file) for (const k of Object.keys(file.credentials)) set.add(k);
    return [...set].sort();
  }

  /** Warning when the credential file is world/group readable (POSIX). */
  permissionWarning(): string | undefined {
    if (this.options.ephemeral) return undefined;
    const tight = isFilePermissionTight(this.paths.credentialsFile);
    if (tight === false) {
      return `${this.paths.credentialsFile} is readable by other users; run: chmod 600 ${this.paths.credentialsFile}`;
    }
    return undefined;
  }

  private readFile(): CredentialsFile | undefined {
    const raw = readJsonSafe<unknown>(this.paths.credentialsFile);
    if (raw === undefined) return undefined;
    const parsed = CredentialsFileSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }

  private writeFile(file: CredentialsFile): void {
    try {
      writeFilePrivate(this.paths.credentialsFile, `${JSON.stringify(file, null, 2)}\n`);
    } catch (err) {
      throw new OnyxError("E_CREDENTIAL_STORE", "Unable to write credentials file", { cause: err });
    }
  }

  private persist(provider: string, apiKey: string, label?: string): void {
    const file = this.readFile() ?? { version: 1 as const, credentials: {} };
    file.credentials[provider] = {
      apiKey,
      updatedAt: new Date().toISOString(),
      ...(label ? { label } : {}),
    };
    this.writeFile(file);
  }
}

/** Resolve a key for a provider using env → credential store, without persisting. */
export function resolveApiKey(
  provider: string,
  store: CredentialStore,
  apiKeyEnv?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (apiKeyEnv) {
    const v = env[apiKeyEnv]?.trim();
    if (v) return v;
  }
  return store.get(provider);
}

export function credentialsFileExists(paths = getAppPaths()): boolean {
  return fs.existsSync(paths.credentialsFile);
}
