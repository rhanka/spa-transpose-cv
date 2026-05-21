import { getActiveProvider } from "../src/services/llm/registry.js";
const provider = await getActiveProvider();
console.log("provider_id:", provider.config.id);
console.log("provider_class:", provider.constructor.name);
console.log("model:", provider.config.modelId);

const deltas: string[] = [];
const thinking: string[] = [];
const result = await provider.generateStream(
  { system: "Tu réponds en deux mots maximum.", userMessage: "Capitale de la France ?", maxTokens: 64 },
  { onContent: (t) => deltas.push(t), onThinking: (t) => thinking.push(t) },
);
console.log("text:", JSON.stringify(result.text));
console.log("usage:", JSON.stringify(result.usage));
console.log("n_content_deltas:", deltas.length);
console.log("n_thinking_deltas:", thinking.length);
