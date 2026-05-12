import json

from cv_transpose_core.contract import manifest_to_contract
from cv_transpose_core.docx import extract_text_from_docx_bytes
from cv_transpose_core.render import render_docx
from cv_transpose_core.types import BrandTokens
from cv_transpose_core.validate import validate_docx_structure


def test_render_docx_contains_profile_and_required_sections(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    brand = BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato")
    contract = manifest_to_contract(manifest, brand)

    out = render_docx(base_docx, expected_profile, contract)
    text = extract_text_from_docx_bytes(out)

    assert out[:4] == b"PK\x03\x04"
    assert "Jane Smith" in text
    assert "TECHNICAL SKILLS" in text
    assert "SECTOR-SPECIFIC SKILLS" in text
    assert "WORK EXPERIENCE" in text


def test_validate_docx_structure_finds_missing_sections(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    brand = BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato")
    contract = manifest_to_contract(manifest, brand)
    out = render_docx(base_docx, expected_profile, contract)

    result = validate_docx_structure(out, ["TECHNICAL SKILLS", "NEVER_PRESENT"])

    assert result["found"] == ["TECHNICAL SKILLS"]
    assert result["missing"] == ["NEVER_PRESENT"]
