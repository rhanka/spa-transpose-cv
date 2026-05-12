import pytest

CV_DATA_KEYS = [
    "name",
    "title_line1",
    "title_line2",
    "years",
    "technicalSkills",
    "sectors",
    "domains",
    "experience",
    "languages",
    "education",
    "attention_cv",
]


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


def test_cv_data_validation_strips_unknown_top_level_and_nested_keys(expected_profile):
    from cv_transpose_core.profile import validate_cv_data

    raw = dict(expected_profile)
    raw["unknown"] = "removed"
    raw["technicalSkills"] = [dict(expected_profile["technicalSkills"][0], unknown="removed")]
    raw["experience"] = [dict(expected_profile["experience"][0], unknown="removed")]
    raw["languages"] = [dict(expected_profile["languages"][0], unknown="removed")]
    raw["education"] = [dict(expected_profile["education"][0], unknown="removed")]

    profile = validate_cv_data(raw)

    assert list(profile) == CV_DATA_KEYS
    assert list(profile["technicalSkills"][0]) == ["label", "description"]
    assert list(profile["experience"][0]) == [
        "company",
        "description",
        "dates",
        "title",
        "tasks",
        "achievements",
        "techEnvironment",
    ]
    assert list(profile["languages"][0]) == ["label", "level"]
    assert list(profile["education"][0]) == ["year", "description"]


def test_cv_data_validation_returns_fresh_nested_containers(expected_profile):
    from cv_transpose_core.profile import validate_cv_data

    raw = dict(expected_profile)
    raw["technicalSkills"] = [dict(expected_profile["technicalSkills"][0])]
    raw["sectors"] = list(expected_profile["sectors"])
    raw["domains"] = list(expected_profile["domains"])
    raw["experience"] = [
        {
            **expected_profile["experience"][0],
            "tasks": list(expected_profile["experience"][0]["tasks"]),
            "achievements": list(expected_profile["experience"][0]["achievements"]),
        }
    ]
    raw["languages"] = [dict(expected_profile["languages"][0])]
    raw["education"] = [dict(expected_profile["education"][0])]

    profile = validate_cv_data(raw)

    raw["technicalSkills"][0]["label"] = "Changed"
    raw["sectors"].append("Changed")
    raw["domains"].append("Changed")
    raw["experience"][0]["tasks"].append("Changed")
    raw["experience"][0]["achievements"].append("Changed")
    raw["languages"][0]["level"] = "Changed"
    raw["education"][0]["description"] = "Changed"

    assert profile["technicalSkills"][0]["label"] == "Product"
    assert profile["sectors"] == ["Consumer Mobile"]
    assert profile["domains"] == ["Product Management", "User Research", "Mobile Apps"]
    assert len(profile["experience"][0]["tasks"]) == 3
    assert len(profile["experience"][0]["achievements"]) == 2
    assert profile["languages"][0]["level"] == "Native"
    assert profile["education"][0]["description"] == "MS Computer Science, Tech University (fictional)."
