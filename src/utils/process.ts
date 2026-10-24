import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OnyxError } from "./errors.js";

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  /** stdin content, if any. */
  input?: string;
  shell?: "auto" | "none";
}

export interface RunResult {
  command: string;
  shell: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
}

/** Pick a shell that exists on this machine. */
export function pickShell(): { file: string; args: (cmd: string) => string[]; kind: string } {
  if (process.platform === "win32") {
    const pwsh = findExecutable("pwsh.exe") ?? findExecutable("pwsh");
    if (pwsh) return { file: pwsh, args: (cmd) => ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", cmd], kind: "pwsh" };
    const powershell = findExecutable("powershell.exe") ?? findExecutable("powershell");
    if (powershell) {
      return {
        file: powershell,
        args: (cmd) => ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", cmd],
        kind: "powershell",
      };
    }
    const comspec = process.env.ComSpec || "cmd.exe";
    return { file: comspec, args: (cmd) => ["/d", "/s", "/c", cmd], kind: "cmd" };
  }
  const shell = process.env.SHELL || "/bin/sh";
  return { file: shell, args: (cmd) => ["-lc", cmd], kind: "sh" };
}

function findExecutable(name: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return undefined;
}

/**
 * Run a command with hard timeout, output cap, and cancellation that also kills
 * the whole process tree.
 */
export function runProcess(command: string, options: RunOptions): Promise<RunResult> {
  const {
    cwd,
    timeoutMs = 120_000,
    maxOutputBytes = 200_000,
    signal,
    input,
  } = options;

  const shellInfo = pickShell();
  const start = Date.now();

  return new Promise<RunResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(shellInfo.file, shellInfo.args(command), {
        cwd,
        env: { ...process.env, ...options.env, ONYXCODE: "1", GIT_TERMINAL_PROMPT: "0" },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (err) {
      reject(new OnyxError("E_TOOL_FAILED", `Failed to spawn shell (${shellInfo.kind})`, { cause: err }));
      return;
    }

    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const collect = (chunk: Buffer, which: "out" | "err") => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        if (!truncated) {
          const keep = Math.max(0, maxOutputBytes - (which === "out" ? stdout.length : stderr.length));
          if (which === "out") stdout += chunk.subarray(0, keep).toString("utf8");
          else stderr += chunk.subarray(0, keep).toString("utf8");
          truncated = true;
        }
        return;
      }
      if (which === "out") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };

    child.stdout?.on("data", (c: Buffer) => collect(c, "out"));
    child.stderr?.on("data", (c: Buffer) => collect(c, "err"));
    if (input !== undefined) {
      child.stdin?.end(input);
    } else {
      child.stdin?.end();
    }

    const killTree = () => {
      if (child.pid === undefined) return;
      if (process.platform === "win32") {
        try {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };

    const finish = (exitCode: number | null, sig: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({
        command,
        shell: shellInfo.kind,
        exitCode,
        signal: sig,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        truncated,
        timedOut,
        cancelled,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const onAbort = () => {
      cancelled = true;
      killTree();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new OnyxError("E_TOOL_FAILED", `Command failed to start: ${err.message}`, { cause: err }));
    });
    child.on("close", (code, sig) => finish(code, sig));
  });
}

/** Cross-platform environment summary used by doctor. */
export function environmentSummary() {
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    node: process.version,
    cpus: os.cpus().length,
    shell: pickShell().kind,
    cwd: process.cwd(),
    home: os.homedir(),
  };
}
