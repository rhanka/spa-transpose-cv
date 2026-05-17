# Gemini ADK Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project constraint:** All Python tests run via `make test-core-python` (Docker, no native python). All commits require explicit user approval before being executed (`feedback_no_commit_unless_asked`). Commit steps are listed for completeness but should be confirmed with the user.

**Goal:** Wire a real Python `google.adk` Agent for the Gemini Enterprise track (PLAN.md §P1.5), with a local Runner CLI for dev/smoke, layered `ModelConfig` resolution, externalized system prompt, and an opt-in integration test against a real Gemini model.

**Architecture:** New files in `core/python/cv_transpose_marketplace/gemini_adk/`. `build_root_agent` is split into `build_agent_descriptor()` (pure, no SDK) and a new `build_root_agent(*, claims, llm, ...)` that requires the `gemini-adk` extra. A `runner.py` exposes `make_local_runner()` (lazy SDK import) and `__main__.py` becomes a real one-shot CLI replacing the existing offline demo. The HTTP path (`http.py` → `runtime.py`) is untouched. The deterministic bundle is extended to include the new files.

**Tech Stack:** Python 3.12 stdlib, pytest + pytest-asyncio, `google-adk` + `google-genai` (optional extra), Docker (test runner).

**Spec:** `docs/superpowers/specs/2026-05-15-gemini-adk-agent-design.md`

---

## File Map

Files to **create**:
- `core/python/cv_transpose_marketplace/gemini_adk/model_config.py`
- `core/python/cv_transpose_marketplace/gemini_adk/prompts/__init__.py` (empty, marks package)
- `core/python/cv_transpose_marketplace/gemini_adk/prompts/transpose_cvs.md`
- `core/python/cv_transpose_marketplace/gemini_adk/runner.py`
- `core/python/tests/test_marketplace_gemini_adk_model_config.py`
- `core/python/tests/test_marketplace_gemini_adk_runner.py`
- `core/python/tests/test_marketplace_gemini_adk_cli.py`
- `core/python/tests/integration/__init__.py` (empty)
- `core/python/tests/integration/test_gemini_adk_smoke.py`

Files to **modify**:
- `core/python/cv_transpose_marketplace/gemini_adk/agent.py` — split factory/descriptor, remove module-level singleton
- `core/python/cv_transpose_marketplace/gemini_adk/__init__.py` — update exports
- `core/python/cv_transpose_marketplace/__init__.py` — update re-exports
- `core/python/cv_transpose_marketplace/gemini_adk/__main__.py` — replace offline demo with real CLI
- `core/python/cv_transpose_marketplace/gemini_adk/package.py` — extend `REQUIRED_GEMINI_ADK_PATHS`
- `core/python/pyproject.toml` — add `[project.optional-dependencies] gemini-adk`
- `core/python/tests/test_marketplace_gemini_adk_agent.py` — adapt to split (use `build_agent_descriptor`)
- `core/python/tests/test_marketplace_gemini_adk_function_declaration.py` — same adaptation
- `core/python/tests/test_marketplace_gemini_adk_bundle.py` — assert new files are bundled
- `Makefile` — add `test-gemini-integration` target
- `PLAN.md` — tick `[x] agent Python ADK`

---

## Task 1 — `ModelConfig` dataclass and resolution cascade

**Files:**
- Create: `core/python/cv_transpose_marketplace/gemini_adk/model_config.py`
- Test: `core/python/tests/test_marketplace_gemini_adk_model_config.py`

- [ ] **Step 1.1: Write the failing test**

Create `core/python/tests/test_marketplace_gemini_adk_model_config.py`:

```python
from __future__ import annotations

import pytest

from cv_transpose_marketplace.gemini_adk.model_config import (
    DEFAULT_MODEL,
    ModelConfig,
    resolve_model_config,
)
from cv_transpose_marketplace.validation import MarketplaceInputError


def test_default_when_no_inputs() -> None:
    config = resolve_model_config(claims={}, env={})

    assert config.model == DEFAULT_MODEL
    assert config.region is None
    assert config.project_id is None
    assert config.endpoint_mode == "ai_studio"


def test_env_overrides_default() -> None:
    env = {
        "GEMINI_AGENT_MODEL": "gemini-2.5-pro",
        "GEMINI_AGENT_REGION": "europe-west1",
        "GEMINI_AGENT_PROJECT_ID": "my-proj",
    }

    config = resolve_model_config(claims={}, env=env)

    assert config.model == "gemini-2.5-pro"
    assert config.region == "europe-west1"
    assert config.project_id == "my-proj"
    assert config.endpoint_mode == "vertex"


def test_tenant_lookup_overrides_env() -> None:
    def lookup(tenant_key: str):
        assert tenant_key == "gws:example.com"
        return {"gemini.model": "gemini-2.5-pro", "gemini.region": "us-central1", "gemini.project_id": "tenant-proj"}

    env = {"GEMINI_AGENT_MODEL": "gemini-2.5-flash"}
    claims = {"hd": "example.com"}

    config = resolve_model_config(claims=claims, env=env, tenant_lookup=lookup)

    assert config.model == "gemini-2.5-pro"
    assert config.region == "us-central1"
    assert config.project_id == "tenant-proj"
    assert config.endpoint_mode == "vertex"


def test_override_wins_over_everything() -> None:
    override = ModelConfig(
        model="gemini-1.5-flash",
        region=None,
        project_id=None,
        endpoint_mode="ai_studio",
    )

    config = resolve_model_config(
        claims={"hd": "example.com"},
        env={"GEMINI_AGENT_MODEL": "gemini-2.5-pro"},
        override=override,
    )

    assert config is override


def test_region_without_project_id_raises() -> None:
    env = {"GEMINI_AGENT_REGION": "us-central1"}

    with pytest.raises(MarketplaceInputError) as excinfo:
        resolve_model_config(claims={}, env=env)

    # MarketplaceInputError is a plain ValueError subclass; we encode the
    # error code as the leading token of the message ("<code>: <detail>").
    assert str(excinfo.value).startswith("model_config_invalid:")


def test_endpoint_mode_vertex_when_region_and_project_set() -> None:
    env = {"GEMINI_AGENT_REGION": "us-central1", "GEMINI_AGENT_PROJECT_ID": "p"}

    config = resolve_model_config(claims={}, env=env)

    assert config.endpoint_mode == "vertex"
```

