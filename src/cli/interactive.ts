import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/loader.js";
import { CredentialStore } from "../config/credentials.js";
import { ProviderRegistry } from "../providers/registry.js";
import { createBuiltinToolRegistry } from "../tools/index.js";
import { CheckpointManager } from "../tools/checkpoint.js";
import { PermissionEngine } from "../permissions/policy.js";
import { TerminalApprovalPrompt } from "./approval-prompt.js";
import { runAgentLoop } from "../agent/loop.js";
import { buildSystemPrompt } from "../context/system-prompt.js";
import { textMessage, type ChatMessage } from "../providers/types.js";
import { SessionStore } from "../sessions/store.js";
import { renderBanner } from "../tui/banner.js";
import { ReadlineRepl } from "../tui/readline-fallback.js";
import { tryCreateOpenTui } from "../tui/opentui.js";
import { handleSlashCommand, COMMANDS, type CommandContext } from "../commands/slash.js";
import { painter, printError } from "./output.js";
import type { PermissionMode } from "../config/schema.js";

export interface InteractiveSessionOptions {
  cwd: string;
  plain?: boolean;
  providerOverride?: string;
  modelOverride?: string;
  modeOverride?: string;
}

export async function runInteractiveSession(options: InteractiveSessionOptions): Promise<void> {
  const cwd = path.resolve(options.cwd);
  const loaded = loadConfig({ cwd });
  const store = new CredentialStore();
  const registry = new ProviderRegistry(
    { getApiKey: (p, env) => store.get(p) ?? (env ? process.env[env] : undefined) },
    loaded.config,
  );

  let providerId = options.providerOverride ?? loaded.config.defaultProvider ?? registry.defaultProviderId() ?? "openai";
  let model = options.modelOverride ?? loaded.config.defaultModel ?? "gpt-4.1-mini";
  let currentMode: PermissionMode = (options.modeOverride as PermissionMode) ?? loaded.config.permissionMode;

  const tools = createBuiltinToolRegistry();
  const checkpoints = new CheckpointManager();
  const p = painter();

  const terminalPrompt = new TerminalApprovalPrompt(p);
  const permissions = new PermissionEngine(currentMode, { prompt: terminalPrompt });

  const sessionStore = new SessionStore();
  const sessionId = randomUUID().slice(0, 8);
  sessionStore.create({
    id: sessionId,
    provider: providerId,
    model,
    workspaceRoot: cwd,
  });

  const isGit = fs.existsSync(path.join(cwd, ".git"));
  const sysPrompt = buildSystemPrompt({
    workspaceRoot: cwd,
    isGit,
    environment: `${process.platform}-${process.arch}`,
  });

  let history: ChatMessage[] = [textMessage("system", sysPrompt)];

  const cmdContext: CommandContext = {
    workspaceRoot: cwd,
    provider: providerId,
    model,
    permissionMode: currentMode,
    setProvider: (newP) => {
      providerId = newP;
      cmdContext.provider = newP;
    },
    setModel: (newM) => {
      model = newM;
      cmdContext.model = newM;
    },
    setPermissionMode: (newM) => {
      currentMode = newM;
      cmdContext.permissionMode = newM;
      permissions.setMode(newM);
    },
    clearHistory: () => {
      history = [textMessage("system", sysPrompt)];
    },
    undoLastChange: () => {
      const res = checkpoints.undo(cwd);
      return res ? `✔ ${res.message}` : "Nothing to undo.";
    },
    listSessions: () => {
      const list = sessionStore.list();
      return list.map((s) => `• ${s.id}: ${s.provider} (${s.model}) - ${s.updatedAt}`).join("\n");
    },
    showHelp: () => {
      return Object.entries(COMMANDS)
        .map(([k, v]) => `  ${k.padEnd(12)} ${v.description}`)
        .join("\n");
    },
    print: (msg) => {
      process.stdout.write(`${msg}\n`);
    },
  };

  // Try OpenTUI first if not forced plain
  let tui;
  if (!options.plain) {
    tui = await tryCreateOpenTui(
      {
        onPrompt: async (input) => {
          await executeTurn(input);
        },
      },
      p,
    );
  }

  process.stdout.write(
    renderBanner(p, {
      provider: providerId,
      model,
      mode: currentMode,
    }),
  );

  async function executeTurn(input: string): Promise<boolean | void> {
    if (input.startsWith("/")) {
      return await handleSlashCommand(input, cmdContext);
    }

    const userMsg = textMessage("user", input);
    history.push(userMsg);
    sessionStore.append(sessionId, userMsg);

    let adapter;
    try {
      adapter = registry.adapter(providerId);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      return;
    }

    try {
      const result = await runAgentLoop(history, {
        adapter,
        model,
        tools,
        permissions,
        workspaceRoot: cwd,
        onDelta: (chunk) => {
          process.stdout.write(chunk);
        },
        onReasoning: (chunk) => {
          process.stdout.write(p.style(chunk, "dim"));
        },
        onToolStart: (name, summary) => {
          process.stdout.write(`\n${p.style(`→ ${name}:`, "bold")} ${summary}\n`);
        },
        onToolEnd: (name, output, isError) => {
          const badge = isError ? p.style("✖ failed", "bold") : p.style("✔ ok", "dim");
          const preview = output.split("\n")[0]?.slice(0, 80) ?? "";
          process.stdout.write(`  ${badge} ${preview}\n\n`);
        },
        checkpoint: (f, orig) => checkpoints.record(f, orig),
      });

      history = result.messages;
      process.stdout.write("\n\n");
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    }
  }

  if (tui) {
    await tui.start();
  } else {
    // Readline fallback
    const repl = new ReadlineRepl(
      {
        onLine: async (line) => {
          return await executeTurn(line);
        },
        getPrompt: () => `${p.style("onyx", "bold")}> `,
      },
      p,
    );
    repl.start();
  }
}
