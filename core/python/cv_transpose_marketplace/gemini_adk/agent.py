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


def _resolve_instruction(instruction: str | None) -> str:
    return instruction if instruction is not None else load_system_instruction()


def build_agent_descriptor(
    *,
    model_config: ModelConfig,
    instruction: str | None = None,
) -> dict[str, Any]:
    """SDK-free descriptor for the Gemini ADK agent.

    Included in the deterministic bundle for traceability. The
    `instruction_sha256` field lets bundle consumers detect prompt drift
    between releases without diffing the prompt body.
    """
    resolved_instruction = _resolve_instruction(instruction)
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
    """Build the live `google.adk.agents.Agent` bound to a runtime context.

    Requires the `gemini-adk` optional extra (`pip install
    cv-transpose-marketplace[gemini-adk]`).

    `model_config` describes routing, but only `model_config.model` is
    forwarded to `Agent(...)`. Endpoint mode (`vertex` vs `ai_studio`),
    region, and project_id are consumed by `google.genai` through the
    process environment (`GOOGLE_GENAI_USE_VERTEXAI`,
    `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`). Callers are
    responsible for setting those env vars before building the agent.
    """
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
        instruction=_resolve_instruction(instruction),
        tools=[tool],
    )
