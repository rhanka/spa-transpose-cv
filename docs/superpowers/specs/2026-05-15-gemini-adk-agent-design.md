# P1.5 Gemini ADK Agent — Design

Date: 2026-05-15
Status: approved design, pending implementation plan

## Goal

Build the first Python "agent ADK" for the Gemini Enterprise marketplace
track (PLAN.md §P1.5), on top of the tool surface and runtime boundary
delivered in the last three commits (`9cc1378`, `ba1685f`, `deeed4d`).

The agent is the missing piece between the existing
`make_transpose_cvs_tool` factory and an actual Gemini-driven invocation: it
wires the tool into a `google.adk.agents.Agent`, exposes a local `Runner`
for dev/smoke, and keeps the existing HTTP entrypoint for Vertex AI Agent
Builder / Agentspace deployments. Both entrypoints share the same agent
factory and the same `ModelConfig` resolution layer.

## Scope

Supported in this slice:

- Two execution targets, same agent root:
  - Local CLI Runner (`python -m cv_transpose_marketplace.gemini_adk`) for
    dev and smoke, using `google.adk` `Runner` + `InMemorySessionService`.
  - Existing HTTP entrypoint (`handle_http_request` in `gemini_adk/http.py`)
    untouched — Vertex Agent Builder calls
    `POST /tools/transposeCvs` directly; the Python `Agent`/`Runner` is not
    in the Vertex hot path.
- `ModelConfig` dataclass + layered resolution
  (`override > tenant lookup (stub) > env > compile-time default`).
- Split of the current `build_root_agent` dual-mode helper into two
  single-responsibility functions:
  - `build_root_agent(...) -> Agent` — requires the `gemini-adk` extra,
    raises a clear `ImportError` otherwise.
  - `build_agent_descriptor(...) -> dict` — always available, no SDK
    dependency, used by tests and any future Vertex schema export.
- Externalized system instruction:
  `gemini_adk/prompts/transpose_cvs.md` loaded via
  `importlib.resources`. The instruction is the existing one, aerated into
  Markdown sections (Role / Tool / Response contract / Anti-patterns).
- Optional dependency `gemini-adk` in `core/python/pyproject.toml`:
  `google-adk` and `google-genai`, pinned at install time, kept out of
  `make test-core-python` so Docker CI stays small.
- Unit tests covering: `ModelConfig` resolution cascade, factory/descriptor
  split, prompt loading and hash inclusion in the descriptor, local
  runner instantiation (with SDK import mocked), and CLI exit codes.
- One opt-in integration test exercising a real Gemini call against a
  short fake-PDF fixture with `run_fn` mocked. Marker
  `@pytest.mark.integration`, skipped when `GOOGLE_API_KEY` and ADC are
  both absent, executed via a separate `make test-gemini-integration`
  target.
- Deterministic bundle extended to include the new files
  (`model_config.py`, `runner.py`, `__main__.py`,
  `prompts/transpose_cvs.md`) with hashes in the bundle manifest.

Out of scope for this slice:

- Vertex AI Agent Builder / Agentspace deployment harness, IAM, service
  account, region config. Tracked separately in PLAN.md §P1.5.
- Marketplace partner publication, packaging, smoke post-publication.
- Reading the per-tenant `gemini.model` field from a backoffice config
  (P1.3 portal does not yet expose this field). The `tenant_lookup` hook
  is in place but stubbed to `None`.
- Long-lived agent process with multiple concurrent users. Local runner
  is single-invocation per `python -m ...` call; HTTP runtime is
  per-request and stateless.
- Streaming UI / interactive chat mode in the CLI. The agent contract is
  one-shot ("Accept CV attachments, call transpose_cvs once").
- Retry logic on top of what the Gemini SDK provides natively.

## Architecture

All new code lives under
`core/python/cv_transpose_marketplace/gemini_adk/`:

```
gemini_adk/
├── agent.py              # extended — build_root_agent + build_agent_descriptor
├── model_config.py       # new
├── prompts/
│   └── transpose_cvs.md  # new
├── runner.py             # new
├── __main__.py           # new — CLI
├── tool.py               # existing — make_transpose_cvs_tool, function declaration
├── runtime.py            # existing — handle_gemini_request, MarketplaceInputError
├── http.py               # existing — HTTP route, untouched
└── types.py              # existing
```

The HTTP path (`http.py` → `runtime.handle_gemini_request` → `tool.transpose_cvs`)
remains the production-facing surface and is unchanged by this slice. The
local Runner is the new addition and reuses the same `transpose_cvs`
coroutine via `build_root_agent`.

