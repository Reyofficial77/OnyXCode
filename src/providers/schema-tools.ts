import type { ToolSchema } from "./types.js";

/** JSON → provider-specific tool schema shapes. */

export function toOpenAITools(tools: ToolSchema[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function toAnthropicTools(tools: ToolSchema[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Gemini uses a restricted OpenAPI subset. */
export function toGeminiTools(tools: ToolSchema[]): unknown[] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeGeminiSchema(t.parameters),
      })),
    },
  ];
}

/** Gemini rejects `additionalProperties` and some keywords. */
export function sanitizeGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "additionalProperties" || k === "$schema" || k === "default") continue;
    if (k === "type" && Array.isArray(v)) {
      out.type = v.find((t) => t !== "null") ?? "string";
      continue;
    }
    out[k] = sanitizeGeminiSchema(v);
  }
  return out;
}
