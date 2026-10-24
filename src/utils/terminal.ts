/** Small terminal capability + ANSI helpers. No heavy deps. */

export interface TermCapabilities {
  isTTY: boolean;
  columns: number;
  rows: number;
  color: boolean;
  trueColor: boolean;
  unicode: boolean;
  ci: boolean;
}

export function detectCapabilities(env: NodeJS.ProcessEnv = process.env): TermCapabilities {
  const out = process.stdout;
  const isTTY = Boolean(out.isTTY);
  const color =
    isTTY &&
    !("NO_COLOR" in env) &&
    env.TERM !== "dumb" &&
    env.FORCE_COLOR !== "0";
  return {
    isTTY,
    columns: out.columns ?? (Number(env.COLUMNS) || 80),
    rows: out.rows ?? (Number(env.LINES) || 24),
    color,
    trueColor: color && /truecolor|24bit/i.test(`${env.COLORTERM ?? ""}${env.TERM ?? ""}`),
    unicode: !/^(0|false|no)$/i.test(env.ONYX_ASCII ?? "") && (process.platform !== "win32" || env.WT_SESSION !== undefined || env.TERM_PROGRAM !== undefined),
    ci: Boolean(env.CI),
  };
}

type Style = "bold" | "dim" | "italic" | "underline" | "inverse";

const STYLE_CODES: Record<Style, [string, string]> = {
  bold: ["\x1b[1m", "\x1b[22m"],
  dim: ["\x1b[2m", "\x1b[22m"],
  italic: ["\x1b[3m", "\x1b[23m"],
  underline: ["\x1b[4m", "\x1b[24m"],
  inverse: ["\x1b[7m", "\x1b[27m"],
};

export class Painter {
  constructor(private readonly enabled: boolean) {}

  style(text: string, ...styles: Style[]): string {
    if (!this.enabled || styles.length === 0) return text;
    const prefix = styles.map((s) => STYLE_CODES[s][0]).join("");
    const suffix = [...styles].reverse().map((s) => STYLE_CODES[s][1]).join("");
    return `${prefix}${text}${suffix}`;
  }

  color(text: string, rgb: string): string {
    if (!this.enabled) return text;
    const { r, g, b } = hexToRgb(rgb);
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
  }

  bg(text: string, rgb: string): string {
    if (!this.enabled) return text;
    const { r, g, b } = hexToRgb(rgb);
    return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
  }

  get active(): boolean {
    return this.enabled;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export function displayWidth(text: string): number {
  // Approximation: wide CJK/emoji counted as 2.
  let width = 0;
  for (const ch of stripAnsi(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Truncate to `max` display columns, appending ellipsis when cut. */
export function truncate(text: string, max: number, ellipsis = "…"): string {
  if (max <= 0) return "";
  if (displayWidth(text) <= max) return text;
  let out = "";
  let w = 0;
  for (const ch of stripAnsi(text)) {
    const cw = isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
    if (w + cw > max - ellipsis.length) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (displayWidth(paragraph) <= width) {
      lines.push(paragraph);
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === "") continue;
      if (displayWidth(line + word) > width) {
        if (line.trim() !== "") lines.push(line.trimEnd());
        if (displayWidth(word) > width) {
          // hard-break long tokens
          let chunk = "";
          for (const ch of word) {
            if (displayWidth(chunk + ch) > width) {
              lines.push(chunk);
              chunk = "";
            }
            chunk += ch;
          }
          line = chunk;
        } else {
          line = word.trimStart();
        }
      } else {
        line += word;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