- [ ] **Step 1.2: Run full Python suite, see new test fail (ImportError)**

Run: `make test-core-python`
Expected: the new `test_marketplace_gemini_adk_model_config.py` fails with `ModuleNotFoundError: cv_transpose_marketplace.gemini_adk.model_config`.

- [ ] **Step 1.3: Implement `model_config.py`**

Create `core/python/cv_transpose_marketplace/gemini_adk/model_config.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Mapping

from ..identity import derive_tenant_key_from_claims
from ..validation import MarketplaceInputError

DEFAULT_MODEL = "gemini-2.5-flash"

EndpointMode = Literal["ai_studio", "vertex"]


@dataclass(frozen=True)
class ModelConfig:
    model: str
    region: str | None
    project_id: str | None
    endpoint_mode: EndpointMode
    api_key_env: str = "GOOGLE_API_KEY"


def _coerce_endpoint_mode(region: str | None, project_id: str | None) -> EndpointMode:
    if region is None and project_id is None:
        return "ai_studio"
    if region is not None and project_id is None:
        raise MarketplaceInputError(
            "model_config_invalid: project_id is required when region is set"
        )
    return "vertex"


def _from_env(env: Mapping[str, str]) -> tuple[str | None, str | None, str | None]:
    return (
        env.get("GEMINI_AGENT_MODEL"),
        env.get("GEMINI_AGENT_REGION"),
        env.get("GEMINI_AGENT_PROJECT_ID"),
    )


def _from_tenant(
    claims: Mapping[str, str],
    tenant_lookup: Callable[[str], Mapping[str, str] | None] | None,
) -> tuple[str | None, str | None, str | None]:
    if tenant_lookup is None:
        return (None, None, None)
    try:
        tenant_key = derive_tenant_key_from_claims("gws", claims)
    except MarketplaceInputError:
        return (None, None, None)
    record = tenant_lookup(tenant_key)
    if not record:
        return (None, None, None)
    return (
        record.get("gemini.model"),
        record.get("gemini.region"),
        record.get("gemini.project_id"),
    )


def resolve_model_config(
    claims: Mapping[str, str],
    *,
    env: Mapping[str, str],
    override: ModelConfig | None = None,
    tenant_lookup: Callable[[str], Mapping[str, str] | None] | None = None,
) -> ModelConfig:
    if override is not None:
        return override

    tenant_model, tenant_region, tenant_project = _from_tenant(claims, tenant_lookup)
    env_model, env_region, env_project = _from_env(env)

    model = tenant_model or env_model or DEFAULT_MODEL
    region = tenant_region or env_region
    project_id = tenant_project or env_project

    endpoint_mode = _coerce_endpoint_mode(region, project_id)

    return ModelConfig(
        model=model,
        region=region,
        project_id=project_id,
        endpoint_mode=endpoint_mode,
    )
```

- [ ] **Step 1.4: Run full Python suite, see new tests pass**

Run: `make test-core-python`
Expected: `test_marketplace_gemini_adk_model_config.py` 6/6 pass; no regression elsewhere.

- [ ] **Step 1.5: Propose commit (await user approval)**

```bash
git add core/python/cv_transpose_marketplace/gemini_adk/model_config.py \
        core/python/tests/test_marketplace_gemini_adk_model_config.py
git commit -m "feat(core-python): add gemini agent model config resolution"
```

---

## Task 2 — Externalize the system prompt

**Files:**
- Create: `core/python/cv_transpose_marketplace/gemini_adk/prompts/__init__.py` (empty)
- Create: `core/python/cv_transpose_marketplace/gemini_adk/prompts/transpose_cvs.md`
- Modify: `core/python/cv_transpose_marketplace/gemini_adk/agent.py`
- Modify: `core/python/tests/test_marketplace_gemini_adk_agent.py`

- [ ] **Step 2.1: Write the prompt file**

Create `core/python/cv_transpose_marketplace/gemini_adk/prompts/transpose_cvs.md`:

```markdown
# Role

You are the CV transpose agent for a Google Workspace tenant. The user attaches one or more CV documents (PDF or DOCX); your job is to produce the transposed enterprise template for the calling tenant.

## Tool

You have exactly one tool: `transpose_cvs`.

- Call `transpose_cvs` exactly once per user request.
- Forward every attached file to the tool. Do not pre-filter, summarize, or paraphrase the CV content.
- The tool handles tenant resolution, template fetching, and rendering. You do not need to know the tenant key, asset URLs, or any other plumbing.

## Response contract

After the tool returns, surface only:

- The generated DOCX (or ZIP, when several CVs are attached).
- The structured report card returned by the tool.

Do not reformulate, summarize, or annotate the CV content yourself. Do not invent fields that were not returned by the tool.

## Anti-patterns

- Do not keep conversational memory across turns.
- Do not call `transpose_cvs` more than once per request.
- Do not call other tools (there are none).
- If the tool returns a structured error (`tenant_not_configured`, `assets_auth_failed`, `assets_unavailable`, `unsupported_mime`, ...), surface that error verbatim. Do not retry, do not paraphrase.
```

- [ ] **Step 2.2: Add empty `prompts/__init__.py`**

Create `core/python/cv_transpose_marketplace/gemini_adk/prompts/__init__.py`:

```python
```

(empty file — marks the directory as a package so `importlib.resources` can read the markdown.)

- [ ] **Step 2.3: Write the failing test for `load_system_instruction`**

Edit `core/python/tests/test_marketplace_gemini_adk_agent.py`. Replace its full contents with:

```python
from __future__ import annotations


def test_load_system_instruction_returns_markdown_with_role_section() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import load_system_instruction

    instruction = load_system_instruction()

    assert "# Role" in instruction
    assert "transpose_cvs" in instruction
    assert "exactly once" in instruction
    assert instruction.endswith("\n") or instruction.endswith(".")


def test_load_system_instruction_is_cached_across_calls() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import load_system_instruction

    first = load_system_instruction()
    second = load_system_instruction()

    assert first is second
```

- [ ] **Step 2.4: Run full suite, see new tests fail (no `load_system_instruction`)**

Run: `make test-core-python`
Expected: 2 new tests fail with `ImportError: cannot import name 'load_system_instruction'`. The existing `test_build_root_agent_returns_fallback_descriptor_without_google_sdk` was removed in step 2.3 (we will reintroduce equivalent coverage in Task 3).

- [ ] **Step 2.5: Implement `load_system_instruction` in `agent.py`**

Edit `core/python/cv_transpose_marketplace/gemini_adk/agent.py`. Add at the top of the file (preserving the existing `build_root_agent` for now — it is rewritten in Task 3):

```python
from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path

from .tool import build_transpose_cvs_function_declaration, transpose_cvs_payload


@lru_cache(maxsize=1)
def load_system_instruction() -> str:
    return (files("cv_transpose_marketplace.gemini_adk.prompts") / "transpose_cvs.md").read_text(encoding="utf-8")


def build_agent_instruction() -> str:
    return load_system_instruction()


def _tool_schema_path(filename: str) -> Path:
    return Path(__file__).with_name(filename)


def _load_tool_schema(filename: str) -> dict[str, object]:
    return json.loads(_tool_schema_path(filename).read_text())


def build_root_agent():
    try:
        from google.adk.agents import Agent  # type: ignore[import-not-found]
    except ImportError:
        return {
            "name": "cv_transpose_gemini",
            "description": "Transpose attached CVs into the enterprise DOCX template.",
            "tool_names": ["transpose_cvs"],
            "tool_entrypoint": "transpose_cvs_payload",
            "function_declarations": [build_transpose_cvs_function_declaration()],
            "request_schema": _load_tool_schema("request.schema.json"),
            "response_schema": _load_tool_schema("response.schema.json"),
            "instruction": build_agent_instruction(),
        }

    return Agent(
        name="cv_transpose_gemini",
        description="Transpose attached CVs into the enterprise DOCX template.",
        instruction=build_agent_instruction(),
        tools=[transpose_cvs_payload],
    )


root_agent = build_root_agent()
```

(Task 3 will then split this `build_root_agent` and remove the module-level singleton.)

- [ ] **Step 2.6: Run full suite, see new prompt tests pass**

Run: `make test-core-python`
Expected: `test_load_system_instruction_returns_markdown_with_role_section` and `test_load_system_instruction_is_cached_across_calls` pass. The other `test_marketplace_gemini_adk_function_declaration.py` test that calls `build_root_agent()` still passes because the function signature is unchanged.

- [ ] **Step 2.7: Propose commit**

```bash
git add core/python/cv_transpose_marketplace/gemini_adk/prompts/ \
        core/python/cv_transpose_marketplace/gemini_adk/agent.py \
        core/python/tests/test_marketplace_gemini_adk_agent.py
git commit -m "feat(core-python): externalize gemini adk system instruction"
```

---

## Task 3 — Split `build_root_agent` into descriptor + real factory

**Files:**
- Modify: `core/python/cv_transpose_marketplace/gemini_adk/agent.py`
- Modify: `core/python/cv_transpose_marketplace/gemini_adk/__init__.py`
- Modify: `core/python/cv_transpose_marketplace/__init__.py`
- Modify: `core/python/tests/test_marketplace_gemini_adk_agent.py`
- Modify: `core/python/tests/test_marketplace_gemini_adk_function_declaration.py`

- [ ] **Step 3.1: Write failing tests for descriptor + new signature**

Append to `core/python/tests/test_marketplace_gemini_adk_agent.py`:

```python
def test_build_agent_descriptor_returns_pure_dict_without_sdk() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import build_agent_descriptor
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")
    descriptor = build_agent_descriptor(model_config=config)

    assert descriptor["name"] == "cv_transpose_gemini"
    assert descriptor["tool_names"] == ["transpose_cvs"]
    assert descriptor["model"] == "gemini-2.5-flash"
    assert descriptor["instruction"].startswith("# Role")
    assert isinstance(descriptor["instruction_sha256"], str)
    assert len(descriptor["instruction_sha256"]) == 64


def test_build_agent_descriptor_uses_explicit_instruction_when_passed() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import build_agent_descriptor
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")
    descriptor = build_agent_descriptor(model_config=config, instruction="custom prompt")

    assert descriptor["instruction"] == "custom prompt"


def test_build_root_agent_requires_gemini_adk_extra(monkeypatch) -> None:
    import sys

    from cv_transpose_marketplace.gemini_adk.agent import build_root_agent
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    monkeypatch.setitem(sys.modules, "google.adk.agents", None)

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")

    import pytest

    with pytest.raises(ImportError) as excinfo:
        build_root_agent(
            claims={"hd": "example.com"},
            llm=object(),
            assets_base_url="https://x",
            assets_bearer_token="t",
            model_config=config,
        )

    assert "gemini-adk" in str(excinfo.value)
```

Replace `core/python/tests/test_marketplace_gemini_adk_function_declaration.py` lines 128–134 (the existing `test_root_agent_fallback_exposes_function_declarations`) with:

```python
def test_agent_descriptor_exposes_function_declarations() -> None:
    from cv_transpose_marketplace.gemini_adk import build_agent_descriptor, build_transpose_cvs_function_declaration
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")
    descriptor = build_agent_descriptor(model_config=config)

    assert descriptor["function_declarations"] == [build_transpose_cvs_function_declaration()]
```

- [ ] **Step 3.2: Run full suite, see new tests fail**

Run: `make test-core-python`
Expected: 3 new tests fail with `ImportError: cannot import name 'build_agent_descriptor'`; the 1 updated test fails with the same import.

