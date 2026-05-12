import pytest

from cv_transpose_core.extract import UnsupportedMimeError, extract_text_from_bytes


def test_extract_text_from_fixture_pdf(repo_root):
    data = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    text = extract_text_from_bytes(data, "cv-001-junior-pm.pdf", "application/pdf")

    assert "Jane Smith" in text
    assert len(text) > 50


def test_extract_text_from_docx_fixture(repo_root):
    data = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()

    text = extract_text_from_bytes(
        data,
        "base.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    assert isinstance(text, str)


def test_extract_doc_is_rejected_without_libreoffice():
    with pytest.raises(UnsupportedMimeError, match="unsupported_mime"):
        extract_text_from_bytes(b"legacy", "old.doc", "application/msword")
