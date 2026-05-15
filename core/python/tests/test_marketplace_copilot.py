from __future__ import annotations

import json
import zipfile
from io import BytesIO

import pytest

from cv_transpose_core import BrandTokens, InputFile, TemplateAssets, transpose
from cv_transpose_core.types import (
    AlignmentReport,
    DetectedFields,
    LlmCompleteResult,
    TransposeOutput,
    TransposedCv,
    Usage,
)
from cv_transpose_marketplace.copilot import run_copilot_transpose
from cv_transpose_marketplace.validation import MarketplaceInputError


class FakeLlm:
    def __init__(self, profile: dict) -> None:
        self.profile = profile

    async def complete(self, **kwargs):
        return LlmCompleteResult(text=json.dumps(self.profile), usage={"inputTokens": 10, "outputTokens": 20})


def make_warning_result() -> TransposedCv:
    return TransposedCv(
        source_file_name="candidate.pdf",
        output_docx_name="Candidate.docx",
        output_docx=b"PK\x03\x04docx",
        profile={"name": "Candidate"},
        source_text="cv text",
        usage=Usage(input_tokens=1, output_tokens=2, total_tokens=3),
        alignment_report=AlignmentReport(
            validation_passed=False,
            warnings=["Page 1 overflow: sector section missing from page 1"],
            detected_fields=DetectedFields(
                experience_count=1,
                education_count=1,
                skill_buckets=1,
                languages_count=1,
            ),
            page1_sections_found=["WORK EXPERIENCE"],
            missing_required_sections=[],
            retries_used=1,
        ),
        errors=[],
    )


@pytest.mark.asyncio
async def test_run_copilot_transpose_returns_single_docx_attachment(repo_root, expected_profile) -> None:
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    captured: dict[str, object] = {}

    def make_bearer_token(tenant_key: str, claims: dict[str, object]) -> str:
        captured["tenant_key"] = tenant_key
        captured["claims"] = claims
        return "signed.jwt.token"

    def fetch_assets(**kwargs) -> TemplateAssets:
        captured["assets_kwargs"] = kwargs
        return TemplateAssets(
            manifest=manifest,
            base_docx=base_docx,
            brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
        )

    result = await run_copilot_transpose(
        claims={"tid": "123E4567-E89B-12D3-A456-426614174000", "upn": "user@example.com"},
        files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        make_bearer_token=make_bearer_token,
        fetch_assets=fetch_assets,
    )

    assert result.tenant_key == "ms:123e4567-e89b-12d3-a456-426614174000"
    assert captured["tenant_key"] == result.tenant_key
    assert captured["assets_kwargs"] == {
        "base_url": "https://cv-api.sent-tech.ca",
        "tenant_key": result.tenant_key,
        "bearer_token": "signed.jwt.token",
        "cache_ttl_seconds": 0,
    }
    assert len(result.attachments) == 1
    assert result.attachments[0].name == "Scalian_Profile_Jane_Smith.docx"
    assert result.attachments[0].content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert result.attachments[0].bytes_[:4] == b"PK\x03\x04"
    assert result.card["type"] == "AdaptiveCard"
    assert result.card["body"][0]["text"] == "CV Transpose"
    assert result.alignment_report["files"] == 1
    assert "alignmentScore" in result.alignment_report
    assert any(fact["title"] == "Alignment" for fact in result.card["body"][1]["facts"])


@pytest.mark.asyncio
async def test_run_copilot_transpose_zips_multiple_successes(repo_root, expected_profile) -> None:
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    def fetch_assets(**kwargs) -> TemplateAssets:
        return TemplateAssets(
            manifest=manifest,
            base_docx=base_docx,
            brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
        )

    result = await run_copilot_transpose(
        claims={"tid": "123e4567-e89b-12d3-a456-426614174000"},
        files=[
            InputFile(name="cv-001-a.pdf", bytes_=cv, mime="application/pdf"),
            InputFile(name="cv-001-b.pdf", bytes_=cv, mime="application/pdf"),
        ],
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        make_bearer_token=lambda tenant_key, claims: "signed.jwt.token",
        fetch_assets=fetch_assets,
    )

    assert len(result.attachments) == 1
    assert result.attachments[0].name == "transpose-results.zip"
    assert result.attachments[0].content_type == "application/zip"

    archive = zipfile.ZipFile(BytesIO(result.attachments[0].bytes_))
    assert sorted(archive.namelist()) == [
        "Scalian_Profile_Jane_Smith.docx",
        "Scalian_Profile_Jane_Smith_2.docx",
    ]


@pytest.mark.asyncio
async def test_run_copilot_transpose_passes_user_prompt_override(repo_root, expected_profile) -> None:
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    seen_prompt: list[str | None] = []

    async def fake_transpose(input_):
        seen_prompt.extend(file.user_prompt_override for file in input_.files)
        return await transpose(input_)

    result = await run_copilot_transpose(
        claims={"tid": "123e4567-e89b-12d3-a456-426614174000"},
        files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        make_bearer_token=lambda tenant_key, claims: "signed.jwt.token",
        fetch_assets=lambda **kwargs: TemplateAssets(
            manifest=manifest,
            base_docx=base_docx,
            brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
        ),
        user_prompt="TARGET: Contoso",
        transpose_fn=fake_transpose,
    )

    assert result.transpose_output.results[0].errors == []
    assert seen_prompt == ["TARGET: Contoso"]


@pytest.mark.asyncio
async def test_run_copilot_transpose_propagates_warning_alignment_report(repo_root, expected_profile) -> None:
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    async def fake_transpose(_input):
        return TransposeOutput(results=[make_warning_result()])

    result = await run_copilot_transpose(
        claims={"tid": "123e4567-e89b-12d3-a456-426614174000"},
        files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        make_bearer_token=lambda tenant_key, claims: "signed.jwt.token",
        fetch_assets=lambda **kwargs: TemplateAssets(
            manifest=manifest,
            base_docx=base_docx,
            brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
        ),
        transpose_fn=fake_transpose,
    )

    assert result.alignment_report == {
        "files": 1,
        "succeeded": 1,
        "failed": 0,
        "warnings": 1,
        "alignmentScore": 0,
        "items": [
            {
                "sourceFileName": "candidate.pdf",
                "outputDocxName": "Candidate.docx",
                "validationPassed": False,
                "warnings": ["Page 1 overflow: sector section missing from page 1"],
                "sectionsDetected": ["WORK EXPERIENCE"],
                "missingRequiredSections": [],
                "retriesUsed": 1,
            }
        ],
    }
    facts = {fact["title"]: fact["value"] for fact in result.card["body"][1]["facts"]}
    assert facts["Warnings"] == "1"
    assert facts["Alignment"] == "0%"


@pytest.mark.asyncio
async def test_run_copilot_transpose_rejects_legacy_doc_before_fetching_assets() -> None:
    with pytest.raises(MarketplaceInputError, match=r"\.doc"):
        await run_copilot_transpose(
            claims={"tid": "123e4567-e89b-12d3-a456-426614174000"},
            files=[InputFile(name="legacy.doc", bytes_=b"legacy-doc", mime="application/msword")],
            llm=object(),  # type: ignore[arg-type]
            assets_base_url="https://cv-api.sent-tech.ca",
            make_bearer_token=lambda tenant_key, claims: (_ for _ in ()).throw(
                AssertionError("make_bearer_token should not be called for legacy .doc")
            ),
            fetch_assets=lambda **kwargs: (_ for _ in ()).throw(
                AssertionError("fetch_assets should not be called for legacy .doc")
            ),
        )
