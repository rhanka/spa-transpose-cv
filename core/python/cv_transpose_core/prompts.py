from __future__ import annotations

from importlib.resources import files
import re
from functools import lru_cache
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


@lru_cache(maxsize=1)
def _prompt_parts() -> tuple[str, str]:
    resource = files("cv_transpose_core").joinpath("spec/prompts/extract-cv.md")
    if resource.is_file():
        md = resource.read_text(encoding="utf-8")
    else:
        md = (_repo_root() / "core/spec/prompts/extract-cv.md").read_text(encoding="utf-8")
    body = re.sub(r"^---[\s\S]*?\n---\n", "", md)
    system_match = re.search(r"# System prompt\s*\n([\s\S]*?)(?=\n# |$)", body)
    if system_match is None:
        raise ValueError('extract-cv.md missing "# System prompt" section')
    user_match = re.search(r"# User prompt template\s*\n([\s\S]*?)(?=\n# |$)", body)
    if user_match is None:
        raise ValueError('extract-cv.md missing "# User prompt template" section')

    rendered = None
    for match in re.finditer(r"```[a-zA-Z]*\n([\s\S]*?)\n```", user_match.group(1)):
        content = match.group(1)
        if content.lstrip().startswith("${userPrompt}"):
            rendered = content
            break
    if rendered is None:
        raise ValueError("extract-cv.md missing rendered user prompt fenced block")
    return system_match.group(1).strip(), rendered


def build_system_prompt() -> str:
    return _prompt_parts()[0]


def build_user_prompt(*, cv_text: str, source_file_name: str, user_prompt_override: str | None) -> str:
    override = user_prompt_override or ""
    template = _prompt_parts()[1]
    result = (
        template.replace("${userPrompt}", override)
        .replace("${sourceFileName}", source_file_name)
        .replace("${cvText}", cv_text)
    )
    if override == "":
        result = re.sub(r"^\s*\n+", "", result)
    return result
