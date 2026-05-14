from __future__ import annotations

from io import BytesIO
from typing import Any, Callable, Sequence
from zipfile import ZIP_DEFLATED, ZipFile

from cv_transpose_core import ExtractionOptions, InputFile, LlmProvider, TemplateAssets, transpose
from cv_transpose_core.types import TransposeInput, TransposedCv

from .types import MarketplaceRunResult, OutputArtifact


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
ZIP_MIME = "application/zip"


def _apply_user_prompt(files: Sequence[InputFile], user_prompt: str | None) -> list[InputFile]:
    if user_prompt is None:
        return list(files)
    return [
        InputFile(
            name=file.name,
            bytes_=file.bytes_,
            mime=file.mime,
            user_prompt_override=user_prompt,
        )
        for file in files
    ]


def _unique_name(name: str, counts: dict[str, int]) -> str:
    seen = counts.get(name, 0) + 1
    counts[name] = seen
    if seen == 1:
        return name
    stem, dot, suffix = name.rpartition(".")
    if not dot:
        return f"{name}_{seen}"
    return f"{stem}_{seen}.{suffix}"


def build_output_artifact(results: list[TransposedCv]) -> OutputArtifact | None:
    successful_results = [result for result in results if not result.errors]
    if not successful_results:
        return None
    if len(successful_results) == 1:
        result = successful_results[0]
        return OutputArtifact(
            name=result.output_docx_name,
            mime=DOCX_MIME,
            bytes_=result.output_docx,
        )

    counts: dict[str, int] = {}
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for result in successful_results:
            archive.writestr(_unique_name(result.output_docx_name, counts), result.output_docx)
    return OutputArtifact(
        name="transpose-results.zip",
        mime=ZIP_MIME,
        bytes_=buffer.getvalue(),
    )


async def run_marketplace_transpose(
    *,
    tenant_key: str,
    files: Sequence[InputFile],
    llm: LlmProvider,
    template_assets: TemplateAssets,
    user_prompt: str | None = None,
    extraction: ExtractionOptions | None = None,
    transpose_fn: Callable[[TransposeInput], Any] = transpose,
) -> MarketplaceRunResult:
    transpose_output = await transpose_fn(
        TransposeInput(
            files=_apply_user_prompt(files, user_prompt),
            template=template_assets,
            persistence="ephemeral",
            llm=llm,
            extraction=extraction,
        )
    )
    return MarketplaceRunResult(
        tenant_key=tenant_key,
        results=transpose_output.results,
        artifact=build_output_artifact(transpose_output.results),
    )
