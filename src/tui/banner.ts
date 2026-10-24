import { Painter } from "../utils/terminal.js";
import { VERSION } from "../version.js";

export function renderBanner(painter: Painter, details?: { provider?: string; model?: string; mode?: string }): string {
  const p = painter;
  const logo = `
   ____                      ____          _      
  / __ \\____  __  ___  __   / __ \\____  __| |___  
 / / / / __ \\/ / / / |/_/  / / / / __ \\/ _\` / -_) 
 \\____/_//_/\\__, /_> <    /____/\\___/_/\\__,_/\\__/  
           /____/                                 
`.trimEnd();

  const lines = [
    p.style(logo, "bold"),
    `  ${p.style(`v${VERSION}`, "dim")} — AI coding agent for the terminal`,
  ];
  if (details) {
    const parts = [
      details.provider ? `provider: ${p.style(details.provider, "bold")}` : undefined,
      details.model ? `model: ${p.style(details.model, "bold")}` : undefined,
      details.mode ? `mode: ${p.style(details.mode, "bold")}` : undefined,
    ].filter(Boolean);
    if (parts.length) lines.push(`  ${parts.join("  |  ")}`);
  }
  lines.push(`  Type ${p.style("/help", "bold")} for commands, ${p.style("/exit", "bold")} to quit.\n`);
  return lines.join("\n");
}
