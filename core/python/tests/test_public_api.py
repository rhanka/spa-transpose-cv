from copy import deepcopy

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


def test_cv_data_validation_trims_zod_trimmed_fields_and_preserves_raw_fields(expected_profile):
    from cv_transpose_core.profile import validate_cv_data

    raw = deepcopy(expected_profile)
    raw["name"] = "  Jane Smith  "
    raw["title_line1"] = "  Product Manager  "
    raw["title_line2"] = "  Mobile Apps  "
    raw["years"] = "  4 years  "
    raw["attention_cv"] = "  Available now  "
    raw["technicalSkills"][0]["label"] = "  Product  "
    raw["technicalSkills"][0]["description"] = "  Roadmaps and discovery  "
    raw["sectors"][0] = "  Consumer Mobile  "
    raw["domains"][0] = "  Product Management  "
    raw["experience"][0]["company"] = "  Acme  "
    raw["experience"][0]["description"] = "  Product team  "
    raw["experience"][0]["dates"] = "  2021-2024  "
    raw["experience"][0]["title"] = "  PM  "
    raw["experience"][0]["tasks"][0] = "  Ran discovery  "
    raw["experience"][0]["achievements"][0] = "  Grew adoption  "
    raw["experience"][0]["techEnvironment"] = "  Jira, Figma  "
    raw["languages"][0]["label"] = "  English  "
    raw["languages"][0]["level"] = "  Native  "
    raw["education"][0]["year"] = "  2020  "
    raw["education"][0]["description"] = "  MS Computer Science  "

    profile = validate_cv_data(raw)

    assert profile["name"] == "Jane Smith"
    assert profile["technicalSkills"][0] == {
        "label": "Product",
        "description": "Roadmaps and discovery",
    }
    assert profile["sectors"][0] == "Consumer Mobile"
    assert profile["domains"][0] == "Product Management"
    assert profile["experience"][0]["company"] == "Acme"
    assert profile["experience"][0]["description"] == "Product team"
    assert profile["experience"][0]["dates"] == "2021-2024"
    assert profile["experience"][0]["title"] == "PM"
    assert profile["experience"][0]["tasks"][0] == "Ran discovery"
    assert profile["languages"][0] == {"label": "English", "level": "Native"}
    assert profile["education"][0] == {
        "year": "2020",
        "description": "MS Computer Science",
    }

    assert profile["title_line1"] == "  Product Manager  "
    assert profile["title_line2"] == "  Mobile Apps  "
    assert profile["years"] == "  4 years  "
    assert profile["attention_cv"] == "  Available now  "
    assert profile["experience"][0]["achievements"][0] == "  Grew adoption  "
    assert profile["experience"][0]["techEnvironment"] == "  Jira, Figma  "
