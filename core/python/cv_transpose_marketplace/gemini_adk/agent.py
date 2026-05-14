from __future__ import annotations

from .tool import transpose_cvs


def build_root_agent():
    try:
      from google.adk.agents import Agent  # type: ignore[import-not-found]
    except ImportError:
        return {
            "name": "cv_transpose_gemini",
            "tool_names": ["transpose_cvs"],
            "instruction": "Accept CV attachments and call transpose_cvs.",
        }

    return Agent(
        name="cv_transpose_gemini",
        description="Transpose attached CVs into the enterprise DOCX template.",
        instruction="Accept CV attachments and call transpose_cvs.",
        tools=[transpose_cvs],
    )


root_agent = build_root_agent()
