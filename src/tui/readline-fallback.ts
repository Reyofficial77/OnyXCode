import readline from "node:readline";
import { Painter } from "../utils/terminal.js";

export interface ReplCallbacks {
  onLine: (line: string) => Promise<boolean | void>;
  onInterrupt?: () => void;
  getPrompt?: () => string;
}

/**
 * Minimal REPL used as the default interactive shell whenever `@opentui/core`
 * is unavailable or when the user passes `--plain`.
 *
 * Fully supports multiline inputs (ends with backslash or within open triple backticks),
 * command history, and `/slash` commands.
 */
export class ReadlineRepl {
  private rl?: readline.Interface;
  private running = false;
  private multilineBuffer: string[] = [];

  constructor(private readonly callbacks: ReplCallbacks, private readonly painter: Painter) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.renderPrompt(),
      terminal: Boolean(process.stdin.isTTY),
    });

    this.rl.prompt();

    this.rl.on("line", async (raw) => {
      const line = raw;
      if (this.multilineBuffer.length > 0) {
        if (line.trim() === "```" || line.trim() === '"""') {
          this.multilineBuffer.push(line);
          const full = this.multilineBuffer.join("\n");
          this.multilineBuffer = [];
          await this.dispatch(full);
          return;
        }
        this.multilineBuffer.push(line);
        this.rl?.setPrompt("... ");
        this.rl?.prompt();
        return;
      }

      if (line.endsWith("\\")) {
        this.multilineBuffer.push(line.slice(0, -1));
        this.rl?.setPrompt("... ");
        this.rl?.prompt();
        return;
      }

      if (line.startsWith("```") && !line.slice(3).includes("```")) {
        this.multilineBuffer.push(line);
        this.rl?.setPrompt("... ");
        this.rl?.prompt();
        return;
      }

      await this.dispatch(line);
    });

    this.rl.on("SIGINT", () => {
      if (this.multilineBuffer.length > 0) {
        this.multilineBuffer = [];
        process.stdout.write("\n(multiline cancelled)\n");
        this.rl?.setPrompt(this.renderPrompt());
        this.rl?.prompt();
        return;
      }
      if (this.callbacks.onInterrupt) {
        this.callbacks.onInterrupt();
      } else {
        process.stdout.write("\n(press Ctrl+D or type /exit to quit)\n");
        this.rl?.prompt();
      }
    });

    this.rl.on("close", () => {
      this.running = false;
    });
  }

  stop(): void {
    this.running = false;
    this.rl?.close();
  }

  write(text: string): void {
    process.stdout.write(text);
  }

  private renderPrompt(): string {
    if (this.callbacks.getPrompt) return this.callbacks.getPrompt();
    return `${this.painter.style("onyx", "bold")}> `;
  }

  private async dispatch(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      this.rl?.prompt();
      return;
    }
    this.rl?.pause();
    try {
      const shouldExit = await this.callbacks.onLine(trimmed);
      if (shouldExit === true) {
        this.stop();
        return;
      }
    } finally {
      if (this.running) {
        this.rl?.setPrompt(this.renderPrompt());
        this.rl?.resume();
        this.rl?.prompt();
      }
    }
  }
}
