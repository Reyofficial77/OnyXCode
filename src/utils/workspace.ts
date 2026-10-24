import fs from "node:fs";
import path from "node:path";

export interface ResolveOptions {
  /** Workspace root. */
  root: string;
  /** Extra roots explicitly allowed (from permissions config). */
  allowedRoots?: string[];
  /** Follow symlinks when resolving (default true). */
  followSymlinks?: boolean;
}

export interface ResolvedPath {
  /** Absolute, normalized path. */
  absolute: string;
  /** Path relative to workspace root, POSIX separators. */
  relative: string;
  /** True when the path is inside the workspace root. */
  insideWorkspace: boolean;
}

export class PathOutsideWorkspaceError extends Error {
  constructor(readonly requested: string, readonly root: string) {
    super(`Path is outside the workspace: ${requested}`);
    this.name = "PathOutsideWorkspaceError";
  }
}

function norm(p: string): string {
  // Windows and POSIX normalized comparison form.
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isInside(child: string, parent: string): boolean {
  const c = norm(child);
  const p = norm(parent);
  if (c === p) return true;
  const rel = path.relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Resolve a user/model supplied path against the workspace root and ensure it
 * stays inside. Handles `..`, absolute paths, and symlinks (by resolving the
 * real path of the longest existing ancestor).
 */
export function resolveWorkspacePath(input: string, options: ResolveOptions): ResolvedPath {
  const { root } = options;
  const absoluteInput = path.isAbsolute(input) ? input : path.resolve(root, input);
  const follow = options.followSymlinks !== false;
  const realBase = realpathLoose(root);
  const candidate = follow ? realpathLoose(absoluteInput) : path.resolve(absoluteInput);

  const roots = [realBase, ...(options.allowedRoots ?? []).map((r) => realpathLoose(r))];
  const inside = roots.some((r) => isInside(candidate, r));
  if (!inside) {
    throw new PathOutsideWorkspaceError(absoluteInput, root);
  }
  return {
    absolute: candidate,
    relative: path.relative(realBase, candidate).split(path.sep).join("/"),
    insideWorkspace: isInside(candidate, realBase),
  };
}

/**
 * Resolve symlinks for the longest existing prefix so that non-existent target
 * files (e.g. for write_file) still get their ancestor dirs canonicalized.
 */
export function realpathLoose(target: string): string {
  const resolved = path.resolve(target);
  let current = resolved;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/** Reject Windows reserved device names, control chars, and NUL bytes. */
export function validateFileName(name: string): string | undefined {
  if (/[\0<>:"|?*]/.test(name)) return "File name contains invalid characters";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) return "File name is a reserved device name";
  if (name.endsWith(" ") || name.endsWith(".")) return "File name must not end with space or dot";
  return undefined;
}

const SENSITIVE_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".npmrc",
  ".netrc",
  "_netrc",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "credentials.json",
  ".git-credentials",
  ".pypirc",
  ".htpasswd",
]);

/** Files that are never read automatically; require explicit approval. */
export function isSensitivePath(relativeOrAbsolute: string): boolean {
  const base = path.basename(relativeOrAbsolute).toLowerCase();
  if (SENSITIVE_BASENAMES.has(base)) return true;
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base)) return true;
  const segments = relativeOrAbsolute.split(/[\\/]/);
  if (segments.includes(".ssh") || segments.includes(".gnupg") || segments.includes(".aws")) return true;
  return false;
}

/** Normalize to posix relative path for display/storage. */
export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
