from __future__ import annotations

import pytest

from cv_transpose_core.types import (
    AlignmentReport,
    DetectedFields,
    TransposedCv,
    Usage,
)
from cv_transpose_marketplace.gemini_adk import (
    GeminiToolFile,
    GeminiToolRequest,
    transpose_cvs,
    transpose_cvs_payload,
)
from cv_transpose_marketplace.types import MarketplaceRunResult, OutputArtifact


def make_result() -> TransposedCv:
    return TransposedCv(
        source_file_name="candidate.pdf",
        output_docx_name="Candidate.docx",
        output_docx=b"PK\x03\x04docx",
        profile={"name": "Candidate"},
        source_text="cv text",
        usage=Usage(input_tokens=1, output_tokens=2, total_tokens=3),
        alignment_report=AlignmentReport(
            validation_passed=True,
            warnings=["trimmed title"],
            detected_fields=DetectedFields(
                experience_count=1,
                education_count=1,
                skill_buckets=1,
                languages_count=1,
            ),
            page1_sections_found=["experiences"],
            missing_required_sections=[],
            retries_used=0,
        ),
        errors=[],
    )


@pytest.mark.asyncio
async def test_transpose_cvs_maps_request_and_builds_report_card() -> None:
    captured: dict[str, object] = {}

    async def fake_run_gemini_transpose(**kwargs):
        captured.update(kwargs)
        return MarketplaceRunResult(
            tenant_key="gws:workspace.example",
            results=[make_result()],
            artifact=OutputArtifact(
                name="Candidate.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes_=b"PK\x03\x04docx",
            ),
        )

    result = await transpose_cvs(
        GeminiToolRequest(
            claims={"hd": "workspace.example", "email": "user@workspace.example"},
            files=[GeminiToolFile(name="candidate.pdf", mime="application/pdf", bytes_=b"pdf-bytes")],
            user_prompt="TARGET: Fabrikam",
            assets_base_url="https://cv-api.sent-tech.ca",
            assets_bearer_token="signed.jwt.token",
        ),
        llm=object(),
        run_fn=fake_run_gemini_transpose,
    )

    assert captured["claims"] == {"hd": "workspace.example", "email": "user@workspace.example"}
    assert captured["assets_base_url"] == "https://cv-api.sent-tech.ca"
    assert captured["assets_bearer_token"] == "signed.jwt.token"
    files = captured["files"]
    assert len(files) == 1
    assert files[0].name == "candidate.pdf"
    assert files[0].mime == "application/pdf"
    assert files[0].bytes_ == b"pdf-bytes"
    assert result.tenant_key == "gws:workspace.example"
    assert result.artifact is not None
    assert result.report_card == {
        "files": 1,
        "succeeded": 1,
        "failed": 0,
        "warnings": 1,
        "alignmentScore": 100,
        "items": [
            {
                "sourceFileName": "candidate.pdf",
                "outputDocxName": "Candidate.docx",
                "validationPassed": True,
                "warnings": ["trimmed title"],
                "sectionsDetected": ["experiences"],
                "missingRequiredSections": [],
                "retriesUsed": 0,
            }
        ],
    }


@pytest.mark.asyncio
async def test_transpose_cvs_payload_accepts_json_friendly_args() -> None:
    captured: dict[str, object] = {}

    async def fake_run_gemini_transpose(**kwargs):
        captured.update(kwargs)
        return MarketplaceRunResult(
            tenant_key="gws:workspace.example",
            results=[make_result()],
            artifact=OutputArtifact(
                name="Candidate.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes_=b"PK\x03\x04docx",
            ),
        )

    result = await transpose_cvs_payload(
        claims={"hd": "workspace.example", "email": "user@workspace.example"},
        files=[
            {
                "name": "candidate.pdf",
                "contentType": "application/pdf",
                "bytesBase64": "cGRmLWJ5dGVz",
            }
        ],
        assets_base_url="https://cv-api.sent-tech.ca",
        assets_bearer_token="signed.jwt.token",
        assets_cache_ttl_seconds=300,
        user_prompt="TARGET: Fabrikam",
        llm=object(),
        run_fn=fake_run_gemini_transpose,
    )

    assert captured["claims"] == {"hd": "workspace.example", "email": "user@workspace.example"}
    assert captured["assets_base_url"] == "https://cv-api.sent-tech.ca"
    assert captured["assets_bearer_token"] == "signed.jwt.token"
    assert captured["assets_cache_ttl_seconds"] == 300
    files = captured["files"]
    assert len(files) == 1
    assert files[0].bytes_ == b"pdf-bytes"
    assert result["tenantKey"] == "gws:workspace.example"
    assert result["artifact"]["name"] == "Candidate.docx"
    assert result["reportCard"]["alignmentScore"] == 100
