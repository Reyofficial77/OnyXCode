import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createBuiltinToolRegistry } from "../src/tools/index.js";
import { CheckpointManager } from "../src/tools/checkpoint.js";

describe("Coding Tools Execution", () => {
  let tmpDir: string;
  let registry: ReturnType<typeof createBuiltinToolRegistry>;
  let checkpoints: CheckpointManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onyx-tools-test-"));
    registry = createBuiltinToolRegistry();
    checkpoints = new CheckpointManager();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("writes, reads, and edits files cleanly", async () => {
    const writeTool = registry.get("write_file")!;
    const readTool = registry.get("read_file")!;
    const editTool = registry.get("edit_file")!;

    // 1. Write file
    const writeRes = await writeTool.run(
      { path: "hello.txt", content: "Hello world\nThis is line two\n" },
      { workspaceRoot: tmpDir, maxOutputBytes: 10000, timeoutMs: 5000, checkpoint: (f, o) => checkpoints.record(f, o) },
    );
    expect(writeRes.isError).toBeFalsy();
    expect(fs.existsSync(path.join(tmpDir, "hello.txt"))).toBe(true);

    // 2. Read file
    const readRes = await readTool.run(
      { path: "hello.txt" },
      { workspaceRoot: tmpDir, maxOutputBytes: 10000, timeoutMs: 5000 },
    );
    expect(readRes.content).toContain("1: Hello world");

    // 3. Edit file
    const editRes = await editTool.run(
      { path: "hello.txt", oldString: "line two", newString: "the second line" },
      { workspaceRoot: tmpDir, maxOutputBytes: 10000, timeoutMs: 5000, checkpoint: (f, o) => checkpoints.record(f, o) },
    );
    expect(editRes.isError).toBeFalsy();
    const updated = fs.readFileSync(path.join(tmpDir, "hello.txt"), "utf8");
    expect(updated).toContain("the second line");

    // 4. Test Checkpoint Undo
    const undoRes = checkpoints.undo(tmpDir);
    expect(undoRes).toBeDefined();
    const restored = fs.readFileSync(path.join(tmpDir, "hello.txt"), "utf8");
    expect(restored).toContain("line two");
  });
});