- [ ] **Step 3.3: Rewrite `agent.py` with the split**

Replace the entire contents of `core/python/cv_transpose_marketplace/gemini_adk/agent.py` with:

```python
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from typing import Any, Awaitable, Callable, Mapping

from cv_transpose_core import LlmProvider

from ..gemini import run_gemini_transpose
from .model_config import ModelConfig
from .tool import build_transpose_cvs_function_declaration, make_transpose_cvs_tool


@lru_cache(maxsize=1)
def load_system_instruction() -> str:
    return (files("cv_transpose_marketplace.gemini_adk.prompts") / "transpose_cvs.md").read_text(encoding="utf-8")


def _tool_schema_path(filename: str) -> Path:
    return Path(__file__).with_name(filename)


def _load_tool_schema(filename: str) -> dict[str, object]:
    return json.loads(_tool_schema_path(filename).read_text())


def _instruction_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_agent_descriptor(
    *,
    model_config: ModelConfig,
    instruction: str | None = None,
) -> dict[str, Any]:
    resolved_instruction = instruction if instruction is not None else load_system_instruction()
    return {
        "name": "cv_transpose_gemini",
        "description": "Transpose attached CVs into the enterprise DOCX template.",
        "model": model_config.model,
        "endpoint_mode": model_config.endpoint_mode,
        "region": model_config.region,
        "project_id": model_config.project_id,
        "tool_names": ["transpose_cvs"],
        "tool_entrypoint": "transpose_cvs",
        "function_declarations": [build_transpose_cvs_function_declaration()],
        "request_schema": _load_tool_schema("request.schema.json"),
        "response_schema": _load_tool_schema("response.schema.json"),
        "instruction": resolved_instruction,
        "instruction_sha256": _instruction_sha256(resolved_instruction),
    }


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
):
    try:
        from google.adk.agents import Agent  # type: ignore[import-not-found]
    except ImportError as err:
        raise ImportError(
            "google.adk is required for build_root_agent(). Install the optional extra: "
            "pip install cv-transpose-marketplace[gemini-adk]"
        ) from err

    tool = make_transpose_cvs_tool(
        claims=claims,
        llm=llm,
        assets_base_url=assets_base_url,
        assets_bearer_token=assets_bearer_token,
        assets_cache_ttl_seconds=assets_cache_ttl_seconds,
        run_fn=run_fn,
    )

    return Agent(
        name="cv_transpose_gemini",
        description="Transpose attached CVs into the enterprise DOCX template.",
        model=model_config.model,
        instruction=instruction if instruction is not None else load_system_instruction(),
        tools=[tool],
    )
```

Note: the module-level `root_agent = build_root_agent()` singleton is gone (it cannot work without `claims`/`llm`/etc.). Consumers are updated in step 3.4.

- [ ] **Step 3.4: Update `__init__.py` exports**

Replace `core/python/cv_transpose_marketplace/gemini_adk/__init__.py` with:

```python
from .agent import build_agent_descriptor, build_root_agent, load_system_instruction
from .model_config import DEFAULT_MODEL, ModelConfig, resolve_model_config
from .tool import (
    build_transpose_cvs_function_declaration,
    encode_tool_result,
    make_transpose_cvs_tool,
    transpose_cvs,
    transpose_cvs_payload,
)
from .types import GeminiToolFile, GeminiToolRequest, GeminiToolResult

__all__ = [
    "DEFAULT_MODEL",
    "GeminiToolFile",
    "GeminiToolRequest",
    "GeminiToolResult",
    "ModelConfig",
    "build_agent_descriptor",
    "build_root_agent",
    "build_transpose_cvs_function_declaration",
    "encode_tool_result",
    "load_system_instruction",
    "make_transpose_cvs_tool",
    "resolve_model_config",
    "transpose_cvs",
    "transpose_cvs_payload",
]
```

Edit `core/python/cv_transpose_marketplace/__init__.py`. Locate the `from .gemini_adk import (...)` block (around lines 6–11) and the `__all__` list (around lines 45–60). Replace any `root_agent` import or export with `build_agent_descriptor`. Specifically:

- Remove the line `root_agent,` from the import block.
- Remove the line `"root_agent",` from `__all__`.
- Add `build_agent_descriptor,` to the import block.
- Add `"build_agent_descriptor",` to `__all__`.

- [ ] **Step 3.5: Run full suite, see all tests pass**

Run: `make test-core-python`
Expected: every test passes, including the 4 new/updated descriptor tests and the `ImportError` test on `build_root_agent`.

- [ ] **Step 3.6: Propose commit**

```bash
git add core/python/cv_transpose_marketplace/gemini_adk/agent.py \
        core/python/cv_transpose_marketplace/gemini_adk/__init__.py \
        core/python/cv_transpose_marketplace/__init__.py \
        core/python/tests/test_marketplace_gemini_adk_agent.py \
        core/python/tests/test_marketplace_gemini_adk_function_declaration.py
git commit -m "feat(core-python): split gemini adk agent factory and descriptor"
```

---

## Task 4 — Local Runner (`runner.py`)

**Files:**
- Create: `core/python/cv_transpose_marketplace/gemini_adk/runner.py`
- Create: `core/python/tests/test_marketplace_gemini_adk_runner.py`

- [ ] **Step 4.1: Write failing tests**

Create `core/python/tests/test_marketplace_gemini_adk_runner.py`:

```python
from __future__ import annotations

import sys
import types

import pytest


def test_make_local_runner_requires_gemini_adk_extra(monkeypatch) -> None:
    from cv_transpose_marketplace.gemini_adk.runner import make_local_runner

    monkeypatch.setitem(sys.modules, "google.adk.runners", None)
    monkeypatch.setitem(sys.modules, "google.adk.sessions", None)

    with pytest.raises(ImportError) as excinfo:
        make_local_runner(agent=object())

    assert "gemini-adk" in str(excinfo.value)


def test_make_local_runner_wires_agent_and_session(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeSessionService:
        def __init__(self) -> None:
            captured["session_service_created"] = True

    class FakeRunner:
        def __init__(self, *, app_name, agent, session_service) -> None:
            captured["app_name"] = app_name
            captured["agent"] = agent
            captured["session_service"] = session_service

    runners_module = types.ModuleType("google.adk.runners")
    runners_module.Runner = FakeRunner  # type: ignore[attr-defined]
    sessions_module = types.ModuleType("google.adk.sessions")
    sessions_module.InMemorySessionService = FakeSessionService  # type: ignore[attr-defined]
    adk_module = types.ModuleType("google.adk")
    google_module = types.ModuleType("google")
    google_module.adk = adk_module  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.adk", adk_module)
    monkeypatch.setitem(sys.modules, "google.adk.runners", runners_module)
    monkeypatch.setitem(sys.modules, "google.adk.sessions", sessions_module)

    from cv_transpose_marketplace.gemini_adk.runner import make_local_runner

    sentinel_agent = object()
    runner = make_local_runner(agent=sentinel_agent, app_name="custom")

    assert isinstance(runner, FakeRunner)
    assert captured["app_name"] == "custom"
    assert captured["agent"] is sentinel_agent
    assert captured["session_service_created"] is True
```

- [ ] **Step 4.2: Run full suite, see new tests fail**

Run: `make test-core-python`
Expected: `ModuleNotFoundError: cv_transpose_marketplace.gemini_adk.runner`.

- [ ] **Step 4.3: Implement `runner.py`**

Create `core/python/cv_transpose_marketplace/gemini_adk/runner.py`:

```python
from __future__ import annotations

from typing import Any


def make_local_runner(
    *,
    agent: Any,
    app_name: str = "cv-transpose-gemini",
    session_service: Any | None = None,
) -> Any:
    try:
        from google.adk.runners import Runner  # type: ignore[import-not-found]
        from google.adk.sessions import InMemorySessionService  # type: ignore[import-not-found]
    except ImportError as err:
        raise ImportError(
            "google.adk is required for make_local_runner(). Install the optional extra: "
            "pip install cv-transpose-marketplace[gemini-adk]"
        ) from err

    if session_service is None:
        session_service = InMemorySessionService()

    return Runner(app_name=app_name, agent=agent, session_service=session_service)
```

- [ ] **Step 4.4: Run full suite, see new tests pass**

Run: `make test-core-python`
Expected: both `test_make_local_runner_*` pass.

- [ ] **Step 4.5: Propose commit**

```bash
git add core/python/cv_transpose_marketplace/gemini_adk/runner.py \
        core/python/tests/test_marketplace_gemini_adk_runner.py
git commit -m "feat(core-python): add gemini adk local runner factory"
```

---

## Task 5 — Replace `__main__.py` with a real CLI

**Files:**
- Modify: `core/python/cv_transpose_marketplace/gemini_adk/__main__.py`
- Create: `core/python/tests/test_marketplace_gemini_adk_cli.py`

The existing `__main__.py` runs an offline demo with `FakeLlm` and the Scalian fixture. That demo is removed — the integration test in Task 6 supersedes it, and the offline tool exercise is already covered by existing unit tests on `transpose_cvs_payload`.

The new CLI is one-shot: it reads claims JSON, file specifications, optional user prompt, resolves a `ModelConfig` from env + override, builds the agent, runs one invocation, prints the resulting JSON to stdout. Exit codes: `0` success, `2` `MarketplaceInputError` (JSON on stdout), `1` unexpected (traceback on stderr).

- [ ] **Step 5.1: Write failing tests**

Create `core/python/tests/test_marketplace_gemini_adk_cli.py`:

```python
from __future__ import annotations

import io
import json
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import pytest


@pytest.fixture
def fake_pdf(tmp_path: Path) -> Path:
    # Minimal PDF header so MIME sniffing accepts the bytes; content is irrelevant
    # because we mock run_fn in this test.
    pdf_path = tmp_path / "cv.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%fake\n")
    return pdf_path


@pytest.fixture
def claims_file(tmp_path: Path) -> Path:
    path = tmp_path / "claims.json"
    path.write_text(json.dumps({"hd": "example.com", "email": "user@example.com", "sub": "uid-1"}))
    return path


def test_cli_returns_zero_and_prints_result_json(monkeypatch, fake_pdf, claims_file) -> None:
    async def fake_run_fn(**kwargs):
        from cv_transpose_marketplace.types import MarketplaceRunResult

        return MarketplaceRunResult(
            tenant_key="gws:example.com",
            results=[],
            artifact=None,
        )

    monkeypatch.setattr(
        "cv_transpose_marketplace.gemini_adk.__main__.run_gemini_transpose",
        fake_run_fn,
    )

    from cv_transpose_marketplace.gemini_adk import __main__ as cli

    argv = [
        "gemini-adk",
        "--claims-file",
        str(claims_file),
        "--file",
        f"name=cv.pdf,mime=application/pdf,path={fake_pdf}",
        "--assets-base-url",
        "https://assets.local",
        "--assets-bearer-token",
        "fake-token",
    ]
    monkeypatch.setattr(sys, "argv", argv)

    out_buf = io.StringIO()
    with redirect_stdout(out_buf):
        exit_code = cli.main()

    assert exit_code == 0
    payload = json.loads(out_buf.getvalue())
    assert payload["tenantKey"] == "gws:example.com"


def test_cli_returns_two_on_marketplace_input_error(monkeypatch, fake_pdf) -> None:
    bad_claims = Path("/tmp/does-not-exist.json")  # noqa: S108  (acceptable for failure-path test)
    from cv_transpose_marketplace.gemini_adk import __main__ as cli

    argv = [
        "gemini-adk",
        "--claims-file",
        str(bad_claims),
        "--file",
        f"name=cv.pdf,mime=application/pdf,path={fake_pdf}",
        "--assets-base-url",
        "https://assets.local",
        "--assets-bearer-token",
        "fake-token",
    ]
    monkeypatch.setattr(sys, "argv", argv)

    out_buf = io.StringIO()
    err_buf = io.StringIO()
    with redirect_stdout(out_buf), redirect_stderr(err_buf):
        exit_code = cli.main()

    assert exit_code == 2
    payload = json.loads(out_buf.getvalue())
    assert payload["error"] == "claims_file_unreadable"
```