## Model Configuration

```python
# model_config.py

@dataclass(frozen=True)
class ModelConfig:
    model: str
    region: str | None
    project_id: str | None
    endpoint_mode: Literal["ai_studio", "vertex"]
    api_key_env: str = "GOOGLE_API_KEY"

DEFAULT_MODEL = "gemini-2.5-flash"

def resolve_model_config(
    claims: Mapping[str, str],
    *,
    env: Mapping[str, str],
    override: ModelConfig | None = None,
    tenant_lookup: Callable[[str], Mapping[str, str] | None] | None = None,
) -> ModelConfig: ...
```

Resolution cascade, highest priority first:

1. `override` — explicit dependency injection, used by tests, batch jobs,
   and debug overrides.
2. `tenant_lookup(tenant_key)` — pluggable callable returning a dict with
   keys `gemini.model`, `gemini.region`, `gemini.project_id`. Default is
   `None` for this slice; wired only when P1.3 portal exposes a tenant
   model field.
3. Environment variables `GEMINI_AGENT_MODEL`, `GEMINI_AGENT_REGION`,
   `GEMINI_AGENT_PROJECT_ID`.
4. Compile-time defaults: `model=gemini-2.5-flash`, `region=None`,
   `project_id=None`, `endpoint_mode=ai_studio`.

Validation:

- If `region` is set, `project_id` must be set and `endpoint_mode` is
  forced to `"vertex"`. Otherwise `endpoint_mode = "ai_studio"`.
- Missing `project_id` with `region` set → `MarketplaceInputError(
  "model_config_invalid", "project_id required when region is set")`.

This covers all four customer-management situations identified during
brainstorming (BYO-Vertex per tenant, our SaaS billing, marketplace SKU,
dev override) without committing to one billing model now.

## Agent Factory Split

`build_root_agent` is split into two single-responsibility functions in
`agent.py`:

```python
def build_root_agent(
    *,
    claims: Mapping[str, str],
    llm: LlmProvider,
    assets_base_url: str,
    assets_bearer_token: str,
    model_config: ModelConfig,
    instruction: str | None = None,
    assets_cache_ttl_seconds: int = 0,
    run_fn: Callable[..., Awaitable[Any]] = run_gemini_transpose,
) -> "google.adk.agents.Agent":
    """Build the real ADK Agent. Requires the `gemini-adk` extra."""

def build_agent_descriptor(
    *,
    model_config: ModelConfig,
    instruction: str | None = None,
) -> dict[str, Any]:
    """Pure-Python descriptor (no SDK). Used by tests and schema export."""
```

`build_root_agent` imports `google.adk.agents.Agent` at call time and
raises `ImportError` with the install hint `pip install
cv-transpose-marketplace[gemini-adk]` if the SDK is missing.
`build_agent_descriptor` never imports the SDK.

Both functions read the system instruction from the same
`load_system_instruction()` helper, which loads
`prompts/transpose_cvs.md` via `importlib.resources` on first call and
caches the value. The descriptor includes the sha256 of the prompt so
bundle manifests can detect prompt drift.

## System Prompt

`prompts/transpose_cvs.md` keeps the current semantics — single tool
call, no conversational memory, return only the artifact and the report
card — but is structured as Markdown:

```
# Role
You are the CV transpose agent for a Workspace tenant.

## Tool
You have one tool: `transpose_cvs`. Call it exactly once per user
request. ...

## Response contract
After the tool returns, surface only:
- the generated DOCX or ZIP artifact,
- the report card.
Do not reformulate the CV content.

## Anti-patterns
- Do not keep conversational memory across turns.
- Do not call the tool more than once.
- ...
```

Final wording is finalized during implementation. The file is shipped in
the deterministic bundle and its hash is part of the bundle manifest.

## Local Runner & CLI

```python
# runner.py
def make_local_runner(
    *,
    agent: "google.adk.agents.Agent",
    app_name: str = "cv-transpose-gemini",
    session_service: "google.adk.sessions.BaseSessionService | None" = None,
) -> "google.adk.runners.Runner": ...
```

`session_service` defaults to `InMemorySessionService` — fresh per call,
consistent with the wrapper's `persistence="ephemeral"` semantics. The
`google.adk` imports are lazy and produce the same install-hint
`ImportError` on missing SDK.

`__main__.py` exposes a single-shot CLI:

