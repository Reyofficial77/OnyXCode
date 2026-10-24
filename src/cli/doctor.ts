import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CredentialStore } from "../config/credentials.js";
import { loadConfig } from "../config/loader.js";
import { BUILTIN_PROVIDERS } from "../providers/builtins.js";
import { getAppPaths } from "../utils/paths.js";
import { environmentSummary } from "../utils/process.js";
import { painter, printTable } from "./output.js";

export interface CheckItem {
  name: string;
  ok: boolean;
  message: string;
  hint?: string;
}

export async function runDoctor(cwd: string): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const paths = getAppPaths();
  const env = environmentSummary();

  // 1. Node.js version
  const major = parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  items.push({
    name: "Node.js",
    ok: major >= 20,
    message: `v${process.versions.node} (${env.platform} ${env.arch})`,
    hint: major < 20 ? "Upgrade Node.js to >= 20.11" : undefined,
  });

  // 2. Shell
  items.push({
    name: "Shell",
    ok: true,
    message: `${env.shell} (ready to execute tools)`,
  });

  // 3. Git
  const gitMarker = path.join(cwd, ".git");
  const isGit = fs.existsSync(gitMarker);
  items.push({
    name: "Git repo",
    ok: isGit,
    message: isGit ? "Workspace is inside a git repo" : "Workspace is not a git repo (git tools disabled)",
    hint: !isGit ? "Run `git init` to enable git_status, git_diff, and git_log" : undefined,
  });

  // 4. Config files
  let loaded;
  try {
    loaded = loadConfig({ cwd });
    items.push({
      name: "Config",
      ok: true,
      message: `${loaded.sources.length} sources loaded (mode: ${loaded.config.permissionMode})`,
    });
    for (const w of loaded.warnings) {
      items.push({ name: "Config warning", ok: false, message: w });
    }
  } catch (err) {
    items.push({
      name: "Config",
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      hint: "Inspect ~/.onyxcode/config.json or .onyxcode/config.json",
    });
  }

  // 5. Credentials file & permissions
  const store = new CredentialStore({ paths });
  const permWarning = store.permissionWarning();
  if (permWarning) {
    items.push({ name: "Credentials permission", ok: false, message: permWarning });
  } else {
    items.push({
      name: "Credentials store",
      ok: true,
      message: `${paths.credentialsFile} (${store.listProviders().length} stored)`,
    });
  }

  // 6. Available providers (never show keys)
  const configuredProviders: string[] = [];
  for (const b of Object.values(BUILTIN_PROVIDERS)) {
    const hasEnv = Boolean(process.env[b.apiKeyEnv]);
    const hasStore = Boolean(store.get(b.id));
    if (!b.requiresKey) {
      configuredProviders.push(`${b.name} (local)`);
    } else if (hasEnv) {
      configuredProviders.push(`${b.name} (env: ${b.apiKeyEnv})`);
    } else if (hasStore) {
      configuredProviders.push(`${b.name} (stored)`);
    }
  }
  items.push({
    name: "Providers with keys",
    ok: configuredProviders.length > 0,
    message: configuredProviders.length ? configuredProviders.join(", ") : "No providers configured",
    hint: configuredProviders.length === 0 ? "Run `onyxcode auth login` or set OPENAI_API_KEY / ANTHROPIC_API_KEY" : undefined,
  });

  // 7. Storage directories
  const checkDirs: Array<[string, string]> = [
    ["Sessions dir", paths.sessionsDir],
    ["Logs dir", paths.logsDir],
  ];
  for (const [label, dir] of checkDirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      items.push({ name: label, ok: true, message: `${dir} (writable)` });
    } catch (err) {
      items.push({ name: label, ok: false, message: `${dir} is not writable: ${String(err)}` });
    }
  }

  // 8. OpenTUI native module status
  let tuiStatus = "unavailable (readline fallback active)";
  try {
    // Dynamic import to avoid hard crash when native module isn't built for this platform.
    // @ts-expect-error Optional dependency might not have types installed
    await import("@opentui/core");
    tuiStatus = "available (native renderer ready)";
  } catch {
    // expected if optional dep not installed or on unsupported arch
  }
  items.push({
    name: "OpenTUI core",
    ok: true,
    message: tuiStatus,
  });

  return items;
}

export async function printDoctorReport(cwd: string): Promise<boolean> {
  const p = painter();
  const items = await runDoctor(cwd);
  const rows = items.map((it) => {
    const sym = it.ok ? p.style("✔", "bold") : p.style("✖", "bold");
    const label = it.ok ? it.name : p.style(it.name, "bold");
    const hint = it.hint ? ` (${p.style(it.hint, "dim")})` : "";
    return [sym, label, `${it.message}${hint}`];
  });
  process.stdout.write(`OnyxCode Doctor\n\n`);
  process.stdout.write(`${printTable(rows)}\n\n`);
  const failures = items.filter((i) => !i.ok);
  if (failures.length) {
    process.stdout.write(`${p.style(`${failures.length} check(s) need attention.`, "bold")}\n`);
    return false;
  }
  process.stdout.write(`${p.style("All checks passed.", "bold")}\n`);
  return true;
}
