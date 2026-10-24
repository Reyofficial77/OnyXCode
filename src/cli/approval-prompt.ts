import type { ApprovalDecision, ApprovalPrompt, ApprovalRequest } from "../permissions/policy.js";
import { Painter } from "../utils/terminal.js";
import { confirm } from "./output.js";

/** Ask permission interactively in the terminal. */
export class TerminalApprovalPrompt implements ApprovalPrompt {
  constructor(private readonly painter: Painter) {}

  async ask(request: ApprovalRequest): Promise<ApprovalDecision> {
    const p = this.painter;
    const badge =
      request.risk === "dangerous"
        ? p.style("[DANGEROUS]", "bold")
        : request.risk === "write"
          ? p.style("[WRITE]", "bold")
          : "[READ]";

    process.stdout.write(`\n${badge} Action requires confirmation:\n`);
    process.stdout.write(`  tool:    ${p.style(request.tool, "bold")}\n`);
    process.stdout.write(`  action:  ${request.summary}\n`);
    if (request.detail) {
      process.stdout.write(`  details:\n`);
      for (const line of request.detail.split("\n").slice(0, 20)) {
        process.stdout.write(`    ${line}\n`);
      }
      if (request.detail.split("\n").length > 20) {
        process.stdout.write(`    ... (${request.detail.split("\n").length - 20} more lines)\n`);
      }
    }

    if (request.sessionScopeKey) {
      process.stdout.write(
        `Options: [y]es once, [s]ession (allow this action for the whole session), [n]o\n`,
      );
      const answer = await this.readChoice(["y", "s", "n"]);
      if (answer === "s") return "allow-session";
      return answer === "y" ? "allow" : "deny";
    }

    const ok = await confirm("Allow this action?", false);
    return ok ? "allow" : "deny";
  }

  private async readChoice(allowed: string[]): Promise<string> {
    const rl = (await import("node:readline")).createInterface({ input: process.stdin, output: process.stdout });
    return new Promise<string>((resolve) => {
      rl.question("Choice: ", (answer) => {
        rl.close();
        const ch = answer.trim().toLowerCase()[0] ?? "n";
        resolve(allowed.includes(ch) ? ch : "n");
      });
    });
  }
}
