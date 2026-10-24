import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { VERSION } from "../version.js";
import { loadConfig, saveGlobalConfig, setConfigValue, getConfigValue, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE } from "../config/loader.js";
import { CredentialStore } from "../config/credentials.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ProviderDetector } from "../providers/detect/detector.js";
import { ProviderVerifier } from "../providers/detect/verifier.js";
import { printDoctorReport } from "./doctor.js";
import { painter, printError, printTable, promptSecret, promptLine, confirm } from "./output.js";
import { runInteractiveSession } from "./interactive.js";
import { createBuiltinToolRegistry } from "../tools/index.js";
import { PermissionEngine, HeadlessApprovalPrompt } from "../permissions/policy.js";
import { runAgentLoop } from "../agent/loop.js";
import { buildSystemPrompt } from "../context/system-prompt.js";
import { textMessage } from "../providers/types.js";
import { SessionStore } from "../sessions/store.js";
import { exitCodeFor } from "../utils/errors.js";

export function createCli(): Command {
  const program = new Command();
  const p = painter();

  program
    .name("onyxcode")
    .description("OnyxCode — AI coding agent for the terminal")
    .version(VERSION, "-v, --version", "Output the current version")
    .option("-C, --cwd <path>", "Working directory", process.cwd())
    .option("--plain", "Disable rich TUI and run plain REPL", false)
    .option("--no-color", "Disable ANSI colors")
    .option("--provider <name>", "Override default provider")
    .option("--model <name>", "Override default model")
    .option("--mode <mode>", "Permission mode: read-only | confirm-risky | allow-all")
    .action(async (options) => {
      try {
        await runInteractiveSession({
          cwd: path.resolve(options.cwd),
          plain: options.plain,
          providerOverride: options.provider,
          modelOverride: options.model,
          modeOverride: options.mode,
        });
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(exitCodeFor(err));
      }
    });

  // doctor
  program
    .command("doctor")
    .description("Run health checks on environment, tools, and credentials")
    .action(async () => {
      const parentOpts = program.opts();
      const cwd = path.resolve(parentOpts.cwd);
      const ok = await printDoctorReport(cwd);
      if (!ok) process.exit(1);
    });

  // init
  program
    .command("init")
    .description("Initialize .onyxcode project configuration and AGENTS.md in current directory")
    .action(async () => {
      const parentOpts = program.opts();
      const cwd = path.resolve(parentOpts.cwd);
      const confDir = path.join(cwd, PROJECT_CONFIG_DIR);
      fs.mkdirSync(confDir, { recursive: true });
      const confFile = path.join(confDir, PROJECT_CONFIG_FILE);
      if (!fs.existsSync(confFile)) {
        fs.writeFileSync(confFile, `${JSON.stringify({ schemaVersion: 1 }, null, 2)}\n`, "utf8");
        process.stdout.write(`Created ${path.relative(cwd, confFile)}\n`);
      }
      const agentsFile = path.join(cwd, "AGENTS.md");
      if (!fs.existsSync(agentsFile)) {
        fs.writeFileSync(
          agentsFile,
          `# Project Instructions for OnyxCode\n\nAdd workspace-specific instructions, coding guidelines, or constraints here.\n`,
          "utf8",
        );
        process.stdout.write(`Created ${path.relative(cwd, agentsFile)}\n`);
      }
      process.stdout.write(p.style("Initialized OnyxCode project successfully.\n", "bold"));
    });

  // run <prompt>
  program
    .command("run <prompt>")
    .description("Run a single instruction autonomously and exit")
    .option("-p, --print", "Print response directly to stdout without streaming status", false)
    .action(async (promptText, cmdOpts) => {
      const parentOpts = program.opts();
      const cwd = path.resolve(parentOpts.cwd);
      const loaded = loadConfig({ cwd });
      const store = new CredentialStore();
      const registry = new ProviderRegistry({ getApiKey: (pr, env) => store.get(pr) ?? (env ? process.env[env] : undefined) }, loaded.config);

      const providerId = parentOpts.provider ?? loaded.config.defaultProvider ?? registry.defaultProviderId();
      if (!providerId) {
        printError("No provider configured. Run `onyxcode auth login` or specify `--provider`.");
        process.exit(1);
      }

      const adapter = registry.adapter(providerId);
      const model = parentOpts.model ?? loaded.config.defaultModel ?? "gpt-4.1-mini";
      const tools = createBuiltinToolRegistry();
      const permissions = new PermissionEngine(parentOpts.mode ?? loaded.config.permissionMode, {
        prompt: new HeadlessApprovalPrompt("deny"),
      });

      const sys = buildSystemPrompt({
        workspaceRoot: cwd,
        isGit: fs.existsSync(path.join(cwd, ".git")),
        environment: `${process.platform}-${process.arch}`,
      });

      const messages = [textMessage("system", sys), textMessage("user", promptText)];

      try {
        const result = await runAgentLoop(messages, {
          adapter,
          model,
          tools,
          permissions,
          workspaceRoot: cwd,
          onDelta: (chunk) => {
            if (!cmdOpts.print) process.stdout.write(chunk);
          },
        });
        if (cmdOpts.print) {
          process.stdout.write(`${result.finalText}\n`);
        } else {
          process.stdout.write("\n");
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(exitCodeFor(err));
      }
    });

  // auth
  const authCmd = program.command("auth").description("Manage API credentials");

  authCmd
    .command("login")
    .description("Configure an API key for a provider")
    .option("--provider <name>", "Provider ID (openai, anthropic, gemini, groq, openrouter)")
    .action(async (opts) => {
      let provider = opts.provider;
      if (!provider) {
        provider = await promptLine("Provider [openai]: ");
        if (!provider) provider = "openai";
      }
      const key = await promptSecret(`Enter API key for ${provider}: `);
      if (!key.trim()) {
        printError("No key entered.");
        process.exit(1);
      }
      const store = new CredentialStore();
      store.set(provider, key);
      process.stdout.write(p.style(`✔ Key saved for provider "${provider}".\n`, "bold"));
    });

  authCmd
    .command("list")
    .description("List providers with stored credentials")
    .action(() => {
      const store = new CredentialStore();
      const providers = store.listProviders();
      if (providers.length === 0) {
        process.stdout.write("No credentials stored.\n");
        return;
      }
      process.stdout.write("Stored credentials for:\n");
      for (const pr of providers) process.stdout.write(`  • ${pr}\n`);
    });

  // provider
  const provCmd = program.command("provider").description("Inspect and detect providers");

  provCmd
    .command("detect")
    .description("Analyze API key format without contacting any network endpoint")
    .action(async () => {
      const key = await promptSecret("Enter or paste API key to detect: ");
      const detector = new ProviderDetector();
      const res = detector.detect(key);
      process.stdout.write(`\nKey Shape: ${res.key.shape} (${res.key.length} chars, ${res.key.masked})\n\n`);
      if (res.guesses.length === 0) {
        process.stdout.write("No matching provider pattern recognized.\n");
      } else {
        process.stdout.write("Guesses:\n");
        for (const g of res.guesses) {
          process.stdout.write(`  • ${g.providerName} [${g.confidence} confidence]\n    ${g.reason}\n`);
        }
      }
      process.stdout.write(`\nNote: ${res.note}\n`);
    });

  provCmd
    .command("test <provider>")
    .description("Verify an API key by making a minimal live request")
    .option("--model <model>", "Test model")
    .action(async (providerId, opts) => {
      const store = new CredentialStore();
      const key = store.get(providerId);
      if (!key) {
        printError(`No key stored for ${providerId}. Run \`onyxcode auth login --provider ${providerId}\`.`);
        process.exit(1);
      }
      const proceed = await confirm(`Send a test request to ${providerId}?`);
      if (!proceed) {
        process.stdout.write("Aborted.\n");
        return;
      }
      const verifier = new ProviderVerifier();
      process.stdout.write(`Testing ${providerId}...\n`);
      const res = await verifier.verify({
        providerId,
        apiKey: key,
        model: opts.model,
        confirmed: true,
      });
      if (res.status === "verified") {
        process.stdout.write(p.style(`✔ ${res.message}\n`, "bold"));
      } else {
        printError(`Verification failed (${res.status}): ${res.message}`);
        process.exit(1);
      }
    });

  // config
  const cfgCmd = program.command("config").description("View and update configuration");

  cfgCmd
    .command("get <key>")
    .description("Get a config value (e.g. defaultProvider)")
    .action((key) => {
      const loaded = loadConfig({ cwd: process.cwd() });
      const val = getConfigValue(loaded.config, key);
      process.stdout.write(`${JSON.stringify(val, null, 2)}\n`);
    });

  cfgCmd
    .command("set <key> <value>")
    .description("Set a global config value")
    .action((key, val) => {
      const loaded = loadConfig({ cwd: process.cwd() });
      const updated = setConfigValue(loaded.config, key, val);
      saveGlobalConfig(updated);
      process.stdout.write(`Set ${key} = ${val}\n`);
    });

  // sessions
  const sessCmd = program.command("session").description("Manage persistent sessions");

  sessCmd
    .command("list")
    .description("List past sessions")
    .action(() => {
      const store = new SessionStore();
      const list = store.list();
      if (list.length === 0) {
        process.stdout.write("No sessions found.\n");
        return;
      }
      const rows = list.map((s) => [s.id, s.provider, s.model, s.updatedAt, `${s.messageCount} msgs`]);
      process.stdout.write(`${printTable(rows, ["ID", "PROVIDER", "MODEL", "UPDATED", "MESSAGES"])}\n`);
    });

  sessCmd
    .command("export <id>")
    .description("Export a session to markdown or json")
    .option("-f, --format <format>", "json or markdown", "markdown")
    .action((id, opts) => {
      const store = new SessionStore();
      const content = store.export(id, opts.format === "json" ? "json" : "markdown");
      process.stdout.write(content);
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();
  await cli.parseAsync(argv);
}

main().catch((err) => {
  printError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
