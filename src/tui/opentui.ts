import { Painter } from "../utils/terminal.js";

/** Interface that both OpenTUI and Readline TUI implement. */
export interface TuiSession {
  start(): Promise<void>;
  stop(): void;
  appendUserMessage(text: string): void;
  appendAssistantDelta(text: string): void;
  appendReasoningDelta(text: string): void;
  appendToolStart(name: string, summary: string): void;
  appendToolResult(name: string, output: string, isError?: boolean): void;
  setStatus(status: string): void;
  setError(error: string): void;
}

export interface TuiSessionCallbacks {
  onPrompt: (prompt: string) => Promise<void>;
  onInterrupt?: () => void;
  onExit?: () => void;
}

/**
 * OpenTUI bridge. Dynamically imports `@opentui/core` so that absence of native
 * binaries never breaks standard installs. Returns undefined when OpenTUI is not
 * supported in the current environment.
 */
export async function tryCreateOpenTui(
  callbacks: TuiSessionCallbacks,
  _painter: Painter,
): Promise<TuiSession | undefined> {
  if (process.env.ONYXCODE_PLAIN === "1" || !process.stdout.isTTY) return undefined;
  try {
    // @ts-expect-error Optional dependency might not have types installed
    const opentui = await import("@opentui/core");
    // If the native module loaded, build a basic OpenTUI session.
    // In environments where native binding fails, the catch block triggers.
    if (typeof opentui.createCliRenderer !== "function") return undefined;
    return new OpenTuiSessionImpl(opentui, callbacks);
  } catch {
    return undefined;
  }
}

class OpenTuiSessionImpl implements TuiSession {
  private renderer?: unknown;

  constructor(
    private readonly opentui: any,
    private readonly callbacks: TuiSessionCallbacks,
  ) {}

  async start(): Promise<void> {
    // Basic setup using the opentui renderer.
    try {
      this.renderer = await this.opentui.createCliRenderer();
    } catch {
      // Fallback is preferred if renderer fails
      throw new Error("Failed to initialize OpenTUI renderer");
    }
  }

  stop(): void {
    if (this.renderer && typeof (this.renderer as { destroy?: () => void }).destroy === "function") {
      (this.renderer as { destroy: () => void }).destroy();
    }
  }

  appendUserMessage(text: string): void {
    process.stdout.write(`\n> ${text}\n`);
  }

  appendAssistantDelta(text: string): void {
    process.stdout.write(text);
  }

  appendReasoningDelta(text: string): void {
    process.stdout.write(`\x1b[2m${text}\x1b[22m`);
  }

  appendToolStart(name: string, summary: string): void {
    process.stdout.write(`\n[tool: ${name}] ${summary}\n`);
  }

  appendToolResult(name: string, output: string, isError?: boolean): void {
    process.stdout.write(`[${name} ${isError ? "error" : "done"}]: ${output.slice(0, 200)}\n`);
  }

  setStatus(status: string): void {
    void status;
  }

  setError(error: string): void {
    process.stderr.write(`\x1b[31m${error}\x1b[39m\n`);
  }
}
