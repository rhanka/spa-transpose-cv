# Sentropic Integration Request — LLM Mesh + Flow Contract

Date: 2026-05-16
Status: local spec draft, no Sentropic issue opened yet

## Goal

Prepare a concrete request for `../sentropic` so `spa-transpose-cv` can
reuse the Sentropic LLM and graph contracts without forking its own long-term
runtime model.

This spec has two tracks:

- Track A — adopt `@sentropic/llm-mesh` in the TypeScript API LLM runtime.
- Track B — align marketplace agents and Python runtime with the Sentropic
  graph model that is expected to land as `@sentropic/flow`.

## Decisions Already Captured

- Output is a local spec first. Do not open a Sentropic issue yet.
- Web/API stays TypeScript. Do not request a Python web rewrite.
- Python marketplace agents should align to the same graph model, but Python
  bindings can come later.
- Track A must be a detailed fit-gap against `@sentropic/llm-mesh`.
- Track B must map the canonical flow types and ask Sentropic to freeze the
  contract or list expected breaking changes.

## Executive Recommendation

Proceed with a two-step adoption.

1. Add `@sentropic/llm-mesh` as a contract/facade dependency in
   `spa-transpose-cv/api`, while keeping the existing concrete provider
   implementations behind an injected adapter.
2. Ask Sentropic to stabilize the `@sentropic/flow` public contract before
   `spa-transpose-cv` mirrors the graph model in Python marketplace agents.

Do not wait for Python bindings to use `llm-mesh` in the TypeScript API. Do
not delete the current provider implementations until the Sentropic mesh has
either live provider clients or an agreed injected-client adapter contract.

## Source References

`spa-transpose-cv`:

- `api/src/services/llm/types.ts:1` — current provider ids and LLM request
  contract.
- `api/src/services/llm/registry.ts:26` — active provider selection from env.
- `api/src/services/llm/adapt-to-core.ts:51` — API-to-core provider adapter.
- `api/src/services/cv-agent.ts:76` — extraction pipeline using the LLM
  provider.
- `core/typescript/src/llm.ts:1` — core TypeScript LLM protocol.
- `core/python/cv_transpose_core/types.py:48` — mirrored Python LLM protocol.
- `core/python/cv_transpose_core/transpose.py:171` — Python LLM call.

`../sentropic`:

- `packages/llm-mesh/src/index.ts:1` — exported public surface.
- `packages/llm-mesh/src/providers.ts:1` — provider/model identifiers.
- `packages/llm-mesh/src/generation.ts:9` — generation request/response
  contract.
- `packages/llm-mesh/src/streaming.ts:5` — normalized stream event taxonomy.
- `packages/llm-mesh/src/auth.ts:3` — auth source model.
- `packages/llm-mesh/src/registry.ts:17` — injected provider adapter
  contract.
- `api/src/services/llm-runtime/mesh-dispatch.ts:253` — Sentropic API usage
  with injected clients.
- `spec/SPEC_WORKFLOW_RUNTIME.md:3` — current workflow runtime contract.
- `spec/SPEC_VOL_FLOW.md:5` — intended `@sentropic/flow` extraction scope.
- `spec/SPEC_STUDY_ARCHITECTURE_BOUNDARIES.md:17` — package boundary for
  `@sentropic/flow`.

## Track A — `@sentropic/llm-mesh` Fit-Gap

### Current `spa-transpose-cv` Runtime

The API has a narrow LLM interface:

- Provider ids: `anthropic`, `openai`, `mistral`, `gemini`, `cohere`.
- Request shape: `system`, `userMessage`, `maxTokens`, optional
  `enableReasoning`, `reasoningBudget`, `responseFormat: "json"`.
- Streaming callbacks: `onThinking` and `onContent`.
- Usage: `input_tokens`, `output_tokens`.
- Provider registry is selected with `LLM_PROVIDER` and env API keys.
- Each provider implementation owns SDK-specific request mapping and streaming
  normalization.

This is already close to a mesh facade, but it is local and duplicated from
Sentropic.

### Sentropic Mesh Surface