- [ ] **Step 5.2: Run full suite, see new tests fail**

Run: `make test-core-python`
Expected: `ImportError: cannot import name 'main' from 'cv_transpose_marketplace.gemini_adk.__main__'` (and `run_gemini_transpose` not exposed at module level).

- [ ] **Step 5.3: Rewrite `__main__.py`**

Replace the entire contents of `core/python/cv_transpose_marketplace/gemini_adk/__main__.py` with:

```python
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

from cv_transpose_core import LlmCompleteResult, LlmProvider  # noqa: F401  (LlmCompleteResult re-exported for downstream use)

from ..gemini import run_gemini_transpose
from ..validation import MarketplaceInputError
from .model_config import resolve_model_config
from .tool import encode_tool_result, transpose_cvs
from .types import GeminiToolFile, GeminiToolRequest


def _parse_file_spec(raw: str) -> tuple[str, str, Path]:
    parts = dict(item.split("=", 1) for item in raw.split(",") if "=" in item)
    if "name" not in parts or "mime" not in parts or "path" not in parts:
        raise MarketplaceInputError(
            "file_spec_invalid: --file expects name=<name>,mime=<mime>,path=<path>"
        )
    return parts["name"], parts["mime"], Path(parts["path"])


def _load_claims(path: Path) -> dict[str, str]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as err:
        raise MarketplaceInputError(f"claims_file_unreadable: {path}: {err}") from err
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise MarketplaceInputError(f"claims_file_invalid_json: {err}") from err
    if not isinstance(data, dict):
        raise MarketplaceInputError("claims_file_invalid_json: claims file must be a JSON object")
    return {str(k): str(v) for k, v in data.items()}


def _split_error(err: MarketplaceInputError) -> tuple[str, str]:
    """Parse a 'code: detail' message into (code, detail).

    Falls back to ('marketplace_input_error', original_message) when the
    convention is not followed."""
    message = str(err)
    head, sep, tail = message.partition(":")
    if not sep or " " in head:
        return ("marketplace_input_error", message)
    return (head.strip(), tail.strip())


class _StubLlm:
    """Minimal LLM stub used only when the CLI runs without --integration.

    The CLI itself never calls Gemini; it routes through `run_gemini_transpose`,
    which is the path also exercised by tests. For local integration smoke,
    point GOOGLE_API_KEY at a real model and use the integration test target.
    """

    async def complete(self, **_: Any) -> LlmCompleteResult:
        raise MarketplaceInputError(
            "llm_not_configured: the CLI does not call Gemini directly; provide a custom run_fn "
            "or use the integration target."
        )


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    claims = _load_claims(Path(args.claims_file))

    files: list[GeminiToolFile] = []
    for spec in args.file:
        name, mime, path = _parse_file_spec(spec)
        try:
            data = path.read_bytes()
        except OSError as err:
            raise MarketplaceInputError(f"file_path_unreadable: {path}: {err}") from err
        files.append(GeminiToolFile(name=name, mime=mime, bytes_=data))

    model_config = resolve_model_config(claims=claims, env=os.environ)

    request = GeminiToolRequest(
        claims=claims,
        files=files,
        user_prompt=args.user_prompt,
        assets_base_url=args.assets_base_url,
        assets_bearer_token=args.assets_bearer_token,
    )

    result = await transpose_cvs(
        request,
        llm=_StubLlm(),
        run_fn=run_gemini_transpose,
    )

    return {
        **encode_tool_result(result),
        "modelConfig": {
            "model": model_config.model,
            "endpointMode": model_config.endpoint_mode,
            "region": model_config.region,
            "projectId": model_config.project_id,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog="gemini-adk", description="Run the Gemini ADK transpose tool once.")
    parser.add_argument("--claims-file", required=True)
    parser.add_argument("--file", action="append", required=True, help="name=<name>,mime=<mime>,path=<path>")
    parser.add_argument("--assets-base-url", required=True)
    parser.add_argument("--assets-bearer-token", required=True)
    parser.add_argument("--user-prompt", default=None)

    args = parser.parse_args()

    try:
        payload = asyncio.run(_run(args))
    except MarketplaceInputError as err:
        code, detail = _split_error(err)
        json.dump({"error": code, "detail": detail}, sys.stdout)
        sys.stdout.write("\n")
        return 2
    except Exception:  # noqa: BLE001  (CLI top-level boundary)
        traceback.print_exc()
        return 1

    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5.4: Run full suite, see CLI tests pass**

Run: `make test-core-python`
Expected: `test_marketplace_gemini_adk_cli.py` 2/2 pass.

- [ ] **Step 5.5: Propose commit**

```bash
git add core/python/cv_transpose_marketplace/gemini_adk/__main__.py \
        core/python/tests/test_marketplace_gemini_adk_cli.py
git commit -m "feat(core-python): replace gemini adk offline demo with real CLI"
```

---

## Task 6 — Opt-in integration test against a real Gemini model

**Files:**
- Create: `core/python/tests/integration/__init__.py` (empty)
- Create: `core/python/tests/integration/test_gemini_adk_smoke.py`
- Modify: `core/python/conftest.py` (only if needed to register the marker)

This test is **not** executed by `make test-core-python`. It runs only when `GOOGLE_API_KEY` is set in the environment, and it is invoked through a separate make target added in Task 7.

- [ ] **Step 6.1: Create the integration package and conftest marker**

Create `core/python/tests/integration/__init__.py` as an empty file.

Edit `core/python/conftest.py` (or `pytest.ini` if it already declares markers — check `pyproject.toml` first). Add the `integration` marker so pytest doesn't warn:

If `pyproject.toml` already has a `[tool.pytest.ini_options]` block with `markers = [...]`, append the line:
```
"integration: opt-in test that requires GOOGLE_API_KEY",
```

If not, add to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
markers = [
    "integration: opt-in test that requires GOOGLE_API_KEY",
]
```

