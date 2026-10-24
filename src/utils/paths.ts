import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AppPaths {
  home: string;
  configDir: string;
  configFile: string;
  credentialsFile: string;
  sessionsDir: string;
  logsDir: string;
  cacheDir: string;
}

const ENV_HOME = "ONYXCODE_HOME";

/**
 * Resolve all local storage paths. `ONYXCODE_HOME` overrides the base directory
 * (used by tests and by users who want portable installs).
 */
export function getAppPaths(env: NodeJS.ProcessEnv = process.env): AppPaths {
  const base = env[ENV_HOME]?.trim() || path.join(os.homedir(), ".onyxcode");
  return {
    home: base,
    configDir: base,
    configFile: path.join(base, "config.json"),
    credentialsFile: path.join(base, "credentials.json"),
    sessionsDir: path.join(base, "sessions"),
    logsDir: path.join(base, "logs"),
    cacheDir: path.join(base, "cache"),
  };
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function dirExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Write a file atomically with restrictive permissions where supported. */
export function writeFilePrivate(file: string, data: string): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600, encoding: "utf8" });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows / exotic FS: ignore.
  }
}

export function readJsonSafe<T>(file: string): T | undefined {
  if (!fileExists(file)) return undefined;
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Heuristic permission check for credential files (POSIX only; Windows has ACLs). */
export function isFilePermissionTight(file: string): boolean | undefined {
  if (process.platform === "win32") return undefined;
  try {
    const st = fs.statSync(file);
    const mode = st.mode & 0o777;
    return (mode & 0o077) === 0;
  } catch {
    return undefined;
  }
}