`@sentropic/llm-mesh` already covers the main abstractions:

- Provider ids and model ids for OpenAI, Gemini, Anthropic, Mistral, Cohere.
- Message model with roles `system`, `developer`, `user`, `assistant`,
  `tool`.
- Text, image, and file content parts.
- JSON object and JSON schema response formats.
- Normalized stream events:
  `reasoning_delta`, `content_delta`, `tool_call_*`, `status`, `error`,
  `done`.
- Auth material via environment, direct token, user token, workspace token,
  and account transports.
- Capabilities/catalog metadata, including provider/model feature support.
- Injected provider adapter contract.

Important constraint: the default adapters are scaffolds. They require
injected clients and do not replace live provider SDK implementations by
themselves.

### Compatibility Matrix

| Need in `spa-transpose-cv` | Mesh support | Gap / decision |
| --- | --- | --- |
| Five providers | Covered | Good fit. |
| Single system + user prompt | Covered via messages | Straight mapping. |
| JSON mode | Covered via `json-object` and `json-schema` | Prefer `json-object` first; evaluate schema mode for CV extraction later. |
| Reasoning toggle | Partially covered via reasoning effort | Mesh has effort, spa has numeric `reasoningBudget`; need budget extension or providerOptions. |
| Streaming thinking/content | Covered via `reasoning_delta` and `content_delta` | Straight mapping to core callbacks. |
| Usage accounting | Covered with input/output/reasoning/total | Need policy for whether reasoning tokens are reported separately or folded into output metrics. |
| API key env selection | Covered | Align env var naming with Sentropic mesh dispatch. |
| Cost / CO2 metadata | Not covered in current mesh catalog | Keep spa metadata locally or ask Sentropic to add optional FinOps fields. |
| Live provider SDK calls | Not provided by default adapters | Keep current providers behind injected mesh clients for first adoption. |
| Gemini schema limits | Covered in capabilities | Useful for avoiding unsupported schema keywords such as `additionalProperties`. |

### Requested Sentropic Decisions

Ask Sentropic to decide or document:

1. Whether `ReasoningOptions` should support a numeric provider budget
   alongside effort.
2. Whether model catalog entries should include optional cost and CO2 metadata
   used by `spa-transpose-cv`.
3. Whether the injected provider client contract in `llm-mesh` is stable enough
   for application runtimes to depend on.
4. Whether stream `done` events are guaranteed to include final usage when the
   provider exposes it.
5. Whether JSON schema mode is intended to normalize provider-specific schema
   limits or only advertise them via capabilities.

### Recommended `spa-transpose-cv` Adoption Slice

Implement a small adapter instead of replacing everything:

- Add `@sentropic/llm-mesh` to `api`.
- Create `api/src/services/llm/mesh-adapter.ts`.
- Map the current `LlmRequest` to `GenerateRequest` / `StreamRequest`.
- Reuse current provider implementations as injected clients.
- Keep `core/typescript/src/llm.ts` unchanged for now.
- Keep Python `LlmProvider` unchanged until the flow contract is stable.

Success criteria:

- Existing CV extraction output remains unchanged on the current fixtures.
- Streaming still emits thinking and content deltas.
- Existing env-based provider selection still works.
- No provider SDK is removed in the first slice.

## Track B — Flow / Graph Contract Alignment

### Current Sentropic Source Of Truth

Sentropic already has the relevant runtime model in API code and specs:

- Workflow definitions with tasks and transitions.
- Transition taxonomy: `start`, `normal`, `conditional`, `fanout`, `join`,
  `end`.
- Task metadata with executor type, job type, input bindings, prompt template,
  and agent selection.
- Strict optimistic concurrency control for workflow run state updates.
- Durable task dispatch using composite idempotency keys.
- Fanout and join semantics.
- Agent selection rules with default agent fallback.
- Ports intended for extraction: `CheckpointStore<FlowState>`, `JobQueue`,
  `WorkflowStore`, `ApprovalGate`.

### Canonical Types To Freeze

Ask Sentropic to freeze or publish the following TypeScript-level contract in
or before `@sentropic/flow`:

```ts
type FlowTransitionType =
  | "start"
  | "normal"
  | "conditional"
  | "fanout"
  | "join"
  | "end";

interface FlowDefinition {
  key: string;
  name: string;
  description?: string;
  version?: string;
  tasks: FlowTaskDefinition[];
  transitions: FlowTransitionDefinition[];
  config?: Record<string, unknown>;
}

interface FlowTaskDefinition {
  taskKey: string;
  title: string;
  description?: string;
  orderIndex?: number;
  agentKey?: string | null;
  schemaFormat?: "json_schema" | "zod" | "none";
  inputSchema?: unknown;
  outputSchema?: unknown;
  sectionKey?: string | null;
  metadata?: FlowTaskMetadata;
}

interface FlowTaskMetadata {
  executor?: "noop" | "job";
  jobType?: string;
  inputBindings?: Record<string, FlowInputBinding>;
  promptTemplate?: string;
  agentSelection?: FlowAgentSelection;
  fanout?: FlowFanoutMetadata;
  join?: FlowJoinMetadata;
}

interface FlowTransitionDefinition {
  fromTaskKey: string | null;
  toTaskKey: string | null;
  transitionType: FlowTransitionType;
  condition?: FlowCondition;
  metadata?: Record<string, unknown>;
}
```

This is not a request for Sentropic to adopt these exact names if they already
have better package names. It is a request to expose an equivalent stable
contract with explicit migrations if names change.

### Runtime Invariants To Freeze

Ask Sentropic to stabilize these behavioral invariants:

- Flow owns orchestration only. It must not own provider SDKs, model routing,
  chat UI, or marketplace publication.
- State updates use strict optimistic concurrency with expected version and
  retry.
- Task dispatch is idempotent on a composite key equivalent to
  `(runId, taskKey, taskInstanceKey)`.
- Fanout instance keys are deterministic, using configured key path first,
  then item id/key, then index fallback.
- Join tasks become ready only after all required upstream instances are
  complete under the selected join policy.
- `noop` tasks complete synchronously; `job` tasks enqueue through `JobQueue`.
- `promptTemplate` and `agentSelection` are runtime contract fields, not UI
  decoration.
- Human gates and approvals are port-based and do not require a specific UI.

### Python Marketplace Implication

`spa-transpose-cv` should mirror this model in Python only after the TypeScript
contract is stable enough to avoid rework. The first Python target is not a
full Sentropic runtime; it should be a minimal compatible executor model for
marketplace agents:

- Load a frozen flow definition.
- Resolve task input bindings.
- Execute one tool/job boundary at a time.
- Preserve deterministic idempotency keys.
- Expose the same transition taxonomy and agent selection shape.

This keeps Gemini/Copilot marketplace agents aligned with Sentropic without
making Python the source of truth.

## Combined Adoption Plan

1. Send this spec to Sentropic as the initial integration request.
2. If Sentropic accepts the `llm-mesh` adapter contract, implement Track A in
   `spa-transpose-cv/api`.
3. If Sentropic cannot freeze `@sentropic/flow` yet, ask for an explicit list
   of expected breaking changes and delay Python graph mirroring.
4. Once the flow contract is stable, add a small Python compatibility layer for
   marketplace agents rather than a separate orchestration design.

## Open Decisions For Sentropic

- Can `@sentropic/llm-mesh` expose numeric reasoning budgets?
- Will the mesh catalog carry cost and CO2 metadata, or should applications
  keep local FinOps overlays?
- Is the injected provider adapter API stable for external application use?
- Is `@sentropic/flow` going to expose the workflow runtime types directly, or
  will it provide a higher-level DSL?
- Which flow invariants are guaranteed stable before external consumers build
  compatible runtimes?

## Recommended Next Action

Keep this as the local reference and use it to open one Sentropic issue or PR
when ready. The recommended first implementation in `spa-transpose-cv` is a
small TypeScript `llm-mesh` adapter spike; the recommended first Sentropic
decision is to freeze the injected client and flow type contracts.
