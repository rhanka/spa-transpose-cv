from io import BytesIO
from zipfile import ZipFile

import pytest

from cv_transpose_core import extract
from cv_transpose_core.extract import TextExtractionError, UnsupportedMimeError, extract_text_from_bytes


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _docx_bytes(document_xml: bytes | None) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as zf:
        if document_xml is not None:
            zf.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def test_extract_text_from_fixture_pdf(repo_root):
    data = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    text = extract_text_from_bytes(data, "cv-001-junior-pm.pdf", "application/pdf")

    assert "Jane Smith" in text
    assert len(text) > 50


def test_extract_text_from_in_memory_docx():
    data = _docx_bytes(
        b"""<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First</w:t></w:r><w:r><w:t> paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
  </w:body>
</w:document>"""
    )

    text = extract_text_from_bytes(
        data,
        "base.docx",
        DOCX_MIME,
    )

    assert text == "First paragraph\nSecond paragraph"


def test_extract_pdf_rejects_blank_extracted_text(monkeypatch):
    class FakePage:
        def extract_text(self):
            return "   "

    class FakeReader:
        is_encrypted = False
        pages = [FakePage(), FakePage()]

        def __init__(self, stream):
            pass

    monkeypatch.setattr(extract, "PdfReader", FakeReader)

    with pytest.raises(TextExtractionError, match="empty_pdf_text"):
        extract_text_from_bytes(b"%PDF fake", "blank.pdf", "application/pdf")


def test_extract_pdf_rejects_oversized_pdf_before_reader(monkeypatch):
    def fail_reader(stream):
        raise AssertionError("PdfReader should not be called for oversized PDFs")

    monkeypatch.setattr(extract, "MAX_PDF_BYTES", 4)
    monkeypatch.setattr(extract, "PdfReader", fail_reader)

    with pytest.raises(TextExtractionError, match="pdf_too_large"):
        extract_text_from_bytes(b"%PDF fake", "large.pdf", "application/pdf")


def test_extract_pdf_rejects_too_many_pages(monkeypatch):
    class FakePage:
        def extract_text(self):
            return "text"

    class FakeReader:
        is_encrypted = False
        pages = [FakePage(), FakePage()]

        def __init__(self, stream):
            pass

    monkeypatch.setattr(extract, "MAX_PDF_PAGES", 1)
    monkeypatch.setattr(extract, "PdfReader", FakeReader)

    with pytest.raises(TextExtractionError, match="pdf_too_many_pages"):
        extract_text_from_bytes(b"%PDF fake", "many.pdf", "application/pdf")


def test_extract_pdf_rejects_too_much_extracted_text(monkeypatch):
    class FakePage:
        def __init__(self, text):
            self._text = text

        def extract_text(self):
            return self._text

    class FakeReader:
        is_encrypted = False
        pages = [FakePage("abc"), FakePage("def")]

        def __init__(self, stream):
            pass

    monkeypatch.setattr(extract, "MAX_EXTRACTED_TEXT_CHARS", 5)
    monkeypatch.setattr(extract, "PdfReader", FakeReader)

    with pytest.raises(TextExtractionError, match="pdf_text_too_large"):
        extract_text_from_bytes(b"%PDF fake", "text.pdf", "application/pdf")


def test_extract_docx_rejects_malformed_zip():
    with pytest.raises(TextExtractionError, match="malformed_docx"):
        extract_text_from_bytes(b"not a zip", "bad.docx", DOCX_MIME)


def test_extract_docx_rejects_missing_document_xml():
    with pytest.raises(TextExtractionError, match="missing_docx_document_xml"):
        extract_text_from_bytes(_docx_bytes(None), "missing.docx", DOCX_MIME)


def test_extract_docx_rejects_oversized_document_xml(monkeypatch):
    monkeypatch.setattr(extract, "DOCX_DOCUMENT_XML_MAX_BYTES", 8)

    with pytest.raises(TextExtractionError, match="docx_document_xml_too_large"):
        extract_text_from_bytes(_docx_bytes(b"<root />\n"), "large.docx", DOCX_MIME)


def test_extract_doc_is_rejected_without_libreoffice():
    with pytest.raises(UnsupportedMimeError, match="unsupported_mime"):
        extract_text_from_bytes(b"legacy", "old.doc", "application/msword")
