from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Any, Callable, Mapping, Sequence
from zipfile import ZIP_DEFLATED, ZipFile

from cv_transpose_core import InputFile, LlmProvider, TemplateAssets, TransposeOutput, transpose
from cv_transpose_core.types import TransposeInput

from .assets import fetch_template_assets
from .identity import derive_tenant_key_from_claims
from .report import build_alignment_report
from .validation import validate_marketplace_files


DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
ZIP_CONTENT_TYPE = "application/zip"


@dataclass(frozen=True)
class CopilotAttachment:
    name: str
    content_type: str
    bytes_: bytes


@dataclass(frozen=True)
class CopilotActionResult:
    tenant_key: str
    attachments: list[CopilotAttachment]
    card: dict[str, Any]
    transpose_output: TransposeOutput
    alignment_report: dict[str, Any] = field(
        default_factory=lambda: {
            "files": 0,
            "succeeded": 0,
            "failed": 0,
            "warnings": 0,
            "alignmentScore": 0,
            "items": [],
        }
    )


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


def _build_attachments(transpose_output: TransposeOutput) -> list[CopilotAttachment]:
    successful_results = [result for result in transpose_output.results if not result.errors]
    if not successful_results:
        return []

    if len(successful_results) == 1:
        result = successful_results[0]
        return [
            CopilotAttachment(
                name=result.output_docx_name,
                content_type=DOCX_CONTENT_TYPE,
                bytes_=result.output_docx,
            )
        ]

    buffer = BytesIO()
    counts: dict[str, int] = {}
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for result in successful_results:
            archive.writestr(_unique_name(result.output_docx_name, counts), result.output_docx)
    return [CopilotAttachment(name="transpose-results.zip", content_type=ZIP_CONTENT_TYPE, bytes_=buffer.getvalue())]


def _build_adaptive_card(transpose_output: TransposeOutput) -> dict[str, Any]:
    report = build_alignment_report(transpose_output.results)
    item_blocks = []
    for item in report["items"][:5]:
        sections = ", ".join(item["sectionsDetected"]) or "-"
        warnings = ", ".join(item["warnings"]) or "none"
        item_blocks.extend(
            [
                {
                    "type": "TextBlock",
                    "text": str(item["outputDocxName"]),
                    "weight": "Bolder",
                    "wrap": True,
                },
                {
                    "type": "TextBlock",
                    "text": f"Sections: {sections} | Warnings: {warnings}",
                    "wrap": True,
                },
            ]
        )

    return {
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": [
            {
                "type": "TextBlock",
                "text": "CV Transpose",
                "weight": "Bolder",
                "wrap": True,
            },
            {
                "type": "FactSet",
                "facts": [
                    {"title": "Files", "value": str(report["files"])},
                    {"title": "Succeeded", "value": str(report["succeeded"])},
                    {"title": "Failed", "value": str(report["failed"])},
                    {"title": "Warnings", "value": str(report["warnings"])},
                    {"title": "Alignment", "value": f'{report["alignmentScore"]}%'},
                ],
            },
            *item_blocks,
        ],
    }


async def run_copilot_transpose(
    *,
    claims: Mapping[str, object],
    files: Sequence[InputFile],
    llm: LlmProvider,
    assets_base_url: str,
    make_bearer_token: Callable[[str, Mapping[str, object]], str],
    user_prompt: str | None = None,
    fetch_assets: Callable[..., TemplateAssets] = fetch_template_assets,
    transpose_fn: Callable[[TransposeInput], Any] = transpose,
) -> CopilotActionResult:
    string_claims = {key: str(value) for key, value in claims.items() if value is not None}
    validate_marketplace_files(files)
    tenant_key = derive_tenant_key_from_claims("ms", string_claims)
    bearer_token = make_bearer_token(tenant_key, claims)
    template_assets = fetch_assets(
        base_url=assets_base_url,
        tenant_key=tenant_key,
        bearer_token=bearer_token,
    )
    transpose_output = await transpose_fn(
        TransposeInput(
            files=_apply_user_prompt(files, user_prompt),
            template=template_assets,
            persistence="ephemeral",
            llm=llm,
        )
    )
    alignment_report = build_alignment_report(transpose_output.results)
    return CopilotActionResult(
        tenant_key=tenant_key,
        attachments=_build_attachments(transpose_output),
        card=_build_adaptive_card(transpose_output),
        alignment_report=alignment_report,
        transpose_output=transpose_output,
    )
