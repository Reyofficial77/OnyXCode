import type { PermissionMode } from "../config/schema.js";

export interface CommandContext {
  workspaceRoot: string;
  provider: string;
  model: string;
  permissionMode: PermissionMode;
  setProvider: (p: string) => void;
  setModel: (m: string) => void;
  setPermissionMode: (mode: PermissionMode) => void;
  clearHistory: () => void;
  undoLastChange: () => string;
  listSessions: () => string;
  showHelp: () => string;
  print: (text: string) => void;
}

export type SlashHandler = (args: string, ctx: CommandContext) => Promise<boolean | void>;

export const COMMANDS: Record<string, { description: string; handler: SlashHandler }> = {
  "/help": {
    description: "Show available slash commands",
    handler: async (_args, ctx) => {
      ctx.print(ctx.showHelp());
    },
  },
  "/exit": {
    description: "Exit the session",
    handler: async () => true, // signals REPL exit
  },
  "/quit": {
    description: "Exit the session",
    handler: async () => true,
  },
  "/clear": {
    description: "Clear conversation history",
    handler: async (_args, ctx) => {
      ctx.clearHistory();
      ctx.print("Conversation history cleared.");
    },
  },
  "/undo": {
    description: "Undo the last file modification made by OnyxCode",
    handler: async (_args, ctx) => {
      const msg = ctx.undoLastChange();
      ctx.print(msg);
    },
  },
  "/model": {
    description: "Switch current model (/model <name>)",
    handler: async (args, ctx) => {
      const m = args.trim();
      if (!m) {
        ctx.print(`Current model: ${ctx.model}`);
        return;
      }
      ctx.setModel(m);
      ctx.print(`Switched model to: ${m}`);
    },
  },
  "/provider": {
    description: "Switch current provider (/provider <name>)",
    handler: async (args, ctx) => {
      const p = args.trim();
      if (!p) {
        ctx.print(`Current provider: ${ctx.provider}`);
        return;
      }
      ctx.setProvider(p);
      ctx.print(`Switched provider to: ${p}`);
    },
  },
  "/mode": {
    description: "Change permission mode: read-only | confirm-risky | allow-all",
    handler: async (args, ctx) => {
      const mode = args.trim();
      if (["read-only", "confirm-risky", "allow-all"].includes(mode)) {
        ctx.setPermissionMode(mode as PermissionMode);
        ctx.print(`Permission mode set to: ${mode}`);
      } else {
        ctx.print(`Invalid mode. Options: read-only, confirm-risky, allow-all`);
      }
    },
  },
  "/sessions": {
    description: "List recorded sessions",
    handler: async (_args, ctx) => {
      ctx.print(ctx.listSessions());
    },
  },
};

export async function handleSlashCommand(input: string, ctx: CommandContext): Promise<boolean | void> {
  const parts = input.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = input.slice(cmd ? cmd.length : 0).trim();

  const def = COMMANDS[cmd ?? ""];
  if (def) {
    return await def.handler(args, ctx);
  }
  ctx.print(`Unknown command: ${cmd}. Type /help for available commands.`);
}