```
python -m cv_transpose_marketplace.gemini_adk \
    --claims-file=path.json \
    --files name=cv.pdf,mime=application/pdf,path=cv.pdf \
    [--user-prompt="..."] \
    [--model=gemini-2.5-pro]
```

Behavior:

- Parses claims and files, resolves `ModelConfig`.
- Calls `build_root_agent(...)`, `make_local_runner(...)`, runs one
  invocation, writes the resulting JSON payload to stdout.
- Exit codes: `0` success, `2` `MarketplaceInputError` (JSON error on
  stdout), `1` unexpected error (traceback on stderr).
- No interactive chat loop.

## Error Handling

Builds on the existing `MarketplaceInputError` pattern from `runtime.py`:

- New error codes:
  - `model_config_invalid` — raised by `resolve_model_config` when
    `region` is set without `project_id`.
  - `agent_runtime_error` — raised by `runner.py` when the SDK / model
    surface raises an exception during `Runner.run_async`. The original
    exception message is captured in the `detail` field.
- The CLI maps `MarketplaceInputError` to exit code `2` and prints a
  structured JSON `{"error": code, "detail": msg}` on stdout. Other
  exceptions exit `1` with traceback on stderr.
- No bespoke retry policy. Transient HTTP/quota retries remain the
  Gemini SDK's responsibility.

## Tests

Layout follows `core/python/tests/` conventions (pytest +
pytest-asyncio + DI mocks).

Unit tests:

- `test_marketplace_gemini_adk_model_config.py` — full cascade
  resolution, region/project_id validation, env var pickup.
- `test_marketplace_gemini_adk_agent.py` (extended) — factory vs
  descriptor split; `ImportError` when SDK absent for the real factory;
  prompt hash present in descriptor; instruction loaded from the
  markdown file.
- `test_marketplace_gemini_adk_runner.py` — `make_local_runner` returns
  a configured Runner when SDK is importable; clear `ImportError`
  otherwise. SDK is mocked via `sys.modules` injection.
- `test_marketplace_gemini_adk_cli.py` — invokes `__main__` via
  `runpy.run_module`, asserts exit codes and stdout JSON shape with
  `run_fn` mocked.

Integration test (opt-in):

- `tests/integration/test_gemini_adk_smoke.py`, marker
  `@pytest.mark.integration`, skipped if neither `GOOGLE_API_KEY` nor
  ADC are configured.
- Fixture: a short fake-PDF (a few hundred tokens) + stubbed claims
  `{"hd": "test.example", "sub": "smoke@test.example"}`.
- `run_fn` is mocked — the test exercises only the agent ↔ Gemini
  orchestration, not the CV pipeline.
- Asserts: agent issues exactly one `transpose_cvs` tool call, the
  mocked `run_fn` is invoked with the expected arguments, the final
  response contains the artifact descriptor.
- Run via a new `make test-gemini-integration` target. Not part of
  `make test-core-python`.

`make test-core-python` (Docker) keeps running every unit test in this
slice without the `gemini-adk` extra installed.

## Packaging

Extend `core/python/pyproject.toml`:

```toml
[project.optional-dependencies]
gemini-adk = [
    "google-adk>=...,<...",
    "google-genai>=...,<...",
]
```

Concrete version pins are chosen at implementation time based on the
latest stable releases on PyPI at that moment.

The deterministic Gemini ADK bundle (existing) is extended to include
`model_config.py`, `runner.py`, `__main__.py`, and
`prompts/transpose_cvs.md`. Their hashes are added to the bundle
manifest.

Local install for dev:

```
pip install -e core/python[gemini-adk]
```

This is documented in the bundle README or a short `INSTALL.md` placed
next to the bundle output.

## Release Shape

After this slice the repo ships:

- new files `model_config.py`, `runner.py`, `__main__.py`,
  `prompts/transpose_cvs.md` under
  `core/python/cv_transpose_marketplace/gemini_adk/`;
- extended `agent.py` with `build_root_agent` and
  `build_agent_descriptor`;
- new unit tests in `core/python/tests/`;
- new opt-in integration test in `core/python/tests/integration/`;
- `pyproject.toml` declares the optional `gemini-adk` extra;
- deterministic bundle includes the new files with manifest hashes;
- `make test-core-python` stays green without the extra installed;
- new `make test-gemini-integration` target documented.

No commit, no deploy, no tag until the user explicitly requests it. The
next step after this slice is the Vertex AI Agent Builder / Agentspace
integration (PLAN.md §P1.5, second open checkbox).
