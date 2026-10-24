import fs from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "../utils/workspace.js";

export interface Checkpoint {
  id: string;
  timestamp: string;
  file: string;
  originalContent: string | null;
}

/**
 * Tracks modifications so `/undo` can restore files safely.
 * Only files modified by OnyxCode in this session are tracked.
 */
export class CheckpointManager {
  private readonly checkpoints: Checkpoint[] = [];
  private counter = 0;

  record(file: string, originalContent: string | null): string {
    const id = `chk_${++this.counter}`;
    this.checkpoints.push({
      id,
      timestamp: new Date().toISOString(),
      file,
      originalContent,
    });
    return id;
  }

  list(): readonly Checkpoint[] {
    return this.checkpoints;
  }

  undo(workspaceRoot: string): { restored: string; message: string } | undefined {
    const last = this.checkpoints.pop();
    if (!last) return undefined;
    const target = resolveWorkspacePath(last.file, { root: workspaceRoot });
    if (last.originalContent === null) {
      if (fs.existsSync(target.absolute)) fs.unlinkSync(target.absolute);
      return { restored: last.file, message: `Removed newly-created file ${last.file}` };
    }
    fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
    fs.writeFileSync(target.absolute, last.originalContent, "utf8");
    return { restored: last.file, message: `Restored ${last.file} to previous version` };
  }
}