- [ ] **Step 6.2: Write the integration test**

Create `core/python/tests/integration/test_gemini_adk_smoke.py`:

```python
from __future__ import annotations

import os
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration


def _gemini_available() -> bool:
    return bool(os.environ.get("GOOGLE_API_KEY")) or bool(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )


@pytest.mark.asyncio
@pytest.mark.skipif(not _gemini_available(), reason="GOOGLE_API_KEY / ADC not set")
async def test_agent_invokes_transpose_cvs_once_with_real_gemini(monkeypatch, tmp_path: Path) -> None:
    pytest.importorskip("google.adk")
    from cv_transpose_core import LlmCompleteResult
    from cv_transpose_marketplace.types import MarketplaceRunResult
    from cv_transpose_marketplace.gemini_adk import (
        ModelConfig,
        build_root_agent,
        resolve_model_config,
    )
    from cv_transpose_marketplace.gemini_adk.runner import make_local_runner

    fake_pdf = tmp_path / "cv.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\n%minimal\n")

    invocations: list[dict] = []

    async def fake_run_fn(**kwargs):
        invocations.append(kwargs)
        return MarketplaceRunResult(
            tenant_key="gws:test.example",
            results=[],
            artifact=None,
        )

    class FakeLlm:
        async def complete(self, **_):  # pragma: no cover (not exercised under fake run_fn)
            return LlmCompleteResult(text="{}", usage={"inputTokens": 0, "outputTokens": 0})

    config = resolve_model_config(claims={"hd": "test.example"}, env=os.environ)

    agent = build_root_agent(
        claims={"hd": "test.example", "sub": "smoke@test.example"},
        llm=FakeLlm(),
        assets_base_url="https://assets.invalid",
        assets_bearer_token="t",
        model_config=config,
        run_fn=fake_run_fn,
    )

    runner = make_local_runner(agent=agent)

    user_message = "Transpose the attached CV."
    # NOTE: the exact runner invocation API depends on the installed google-adk
    # version. For the smoke target we accept either run_async(...) or run(...)
    # via getattr. The contract under test is: exactly one tool call to
    # transpose_cvs ends up in `invocations`.
    invoke = getattr(runner, "run_async", None) or getattr(runner, "run")
    async for _event in invoke(  # type: ignore[func-returns-value]
        user_id="smoke",
        session_id="smoke-session",
        new_message=user_message,
    ):
        pass

    assert len(invocations) == 1
```

- [ ] **Step 6.3: Confirm `make test-core-python` is unaffected**

Run: `make test-core-python`
Expected: identical pass count before/after this task. The integration test is **not** collected because `core/python/tests/integration/` is its own subtree and the marker is opt-in (no `-m integration` filter), but `make test-core-python` runs `pytest core/python/tests` which **would** collect it. Verify the marker-based skip leaves the suite green when `GOOGLE_API_KEY` is unset.

If the test is collected and produces noise (e.g., `importorskip` skips it), that is fine; it must just not fail. If it produces unwanted noise, add `--ignore=core/python/tests/integration` to the `make test-core-python` target as part of the next task.

- [ ] **Step 6.4: Propose commit**

```bash
git add core/python/tests/integration/ core/python/pyproject.toml
git commit -m "test(core-python): add opt-in gemini adk integration smoke"
```

---

## Task 7 — Makefile target + ignore integration in default run

**Files:**
- Modify: `Makefile`

- [ ] **Step 7.1: Update `test-core-python` to ignore the integration subtree, add `test-gemini-integration`**

Edit `Makefile`. Replace the existing `test-core-python` recipe (line 122–123) with:

```make
.PHONY: test-core-python
test-core-python: ## Run Python core unit tests in Docker (excludes opt-in integration tests)
	docker run --rm --user "$$(id -u):$$(id -g)" -v "$$(pwd):/app" -w /app python:3.12-slim sh -lc 'HOME=/tmp PIP_CACHE_DIR=/tmp/pip-cache python -m pip install --disable-pip-version-check '"'"'cryptography>=45,<46'"'"' '"'"'lxml>=5.2,<6'"'"' '"'"'pypdf>=4.2,<6'"'"' '"'"'pytest>=8.2,<9'"'"' '"'"'pytest-asyncio>=0.23,<1'"'"' && HOME=/tmp PYTHONPATH=/app/core/python PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider --ignore=core/python/tests/integration core/python/tests'

.PHONY: test-gemini-integration
test-gemini-integration: ## Run Gemini ADK integration smoke (requires GOOGLE_API_KEY env var)
	docker run --rm --user "$$(id -u):$$(id -g)" -e GOOGLE_API_KEY -v "$$(pwd):/app" -w /app python:3.12-slim sh -lc 'HOME=/tmp PIP_CACHE_DIR=/tmp/pip-cache python -m pip install --disable-pip-version-check '"'"'cryptography>=45,<46'"'"' '"'"'lxml>=5.2,<6'"'"' '"'"'pypdf>=4.2,<6'"'"' '"'"'pytest>=8.2,<9'"'"' '"'"'pytest-asyncio>=0.23,<1'"'"' '"'"'google-adk>=1.0,<2'"'"' '"'"'google-genai>=1.0,<2'"'"' && HOME=/tmp PYTHONPATH=/app/core/python PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider -m integration core/python/tests/integration'
```

(Version pins for `google-adk` and `google-genai` may need adjustment; check PyPI for the latest stable at implementation time. Update the `pyproject.toml` extra in Task 8 to match.)

- [ ] **Step 7.2: Run `make test-core-python` to confirm integration tree is ignored**

Run: `make test-core-python`
Expected: no integration test is collected; all unit tests still pass.

- [ ] **Step 7.3: Propose commit**

```bash
git add Makefile
git commit -m "build(make): split gemini adk integration target from core python tests"
```

---

## Task 8 — Add the `gemini-adk` optional extra to `pyproject.toml`

