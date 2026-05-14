from __future__ import annotations

from cv_transpose_core import InputFile, LlmProvider

from ..gemini import run_gemini_transpose
from .types import GeminiToolRequest, GeminiToolResult


def _build_report_card(results) -> dict[str, int]:
    successful = sum(1 for result in results if not result.errors)
    failed = len(results) - successful
    warnings = sum(len(result.alignment_report.warnings) for result in results)
    return {
        "files": len(results),
        "succeeded": successful,
        "failed": failed,
        "warnings": warnings,
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
    )
    return GeminiToolResult(
        tenant_key=result.tenant_key,
        artifact=result.artifact,
        report_card=_build_report_card(result.results),
        results=result.results,
    )
