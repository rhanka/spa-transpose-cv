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


def _require_str(obj: dict[str, Any], key: str, allow_empty: bool = True, trim: bool = False) -> str:
    value = obj.get(key)
    if not isinstance(value, str):
        raise CvDataError(f"{key}: expected string")
    if not allow_empty and value.strip() == "":
        raise CvDataError(f"{key}: expected non-empty string")
    return value.strip() if trim else value


def _require_list(obj: dict[str, Any], key: str) -> list[Any]:
    value = obj.get(key)
    if not isinstance(value, list):
        raise CvDataError(f"{key}: expected list")
    return value


def validate_cv_data(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise CvDataError("profile: expected object")

    name = _require_str(raw, "name", allow_empty=False, trim=True)
    title_line1 = _require_str(raw, "title_line1")
    title_line2 = _require_str(raw, "title_line2")
    years = _require_str(raw, "years")
    attention_cv = _require_str(raw, "attention_cv")
    technical_skills = _require_list(raw, "technicalSkills")
    sectors = _require_list(raw, "sectors")
    domains = _require_list(raw, "domains")
    experience = _require_list(raw, "experience")
    languages = _require_list(raw, "languages")
    education = _require_list(raw, "education")

    normalized_skills: list[dict[str, str]] = []
    for idx, skill in enumerate(technical_skills):
        if not isinstance(skill, dict):
            raise CvDataError(f"technicalSkills.{idx}: expected object")
        normalized_skills.append(
            {
                "label": _require_str(skill, "label", allow_empty=False, trim=True),
                "description": _require_str(skill, "description", allow_empty=False, trim=True),
            }
        )

    normalized_sectors: list[str] = []
    normalized_domains: list[str] = []
    for key, items in [("sectors", sectors), ("domains", domains)]:
        normalized_items = normalized_sectors if key == "sectors" else normalized_domains
        for idx, item in enumerate(items):
            if not isinstance(item, str) or item.strip() == "":
                raise CvDataError(f"{key}.{idx}: expected non-empty string")
            normalized_items.append(item.strip())

    normalized_experience: list[dict[str, Any]] = []
    for idx, job in enumerate(experience):
        if not isinstance(job, dict):
            raise CvDataError(f"experience.{idx}: expected object")
        tasks = _require_list(job, "tasks")
        achievements = _require_list(job, "achievements")
        normalized_tasks: list[str] = []
        normalized_achievements: list[str] = []
        for task_idx, task in enumerate(tasks):
            if not isinstance(task, str) or task.strip() == "":
                raise CvDataError(f"experience.{idx}.tasks.{task_idx}: expected non-empty string")
            normalized_tasks.append(task.strip())
        for achievement_idx, achievement in enumerate(achievements):
            if not isinstance(achievement, str):
                raise CvDataError(f"experience.{idx}.achievements.{achievement_idx}: expected string")
            normalized_achievements.append(achievement.strip())
        normalized_experience.append(
            {
                "company": _require_str(job, "company", allow_empty=False, trim=True),
                "description": _require_str(job, "description", allow_empty=False, trim=True),
                "dates": _require_str(job, "dates", allow_empty=False, trim=True),
                "title": _require_str(job, "title", allow_empty=False, trim=True),
                "tasks": normalized_tasks,
                "achievements": normalized_achievements,
                "techEnvironment": _require_str(job, "techEnvironment", trim=True),
            }
        )

    normalized_languages: list[dict[str, str]] = []
    for idx, language in enumerate(languages):
        if not isinstance(language, dict):
            raise CvDataError(f"languages.{idx}: expected object")
        normalized_languages.append(
            {
                "label": _require_str(language, "label", allow_empty=False, trim=True),
                "level": _require_str(language, "level", allow_empty=False, trim=True),
            }
        )

    normalized_education: list[dict[str, str]] = []
    for idx, education_item in enumerate(education):
        if not isinstance(education_item, dict):
            raise CvDataError(f"education.{idx}: expected object")
        normalized_education.append(
            {
                "year": _require_str(education_item, "year", allow_empty=False, trim=True),
                "description": _require_str(education_item, "description", allow_empty=False, trim=True),
            }
        )

    return {
        "name": name,
        "title_line1": title_line1,
        "title_line2": title_line2,
        "years": years,
        "technicalSkills": normalized_skills,
        "sectors": normalized_sectors,
        "domains": normalized_domains,
        "experience": normalized_experience,
        "languages": normalized_languages,
        "education": normalized_education,
        "attention_cv": attention_cv,
    }
