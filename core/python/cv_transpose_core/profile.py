from __future__ import annotations

from typing import Any


class CvDataError(ValueError):
    pass


EMPTY_PROFILE_FALLBACK: dict[str, Any] = {
    "name": "Candidate",
    "title_line1": "",
    "title_line2": "",
    "years": "",
    "technicalSkills": [],
    "sectors": [],
    "domains": [],
    "experience": [],
    "languages": [],
    "education": [],
    "attention_cv": "",
}


def _require_str(obj: dict[str, Any], key: str, allow_empty: bool = True) -> str:
    value = obj.get(key)
    if not isinstance(value, str):
        raise CvDataError(f"{key}: expected string")
    if not allow_empty and value.strip() == "":
        raise CvDataError(f"{key}: expected non-empty string")
    return value


def _require_list(obj: dict[str, Any], key: str) -> list[Any]:
    value = obj.get(key)
    if not isinstance(value, list):
        raise CvDataError(f"{key}: expected list")
    return value


def validate_cv_data(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise CvDataError("profile: expected object")

    profile = dict(raw)
    _require_str(profile, "name", allow_empty=False)
    _require_str(profile, "title_line1")
    _require_str(profile, "title_line2")
    _require_str(profile, "years")
    _require_str(profile, "attention_cv")

    for key in ["technicalSkills", "sectors", "domains", "experience", "languages", "education"]:
        _require_list(profile, key)

    for idx, skill in enumerate(profile["technicalSkills"]):
        if not isinstance(skill, dict):
            raise CvDataError(f"technicalSkills.{idx}: expected object")
        _require_str(skill, "label", allow_empty=False)
        _require_str(skill, "description", allow_empty=False)

    for key in ["sectors", "domains"]:
        for idx, item in enumerate(profile[key]):
            if not isinstance(item, str) or item.strip() == "":
                raise CvDataError(f"{key}.{idx}: expected non-empty string")

    for idx, job in enumerate(profile["experience"]):
        if not isinstance(job, dict):
            raise CvDataError(f"experience.{idx}: expected object")
        for key in ["company", "description", "dates", "title"]:
            _require_str(job, key, allow_empty=False)
        _require_str(job, "techEnvironment")
        tasks = _require_list(job, "tasks")
        achievements = _require_list(job, "achievements")
        for task_idx, task in enumerate(tasks):
            if not isinstance(task, str) or task.strip() == "":
                raise CvDataError(f"experience.{idx}.tasks.{task_idx}: expected non-empty string")
        for achievement_idx, achievement in enumerate(achievements):
            if not isinstance(achievement, str):
                raise CvDataError(f"experience.{idx}.achievements.{achievement_idx}: expected string")

    for idx, language in enumerate(profile["languages"]):
        if not isinstance(language, dict):
            raise CvDataError(f"languages.{idx}: expected object")
        _require_str(language, "label", allow_empty=False)
        _require_str(language, "level", allow_empty=False)

    for idx, education in enumerate(profile["education"]):
        if not isinstance(education, dict):
            raise CvDataError(f"education.{idx}: expected object")
        _require_str(education, "year", allow_empty=False)
        _require_str(education, "description", allow_empty=False)

    return profile
