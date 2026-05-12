import pytest


def test_public_api_exports_transpose_contract_types():
    import cv_transpose_core as core

    assert callable(core.transpose)
    for name in [
        "InputFile",
        "BrandTokens",
        "TemplateAssets",
        "TransposeInput",
        "AlignmentReport",
        "TransposedCv",
        "TransposeOutput",
        "CvMime",
        "Persistence",
        "TransposePhase",
    ]:
        assert hasattr(core, name)


def test_cv_data_validation_accepts_fixture(expected_profile):
    from cv_transpose_core.profile import validate_cv_data

    profile = validate_cv_data(expected_profile)

    assert profile["name"] == "Jane Smith"
    assert len(profile["technicalSkills"]) == 2
    assert len(profile["experience"]) == 1


def test_cv_data_validation_rejects_missing_required_field(expected_profile):
    from cv_transpose_core.profile import CvDataError, validate_cv_data

    broken = dict(expected_profile)
    broken.pop("name")

    with pytest.raises(CvDataError, match="name"):
        validate_cv_data(broken)