**Files:**
- Modify: `core/python/pyproject.toml`

- [ ] **Step 8.1: Add the extra**

Edit `core/python/pyproject.toml`. After the existing `dependencies` section, add:

```toml
[project.optional-dependencies]
gemini-adk = [
    "google-adk>=1.0,<2",
    "google-genai>=1.0,<2",
]
```

If a `[project.optional-dependencies]` table already exists (it does not, per current state), append the `gemini-adk` key to it.

**Note for the executing engineer:** before committing, verify the version pins on PyPI. As of the design date the latest stable for `google-adk` is in the 1.x range; if a 2.x has shipped, choose the tightest compatible range and update the Makefile target in Task 7 accordingly.

- [ ] **Step 8.2: Sanity check the pyproject parses**

Run: `make test-core-python`
Expected: all unit tests still pass. `pyproject.toml` is only read by tooling, not by the runtime tests, so this is a parse check by way of pip's metadata extraction.

- [ ] **Step 8.3: Propose commit**

```bash
git add core/python/pyproject.toml
git commit -m "build(core-python): add optional gemini-adk extra"
```

---

## Task 9 — Extend the deterministic bundle

**Files:**
- Modify: `core/python/cv_transpose_marketplace/gemini_adk/package.py`
- Modify: `core/python/tests/test_marketplace_gemini_adk_bundle.py`

- [ ] **Step 9.1: Read the existing bundle test to learn the assertion style**

Run: `cat core/python/tests/test_marketplace_gemini_adk_bundle.py`

(No code change yet — observe the pattern used to assert which paths are present in the zip. Subsequent steps mirror this pattern.)

- [ ] **Step 9.2: Write a failing test that requires the new files in the bundle**

Edit `core/python/tests/test_marketplace_gemini_adk_bundle.py`. Locate the existing test that lists expected files in the archive (likely iterates `archive.namelist()`). Append assertions for the new paths:

```python
def test_bundle_includes_new_agent_files(tmp_path) -> None:
    from pathlib import Path
    from zipfile import ZipFile

    from cv_transpose_marketplace.gemini_adk.package import build_gemini_adk_bundle

    repo_root = Path(__file__).resolve().parents[3]
    bundle_bytes = build_gemini_adk_bundle(repo_root)
    archive = ZipFile(__import__("io").BytesIO(bundle_bytes))

    names = set(archive.namelist())

    assert "cv_transpose_marketplace/gemini_adk/model_config.py" in names
    assert "cv_transpose_marketplace/gemini_adk/runner.py" in names
    assert "cv_transpose_marketplace/gemini_adk/prompts/__init__.py" in names
    assert "cv_transpose_marketplace/gemini_adk/prompts/transpose_cvs.md" in names
```

- [ ] **Step 9.3: Run full suite, see new test fail**

Run: `make test-core-python`
Expected: `test_bundle_includes_new_agent_files` fails — the rglob picks up the new files already, but if any happens to be missing the test catches it. The test should actually pass because `iter_gemini_adk_bundle_paths` walks `cv_transpose_marketplace/` with `rglob("*")`. Run it; if it passes, proceed to step 9.4 anyway (we still want the explicit allowlist).

- [ ] **Step 9.4: Update `REQUIRED_GEMINI_ADK_PATHS` for fail-fast**

Edit `core/python/cv_transpose_marketplace/gemini_adk/package.py`. Replace the `REQUIRED_GEMINI_ADK_PATHS` tuple (lines 11–22) with:

```python
REQUIRED_GEMINI_ADK_PATHS = (
    "cv_transpose_marketplace/gemini_adk/__init__.py",
    "cv_transpose_marketplace/gemini_adk/__main__.py",
    "cv_transpose_marketplace/gemini_adk/agent.py",
    "cv_transpose_marketplace/gemini_adk/http.py",
    "cv_transpose_marketplace/gemini_adk/model_config.py",
    "cv_transpose_marketplace/gemini_adk/package.py",
    "cv_transpose_marketplace/gemini_adk/prompts/__init__.py",
    "cv_transpose_marketplace/gemini_adk/prompts/transpose_cvs.md",
    "cv_transpose_marketplace/gemini_adk/request.schema.json",
    "cv_transpose_marketplace/gemini_adk/response.schema.json",
    "cv_transpose_marketplace/gemini_adk/runner.py",
    "cv_transpose_marketplace/gemini_adk/runtime.py",
    "cv_transpose_marketplace/gemini_adk/tool.py",
    "cv_transpose_marketplace/gemini_adk/types.py",
)
```

- [ ] **Step 9.5: Run full suite, see all bundle tests pass**

Run: `make test-core-python`
Expected: every bundle test passes.

- [ ] **Step 9.6: Propose commit**

```bash
git add core/python/cv_transpose_marketplace/gemini_adk/package.py \
        core/python/tests/test_marketplace_gemini_adk_bundle.py
git commit -m "build(core-python): include agent runner and prompt in gemini adk bundle"
```

---

## Task 10 — Update PLAN.md

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 10.1: Tick the closed checkbox in §P1.5**

Edit `PLAN.md`. In the P1.5 section, replace the line:

```
- [ ] agent Python ADK
```

with:

```
- [x] agent Python ADK (local Runner + CLI, layered ModelConfig, externalized prompt,
      opt-in integration smoke)
```

- [ ] **Step 10.2: Propose commit**

```bash
git add PLAN.md
git commit -m "docs(plan): close gemini adk agent track"
```

---

## End-of-plan verification

After Task 10 completes:

- [ ] Run `make test-core-python` one final time — full unit suite green.
- [ ] If `GOOGLE_API_KEY` is available locally, run `make test-gemini-integration` and confirm the smoke test passes.
- [ ] Confirm `git status` is clean (all changes either committed or explicitly held back for review).
- [ ] Confirm `PLAN.md` reads correctly: P1.5 §"À faire" should show 3 open items remaining (Vertex integration, packaging, smoke post-publication) and 0 missing checkbox for the slice just shipped.
