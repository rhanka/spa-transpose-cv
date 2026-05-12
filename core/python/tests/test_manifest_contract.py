import json

import pytest

from cv_transpose_core.contract import derive_output_name_from_contract, manifest_to_contract
from cv_transpose_core.manifest import ManifestError, validate_template_manifest
from cv_transpose_core.types import BrandTokens


def test_validate_template_manifest_accepts_scalian(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())

    validated = validate_template_manifest(manifest)

    assert validated["version"] == "1.0"
    assert validated["tenantKey"] == "direct:scalian-test"


def test_validate_template_manifest_rejects_bad_version(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["version"] = "2.0"

    with pytest.raises(ManifestError, match="version"):
        validate_template_manifest(manifest)


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("headerStyle", "brand"),
        ("sectionStyle", "accent-left"),
        ("jobStyle", "dense"),
    ],
)
def test_validate_template_manifest_rejects_invalid_rendering_enums(repo_root, key, value):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["rendering"][key] = value

    with pytest.raises(ManifestError, match=key):
        validate_template_manifest(manifest)


def test_validate_template_manifest_rejects_invalid_rendering_color(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["rendering"]["colors"]["accent"] = "red"

    with pytest.raises(ManifestError, match="rendering.colors.accent"):
        validate_template_manifest(manifest)


def test_validate_template_manifest_rejects_unknown_rendering_property(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["rendering"]["unknown"] = "value"

    with pytest.raises(ManifestError, match="rendering.unknown"):
        validate_template_manifest(manifest)


def test_validate_template_manifest_accepts_section_label_overrides(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["rendering"]["sectionLabelOverrides"] = {
        "technicalSkills": "SKILLS",
        "experience": "EXPERIENCE",
    }

    validated = validate_template_manifest(manifest)

    assert validated["rendering"]["sectionLabelOverrides"] == {
        "technicalSkills": "SKILLS",
        "experience": "EXPERIENCE",
    }


@pytest.mark.parametrize(
    "section_label_overrides",
    [
        ["technicalSkills", "SKILLS"],
        {42: "SKILLS"},
        {"technicalSkills": 42},
    ],
)
def test_validate_template_manifest_rejects_invalid_section_label_overrides(
    repo_root, section_label_overrides
):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["rendering"]["sectionLabelOverrides"] = section_label_overrides

    with pytest.raises(ManifestError, match="rendering.sectionLabelOverrides"):
        validate_template_manifest(manifest)


@pytest.mark.parametrize(
    ("group", "key", "value"),
    [
        ("fonts", "heading", ""),
        ("spacing", "lineTwip", ""),
    ],
)
def test_validate_template_manifest_rejects_invalid_rendering_token_values(repo_root, group, key, value):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["rendering"][group][key] = value

    with pytest.raises(ManifestError, match=f"rendering.{group}.{key}"):
        validate_template_manifest(manifest)


@pytest.mark.parametrize("max_chars", [0, "40"])
def test_validate_template_manifest_rejects_invalid_header_slot_max_chars(repo_root, max_chars):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["header"]["titleLine1Slot"]["maxChars"] = max_chars

    with pytest.raises(ManifestError, match="header.titleLine1Slot.maxChars"):
        validate_template_manifest(manifest)


def test_validate_template_manifest_rejects_overlong_section_label(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["sections"][0]["label"] = "X" * 81

    with pytest.raises(ManifestError, match="sections.0.label"):
        validate_template_manifest(manifest)


def test_validate_template_manifest_rejects_invalid_section_max_items(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["sections"][0]["maxItems"] = 0

    with pytest.raises(ManifestError, match="sections.0.maxItems"):
        validate_template_manifest(manifest)


@pytest.mark.parametrize("anchor_paragraph_index", [-1, 1.5, True])
def test_validate_template_manifest_rejects_invalid_section_anchor_paragraph_index(
    repo_root, anchor_paragraph_index
):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["sections"][0]["anchorParagraphIndex"] = anchor_paragraph_index

    with pytest.raises(ManifestError, match="sections.0.anchorParagraphIndex"):
        validate_template_manifest(manifest)


def test_validate_template_manifest_rejects_invalid_section_item_template_ref(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["sections"][0]["itemTemplateRef"] = 42

    with pytest.raises(ManifestError, match="sections.0.itemTemplateRef"):
        validate_template_manifest(manifest)


def test_manifest_to_contract_maps_scalian_rendering(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    brand = BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato")

    contract = manifest_to_contract(manifest, brand)

    assert contract["layout"]["variant"] == "brand-accent"
    assert contract["rendering"]["jobStyle"] == "compact-dense"
    assert [s["label"] for s in contract["sections"]] == [
        "TECHNICAL SKILLS",
        "SECTOR-SPECIFIC SKILLS",
        "WORK EXPERIENCE",
    ]


def test_derive_output_name_matches_ts_pattern(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    brand = BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato")
    contract = manifest_to_contract(manifest, brand)

    assert derive_output_name_from_contract(contract, "cv-001-junior-pm.pdf", "Jane Smith") == "Scalian_Profile_Jane_Smith.docx"


def test_derive_output_name_matches_ts_leading_whitespace_first_name_fallback(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    manifest["naming"] = "Profile_{firstName}.docx"
    brand = BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato")
    contract = manifest_to_contract(manifest, brand)

    assert derive_output_name_from_contract(contract, "cv-001-junior-pm.pdf", " Jane Smith") == "Profile_Candidate.docx"
