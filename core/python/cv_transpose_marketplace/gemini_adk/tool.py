from __future__ import annotations

import base64
import copy
from typing import Any, Awaitable, Callable, Mapping, Sequence

from cv_transpose_core import InputFile, LlmProvider

from ..gemini import run_gemini_transpose
from ..report import build_alignment_report
from .types import GeminiToolFile, GeminiToolRequest, GeminiToolResult


_TRANSPOSE_CVS_FUNCTION_DECLARATION: dict[str, Any] = {
    "name": "transpose_cvs",
    "description": (
        "Transpose attached CV documents (PDF or DOCX) into the enterprise template "
        "for the calling Google Workspace tenant. Returns the generated artifact and "
        "a structured alignment report. Does not keep conversational memory; call "
        "exactly once per user request."
    ),
    "parameters": {
        "type": "object",
        "required": ["files"],
        "properties": {
            "files": {
                "type": "array",
                "description": "Candidate CV files attached to the user request.",
                "items": {
                    "type": "object",
                    "required": ["name", "contentType", "bytesBase64"],
                    "properties": {
                        "name": {"type": "string"},
                        "contentType": {
                            "type": "string",
                            "description": "MIME type. Only application/pdf and application/vnd.openxmlformats-officedocument.wordprocessingml.document are accepted.",
                        },
                        "bytesBase64": {
                            "type": "string",
                            "description": "Base64-encoded file bytes.",
                        },
                    },
                },
            },
            "user_prompt": {
                "type": "string",
                "description": "Optional natural-language guidance (e.g., target language or target company).",
            },
        },
    },
}


def build_transpose_cvs_function_declaration() -> dict[str, Any]:
    return copy.deepcopy(_TRANSPOSE_CVS_FUNCTION_DECLARATION)


def encode_tool_result(result: GeminiToolResult) -> dict[str, Any]:
    return {
        "tenantKey": result.tenant_key,
        "artifact": None
        if result.artifact is None
        else {
            "name": result.artifact.name,
            "mime": result.artifact.mime,
            "bytesBase64": base64.b64encode(result.artifact.bytes_).decode("ascii"),
        },
        "reportCard": result.report_card,
    }


async def transpose_cvs(
    request: GeminiToolRequest,
    *,
    llm: LlmProvider,
    run_fn=run_gemini_transpose,
) -> GeminiToolResult:
    result = await run_fn(
        claims=request.claims,
        files=[
            InputFile(name=file.name, bytes_=file.bytes_, mime=file.mime)
            for file in request.files
        ],
        llm=llm,
        assets_base_url=request.assets_base_url,
        assets_bearer_token=request.assets_bearer_token,
        user_prompt=request.user_prompt,
        assets_cache_ttl_seconds=request.assets_cache_ttl_seconds,
    )
    return GeminiToolResult(
        tenant_key=result.tenant_key,
        artifact=result.artifact,
        report_card=build_alignment_report(result.results),
        results=result.results,
    )


async def transpose_cvs_payload(
    *,
    claims: Mapping[str, str],
    files: Sequence[Mapping[str, Any]],
    assets_base_url: str,
    assets_bearer_token: str,
    llm: LlmProvider,
    user_prompt: str | None = None,
    assets_cache_ttl_seconds: int = 0,
    run_fn=run_gemini_transpose,
) -> dict[str, Any]:
    """Run the Gemini ADK transpose_cvs tool from a JSON-friendly payload.

    This is the full plumbing entry: the LLM should never see all of these
    parameters. For the LLM-facing surface bound to a specific runtime context,
    use ``make_transpose_cvs_tool``.
    """
    request = GeminiToolRequest(
        claims=dict(claims),
        files=[
            GeminiToolFile(
                name=str(item["name"]),
                mime=str(item.get("mime") or item["contentType"]),
                bytes_=base64.b64decode(str(item["bytesBase64"])),
            )
            for item in files
        ],
        assets_base_url=assets_base_url,
        assets_bearer_token=assets_bearer_token,
        user_prompt=user_prompt,
        assets_cache_ttl_seconds=assets_cache_ttl_seconds,
    )
    return encode_tool_result(await transpose_cvs(request, llm=llm, run_fn=run_fn))


def make_transpose_cvs_tool(
    *,
    claims: Mapping[str, str],
    llm: LlmProvider,
    assets_base_url: str,
    assets_bearer_token: str,
    assets_cache_ttl_seconds: int = 0,
    run_fn: Callable[..., Awaitable[Any]] = run_gemini_transpose,
) -> Callable[..., Awaitable[dict[str, Any]]]:
    """Build an LLM-callable tool function bound to a runtime context.

    The returned coroutine accepts only the LLM-facing arguments
    (``files`` and ``user_prompt``) so it can be passed directly to an
    ADK ``Agent(tools=[...])`` without exposing identity, bearer tokens
    or other plumbing to the model.
    """
    bound_claims = dict(claims)

    async def transpose_cvs_tool(
        files: Sequence[Mapping[str, Any]],
        user_prompt: str | None = None,
    ) -> dict[str, Any]:
        return await transpose_cvs_payload(
            claims=bound_claims,
            files=files,
            llm=llm,
            assets_base_url=assets_base_url,
            assets_bearer_token=assets_bearer_token,
            user_prompt=user_prompt,
            assets_cache_ttl_seconds=assets_cache_ttl_seconds,
            run_fn=run_fn,
        )

    transpose_cvs_tool.__name__ = "transpose_cvs"
    transpose_cvs_tool.__doc__ = _TRANSPOSE_CVS_FUNCTION_DECLARATION["description"]
    return transpose_cvs_tool
