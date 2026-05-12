import json
import xml.etree.ElementTree as ET
from copy import deepcopy
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from cv_transpose_core.contract import manifest_to_contract
from cv_transpose_core.docx import extract_text_from_docx_bytes
from cv_transpose_core.render import render_docx
from cv_transpose_core.types import BrandTokens
from cv_transpose_core.validate import validate_docx_structure


def _minimal_docx(document_xml: str) -> bytes:
    out = BytesIO()
    with ZipFile(out, "w", ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", document_xml.encode("utf-8"))
    return out.getvalue()


def _document_xml(paragraphs: list[str]) -> str:
    body = "\n".join(
        f"<w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p>" for paragraph in paragraphs
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{body}</w:body>
</w:document>
"""


def _scalian_contract(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    brand = BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato")
    return manifest_to_contract(manifest, brand)


def test_render_docx_contains_profile_and_required_sections(repo_root, expected_profile):
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    contract = _scalian_contract(repo_root)

    out = render_docx(base_docx, expected_profile, contract)
    text = extract_text_from_docx_bytes(out)

    assert out[:4] == b"PK\x03\x04"
    assert "Jane Smith" in text
    assert "TECHNICAL SKILLS" in text
    assert "SECTOR-SPECIFIC SKILLS" in text
    assert "WORK EXPERIENCE" in text


def test_validate_docx_structure_finds_missing_sections(repo_root, expected_profile):
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    contract = _scalian_contract(repo_root)
    out = render_docx(base_docx, expected_profile, contract)

    result = validate_docx_structure(out, ["TECHNICAL SKILLS", "NEVER_PRESENT"])

    assert result["found"] == ["TECHNICAL SKILLS"]
    assert result["missing"] == ["NEVER_PRESENT"]


def test_render_docx_writes_valid_header_part_root(repo_root, expected_profile):
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    contract = _scalian_contract(repo_root)

    out = render_docx(base_docx, expected_profile, contract)

    with ZipFile(BytesIO(out)) as zf:
        root = ET.fromstring(zf.read("word/header2.xml"))
    assert root.tag.rsplit("}", 1)[-1] == "hdr"


def test_render_docx_does_not_add_orphan_header_part(repo_root, expected_profile):
    contract = _scalian_contract(repo_root)
    base_docx = _minimal_docx(_document_xml(["Template body"]))

    out = render_docx(base_docx, expected_profile, contract)

    with ZipFile(BytesIO(out)) as zf:
        assert "word/header2.xml" not in zf.namelist()


def test_render_docx_removes_xml_invalid_control_characters(repo_root, expected_profile):
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    contract = _scalian_contract(repo_root)
    profile = deepcopy(expected_profile)
    profile["name"] = "Jane\x08 Smith"

    out = render_docx(base_docx, profile, contract)
    text = extract_text_from_docx_bytes(out)

    assert "\x08" not in text
    assert "Jane Smith" in text


def test_validate_docx_structure_requires_label_as_own_paragraph():
    docx = _minimal_docx(_document_xml(["Body mentions TECHNICAL SKILLS but is not a heading."]))

    result = validate_docx_structure(docx, ["TECHNICAL SKILLS"])

    assert result["found"] == []
    assert result["missing"] == ["TECHNICAL SKILLS"]
