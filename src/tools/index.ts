import { ToolRegistry } from "./types.js";
import { listFilesTool, readFileTool, writeFileTool, deleteFileTool, searchFilesTool } from "./file-tools.js";
import { editFileTool, applyPatchTool } from "./edit-tools.js";
import { runCommandTool, runTestsTool, runLinterTool, projectInfoTool } from "./command-tools.js";
import { gitStatusTool, gitDiffTool, gitLogTool } from "./git-tools.js";

export function createBuiltinToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(listFilesTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(deleteFileTool);
  registry.register(searchFilesTool);
  registry.register(editFileTool);
  registry.register(applyPatchTool);
  registry.register(runCommandTool);
  registry.register(runTestsTool);
  registry.register(runLinterTool);
  registry.register(projectInfoTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);
  return registry;
}
