"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "./icons";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-line bg-[#0c0c0c]">
      <div className="flex h-9 items-center justify-between border-b border-line bg-[#111] px-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-dim">
          {language || "code"}
        </span>
        <button
          onClick={copy}
          className="btn-press inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-dim hover:bg-box2 hover:text-ink"
          aria-label="Salin kode"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="max-h-[520px] overflow-auto p-3.5 text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Pre({ children }: any) {
  const child = Array.isArray(children) ? children[0] : children;
  const className: string = child?.props?.className ?? "";
  const match = /language-([\w+-]+)/.exec(className);
  const raw = child?.props?.children;
  const code = Array.isArray(raw) ? raw.join("") : String(raw ?? "");
  return <CodeBlock language={match?.[1] ?? ""} code={code.replace(/\n$/, "")} />;
}

function Anchor({ children, href }: any) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function Table({ children }: any) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-line">
      <table>{children}</table>
    </div>
  );
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: Pre,
          a: Anchor,
          table: Table,
          input: (props: any) => (
            <input {...props} disabled className="mr-1.5 accent-white" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
