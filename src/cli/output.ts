/**
 * Non-TUI helpers: ANSI color, tables and secret prompts. Kept separate from the
 * TUI so CLI subcommands work in any terminal (and in CI pipes).
 */
import readline from "node:readline";
import { detectCapabilities, Painter, stripAnsi, truncate } from "../utils/terminal.js";

export function painter(): Painter {
  const caps = detectCapabilities();
  return new Painter(caps.color);
}

export function printError(message: string, hint?: string): void {
  const p = painter();
  process.stderr.write(`${p.style("error:", "bold")} ${message}\n`);
  if (hint) process.stderr.write(`  ${p.style(`hint: ${hint}`, "dim")}\n`);
}

export function printHint(message: string): void {
  process.stderr.write(`${painter().style(message, "dim")}\n`);
}

export function printTable(rows: string[][], headers?: string[]): string {
  const all = headers ? [headers, ...rows] : rows;
  const widths: number[] = [];
  for (const row of all) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, stripAnsi(cell).length);
    });
  }
  return all
    .map((row, idx) => {
      const line = row.map((cell, i) => pad(cell, widths[i] ?? 0)).join("  ");
      if (idx === 0 && headers) return painter().style(line, "bold");
      return line;
    })
    .join("\n");
}

function pad(cell: string, width: number): string {
  const len = stripAnsi(cell).length;
  return len >= width ? cell : cell + " ".repeat(width - len);
}

/**
 * Read a line with echo disabled. Works without external deps; restores terminal
 * state on error/interrupt.
 */
export async function promptSecret(question: string): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY) {
    // Piped input: read one line, echo cannot be disabled, warn the caller.
    const rl = readline.createInterface({ input: stdin });
    const answer = await new Promise<string>((resolve) => rl.question("", (a) => resolve(a)));
    rl.close();
    return answer.trim();
  }
  stdout.write(question);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  stdin.resume();
  let value = "";
  return new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const str = chunk.toString("utf8");
      for (const ch of str) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Cancelled"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (ch === "\u001b") continue; // ignore escape sequences in a raw prompt
        if (ch >= " ") {
          value += ch;
          stdout.write("*");
        }
      }
    };
    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(wasRaw ?? false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

export async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

/** Ask a yes/no question; default false. */
export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  const answer = (await promptLine(`${question}${suffix}`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

export { truncate, stripAnsi };
