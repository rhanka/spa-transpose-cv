from __future__ import annotations

import base64
from typing import Any, Mapping, Sequence

from cv_transpose_core import InputFile, LlmProvider

from ..gemini import run_gemini_transpose
from ..report import build_alignment_report
from .types import GeminiToolFile, GeminiToolRequest, GeminiToolResult


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
