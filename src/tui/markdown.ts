import { marked, type Tokens } from "marked";
import { Painter, stripAnsi } from "../utils/terminal.js";

/** Render markdown tokens to ANSI terminal strings. */
export function renderMarkdown(markdown: string, painter: Painter, maxWidth = 80): string {
  const p = painter;
  const tokens = marked.lexer(markdown);
  const out: string[] = [];

  for (const tok of tokens) {
    out.push(renderToken(tok, p, maxWidth));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderToken(tok: Tokens.Generic, p: Painter, maxWidth: number): string {
  switch (tok.type) {
    case "heading": {
      const heading = tok as Tokens.Heading;
      const text = renderInline(heading.tokens ?? [], p);
      if (heading.depth === 1) return `\n${p.style(text.toUpperCase(), "bold", "underline")}\n`;
      if (heading.depth === 2) return `\n${p.style(`## ${text}`, "bold")}\n`;
      return `\n${p.style(`${"#".repeat(heading.depth)} ${text}`, "bold")}\n`;
    }
    case "paragraph": {
      const para = tok as Tokens.Paragraph;
      return renderInline(para.tokens ?? [], p);
    }
    case "code": {
      const code = tok as Tokens.Code;
      const lang = code.lang ? ` (${code.lang})` : "";
      const header = p.style(`┌── code${lang} `, "dim");
      const footer = p.style("└──", "dim");
      const lines = code.text
        .split("\n")
        .map((l) => `${p.style("│", "dim")} ${l}`)
        .join("\n");
      return `${header}\n${lines}\n${footer}`;
    }
    case "blockquote": {
      const bq = tok as Tokens.Blockquote;
      const inner = (bq.tokens ?? []).map((t) => renderToken(t, p, maxWidth)).join("\n");
      return inner
        .split("\n")
        .map((l) => `${p.style("│", "dim")} ${l}`)
        .join("\n");
    }
    case "list": {
      const list = tok as Tokens.List;
      const lines: string[] = [];
      list.items.forEach((item, idx) => {
        const start = typeof list.start === "number" ? list.start : 1;
        const bullet = list.ordered ? `${start + idx}.` : "•";
        const content = (item.tokens ?? []).map((t) => renderToken(t, p, maxWidth)).join("\n");
        lines.push(`  ${p.style(bullet, "bold")} ${content}`);
      });
      return lines.join("\n");
    }
    case "table": {
      const table = tok as Tokens.Table;
      const headers = table.header.map((c) => renderInline(c.tokens, p));
      const rows = table.rows.map((r) => r.map((c) => renderInline(c.tokens, p)));
      return renderTable(headers, rows, p);
    }
    case "space":
      return "";
    case "hr":
      return p.style("─".repeat(Math.min(maxWidth, 40)), "dim");
    default:
      return (tok as { raw?: string }).raw ?? "";
  }
}

function renderInline(tokens: Tokens.Generic[], p: Painter): string {
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out += (t as Tokens.Text).text;
        break;
      case "strong":
        out += p.style(renderInline((t as Tokens.Strong).tokens ?? [], p), "bold");
        break;
      case "em":
        out += p.style(renderInline((t as Tokens.Em).tokens ?? [], p), "italic");
        break;
      case "codespan":
        out += p.style(`\`${(t as Tokens.Codespan).text}\``, "dim");
        break;
      case "link": {
        const link = t as Tokens.Link;
        out += `${renderInline(link.tokens ?? [], p)} (${p.style(link.href, "underline")})`;
        break;
      }
      default:
        out += (t as { raw?: string }).raw ?? "";
    }
  }
  return out;
}

function renderTable(headers: string[], rows: string[][], p: Painter): string {
  const widths: number[] = headers.map((h) => stripAnsi(h).length);
  for (const r of rows) {
    r.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, stripAnsi(cell).length);
    });
  }
  const formatRow = (cells: string[]) =>
    cells.map((c, i) => c + " ".repeat(Math.max(0, (widths[i] ?? 0) - stripAnsi(c).length))).join(" | ");

  const lines = [p.style(formatRow(headers), "bold"), widths.map((w) => "─".repeat(w)).join("-+-")];
  for (const r of rows) lines.push(formatRow(r));
  return lines.join("\n");
}
