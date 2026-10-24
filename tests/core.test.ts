import { describe, it, expect } from "vitest";
import { ProviderDetector } from "../src/providers/detect/detector.js";
import { redactString, maskSecret } from "../src/utils/redact.js";
import { evaluatePolicy } from "../src/permissions/policy.js";
import { resolveWorkspacePath, PathOutsideWorkspaceError } from "../src/utils/workspace.js";
import path from "node:path";

describe("ProviderDetector (Key Format)", () => {
  const detector = new ProviderDetector();

  it("detects anthropic key format", () => {
    const res = detector.detect("sk-ant-api03-abcdefghijklmn1234567890");
    expect(res.guesses.length).toBeGreaterThan(0);
    expect(res.guesses[0]?.providerId).toBe("anthropic");
    expect(res.key.masked).toContain("••••");
  });

  it("detects openai project key format", () => {
    const res = detector.detect("sk-proj-1234567890abcdef1234567890");
    expect(res.guesses[0]?.providerId).toBe("openai");
  });

  it("detects google gemini key format", () => {
    const res = detector.detect("AIzaSyD-1234567890abcdef1234567890123");
    expect(res.guesses[0]?.providerId).toBe("gemini");
  });

  it("detects groq key format", () => {
    const res = detector.detect("gsk_1234567890abcdef12345678901234567890");
    expect(res.guesses[0]?.providerId).toBe("groq");
  });
});

describe("Redaction and Secret Masking", () => {
  it("redacts API keys from arbitrary text", () => {
    const input = "Connecting with sk-proj-1234567890abcdef and sk-ant-secret12345";
    const redacted = redactString(input);
    expect(redacted).not.toContain("sk-proj-1234567890abcdef");
    expect(redacted).not.toContain("sk-ant-secret12345");
    expect(redacted).toContain("***REDACTED***");
  });

  it("masks secrets safely", () => {
    const masked = maskSecret("sk-1234567890abcdef");
    expect(masked.startsWith("sk-1")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).toContain("••••");
  });
});

describe("Permissions Policy", () => {
  it("allows read operations in read-only mode", () => {
    const decision = evaluatePolicy({
      mode: "read-only",
      risk: "read",
      tool: "read_file",
      allowReadRoots: [],
      allowWriteRoots: [],
      allowCommands: [],
      denyCommands: [],
    });
    expect(decision.allowed).toBe(true);
    expect(decision.needsApproval).toBe(false);
  });

  it("blocks write operations in read-only mode without prompt", () => {
    const decision = evaluatePolicy({
      mode: "read-only",
      risk: "write",
      tool: "write_file",
      allowReadRoots: [],
      allowWriteRoots: [],
      allowCommands: [],
      denyCommands: [],
    });
    expect(decision.allowed).toBe(false);
  });

  it("requires approval for dangerous tools in confirm-risky mode", () => {
    const decision = evaluatePolicy({
      mode: "confirm-risky",
      risk: "dangerous",
      tool: "run_command",
      subject: "rm -rf test",
      allowReadRoots: [],
      allowWriteRoots: [],
      allowCommands: [],
      denyCommands: [],
    });
    expect(decision.allowed).toBe(true);
    expect(decision.needsApproval).toBe(true);
  });
});

describe("Workspace Path Resolution & Sandbox", () => {
  const root = path.resolve(process.cwd());

  it("resolves a relative path inside workspace", () => {
    const res = resolveWorkspacePath("package.json", { root });
    expect(res.insideWorkspace).toBe(true);
    expect(res.relative).toBe("package.json");
  });

  it("prevents directory traversal attacks", () => {
    expect(() => {
      resolveWorkspacePath("../../../../../../../etc/passwd", { root });
    }).toThrow(PathOutsideWorkspaceError);
  });
});
