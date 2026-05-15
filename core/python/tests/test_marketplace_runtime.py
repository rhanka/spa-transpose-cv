from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

import pytest

from cv_transpose_core.types import (
    AlignmentReport,
    DetectedFields,
    TransposedCv,
    Usage,
)
from cv_transpose_marketplace.runtime import build_output_artifact
from cv_transpose_marketplace.validation import MarketplaceInputError, validate_marketplace_file


def make_result(name: str, *, errors: list[str] | None = None) -> TransposedCv:
    return TransposedCv(
        source_file_name=f"{name}.pdf",
        output_docx_name=f"{name}.docx",
        output_docx=b"PK\x03\x04payload",
        profile={"name": "Candidate"},
        source_text="cv text",
        usage=Usage(input_tokens=1, output_tokens=2, total_tokens=3),
        alignment_report=AlignmentReport(
            validation_passed=True,
            warnings=[],
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
        errors=errors or [],
    )


def test_build_output_artifact_returns_single_docx_for_one_success() -> None:
    artifact = build_output_artifact([make_result("alpha")])

    assert artifact is not None
    assert artifact.name == "alpha.docx"
    assert artifact.mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert artifact.bytes_[:4] == b"PK\x03\x04"


def test_build_output_artifact_returns_zip_for_multiple_successes_with_deduped_names() -> None:
    artifact = build_output_artifact([make_result("alpha"), make_result("alpha")])

    assert artifact is not None
    assert artifact.name == "transpose-results.zip"
    assert artifact.mime == "application/zip"

    archive = ZipFile(BytesIO(artifact.bytes_))
    assert sorted(archive.namelist()) == ["alpha.docx", "alpha_2.docx"]


def test_build_output_artifact_returns_none_when_everything_failed() -> None:
    artifact = build_output_artifact([make_result("alpha", errors=["boom"])])

    assert artifact is None


def test_validate_marketplace_file_rejects_legacy_doc_by_extension() -> None:
    with pytest.raises(MarketplaceInputError, match=r"\.doc"):
        validate_marketplace_file(name="legacy.doc", mime="application/pdf")


def test_validate_marketplace_file_allows_docx_when_mime_is_msword() -> None:
    assert validate_marketplace_file(
        name="candidate.docx",
        mime="application/msword",
    ) == "docx"
