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
