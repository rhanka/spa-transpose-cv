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
