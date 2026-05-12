from io import BytesIO
from zipfile import ZipFile

import pytest
from lxml import etree

from cv_transpose_core.normalize import normalize_docx


def _docx(entries: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buffer.getvalue()


def _normalized_root(normalized: dict[str, dict[str, str]], name: str):
    return etree.fromstring(normalized["xml"][name].encode())


def test_normalize_docx_returns_document_and_binary_hashes(repo_root):
    data = (repo_root / "core/golden/cv-001-junior-pm.scalian.docx").read_bytes()

    normalized = normalize_docx(data)

    assert "word/document.xml" in normalized["xml"]
    assert isinstance(normalized["xml"]["word/document.xml"], str)
    assert isinstance(normalized["binary_hashes"], dict)


def test_normalize_docx_raises_for_malformed_xml():
    data = _docx({"word/document.xml": b"<document><unclosed></document>"})

    with pytest.raises(etree.XMLSyntaxError):
        normalize_docx(data)


def test_normalize_docx_normalizes_relationship_parts_as_xml():
    data = _docx(
        {
            "_rels/.rels": (
                b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                b'<Relationship Id="rId1" Type="officeDocument" Target="word/document.xml"/>'
                b"</Relationships>"
            ),
            "word/media/image.bin": b"image",
        }
    )

    normalized = normalize_docx(data)

    assert "_rels/.rels" in normalized["xml"]
    assert "_rels/.rels" not in normalized["binary_hashes"]
    assert "word/media/image.bin" in normalized["binary_hashes"]


def test_normalize_docx_removes_docpr_id():
    data = _docx(
        {
            "word/document.xml": (
                b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
                b'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
                b'<wp:docPr id="123" name="Picture 1"/>'
                b"</w:document>"
            )
        }
    )

    root = _normalized_root(normalize_docx(data), "word/document.xml")
    doc_pr = root.find(
        ".//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}docPr"
    )

    assert doc_pr is not None
    assert "id" not in doc_pr.attrib
    assert doc_pr.attrib["name"] == "Picture 1"


def test_normalize_docx_preserves_deterministic_numeric_id_attributes():
    data = _docx(
        {
            "word/document.xml": (
                b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
                b'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">'
                b'<w:p w14:textId="77777777"/>'
                b"</w:document>"
            )
        }
    )

    root = _normalized_root(normalize_docx(data), "word/document.xml")
    paragraph = root.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")

    assert paragraph is not None
    assert (
        paragraph.attrib["{http://schemas.microsoft.com/office/word/2010/wordml}textId"]
        == "77777777"
    )


def test_normalize_docx_removes_docid_and_pkg_numeric_id_attributes():
    data = _docx(
        {
            "word/document.xml": (
                b'<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage" '
                b'docId="456" pkg:itemId="123" stableId="abc"/>'
            )
        }
    )

    root = _normalized_root(normalize_docx(data), "word/document.xml")

    assert "docId" not in root.attrib
    assert "{http://schemas.microsoft.com/office/2006/xmlPackage}itemId" not in root.attrib
    assert root.attrib["stableId"] == "abc"


def test_normalize_docx_skips_zip_directory_entries():
    data = _docx(
        {
            "word/media/": b"",
            "word/media/image.bin": b"image",
        }
    )

    normalized = normalize_docx(data)

    assert "word/media/" not in normalized["xml"]
    assert "word/media/" not in normalized["binary_hashes"]
    assert "word/media/image.bin" in normalized["binary_hashes"]
