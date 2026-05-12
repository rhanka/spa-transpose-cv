# P1.2 Python Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Python port of `@cv-transpose/core` v0.2 for marketplace runtimes, scoped to the existing Scalian fixture and golden.

**Architecture:** Add `core/python/cv_transpose_core/` as a pure-Python package with a public `transpose(input_)` API mirroring the TypeScript contract in snake_case. Keep the implementation modular: public dataclasses, prompt loading, extraction, manifest-to-contract bridge, DOCX rendering, structural validation, normalization, and orchestration. Tests run through Docker and use the existing fixture/golden corpus.

**Tech Stack:** Python 3.12, `dataclasses`, `typing.Protocol`, `zipfile`, `xml.etree.ElementTree`, `pypdf`, `lxml`, `pytest`, Docker-based test command. No native `npm`/`node`/`tsc`/`vitest`/`npx`.

---

## File Structure

Create:

- `core/python/pyproject.toml` - package metadata, runtime/test dependencies.
- `core/python/README.md` - local test command and scope notes.
- `core/python/cv_transpose_core/__init__.py` - public exports.
- `core/python/cv_transpose_core/types.py` - public dataclasses and protocols.
- `core/python/cv_transpose_core/profile.py` - CvData validation and fallback profile.
- `core/python/cv_transpose_core/prompts.py` - `extract-cv.md` parser and prompt builder.
- `core/python/cv_transpose_core/extract.py` - PDF/DOCX text extraction and `.doc` rejection.
- `core/python/cv_transpose_core/manifest.py` - manifest validation.
- `core/python/cv_transpose_core/contract.py` - manifest-to-contract bridge and output naming.
- `core/python/cv_transpose_core/docx.py` - DOCX zip/XML read-write helpers.
- `core/python/cv_transpose_core/render.py` - Scalian-compatible OOXML renderer.
- `core/python/cv_transpose_core/validate.py` - structural DOCX validation.
- `core/python/cv_transpose_core/normalize.py` - DOCX normalization for equivalence tests.
- `core/python/cv_transpose_core/transpose.py` - public pipeline implementation.
- `core/python/tests/conftest.py` - repo-root fixtures and fake LLM.
- `core/python/tests/test_public_api.py`
- `core/python/tests/test_prompts.py`
- `core/python/tests/test_extract.py`
- `core/python/tests/test_manifest_contract.py`
- `core/python/tests/test_render_validate.py`
- `core/python/tests/test_normalize.py`
- `core/python/tests/test_transpose.py`
- `core/python/tests/test_equivalence.py`

Modify:

- `Makefile` - add `test-core-python` target using Docker.

Do not add unrelated untracked files to commits. Use path-specific `git add`.

---

## Task 1: Package Skeleton And Docker Test Harness

**Files:**
- Create: `core/python/pyproject.toml`
- Create: `core/python/README.md`
- Create: `core/python/cv_transpose_core/__init__.py`
- Create: `core/python/tests/test_public_api.py`
- Modify: `Makefile`

- [ ] **Step 1: Write the failing public API smoke test**

Create `core/python/tests/test_public_api.py`:

```python
def test_public_api_exports_transpose_contract_types():
    import cv_transpose_core as core

    assert callable(core.transpose)
    assert core.InputFile.__name__ == "InputFile"
    assert core.TransposeInput.__name__ == "TransposeInput"
    assert core.TemplateAssets.__name__ == "TemplateAssets"
```

- [ ] **Step 2: Add the Docker test target**

Modify `Makefile` under the tests section:

```make
.PHONY: test-core-python
test-core-python: ## Run Python core unit tests in Docker
	docker run --rm -v "$$(pwd):/app" -w /app python:3.12-slim sh -lc 'python -m pip install --disable-pip-version-check -e core/python[test] && python -m pytest core/python/tests'
```

- [ ] **Step 3: Run the smoke test and verify it fails**

Run:

```bash
make test-core-python
```

Expected: FAIL with `ModuleNotFoundError: No module named 'cv_transpose_core'`.

- [ ] **Step 4: Add package metadata and minimal public module**

Create `core/python/pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=69", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "cv-transpose-core"
version = "0.2.0"
description = "Python port of CV Transpose core"
requires-python = ">=3.12"
dependencies = [
  "lxml>=5.2,<6",
  "pypdf>=4.2,<6",
]

[project.optional-dependencies]
test = [
  "pytest>=8.2,<9",
]

[tool.setuptools.packages.find]
where = ["."]
include = ["cv_transpose_core*"]
```

Create `core/python/cv_transpose_core/__init__.py`:

```python
from .types import InputFile, TemplateAssets, TransposeInput


async def transpose(input_: TransposeInput):
    raise NotImplementedError("transpose() is implemented in Task 8")


__all__ = [
    "InputFile",
    "TemplateAssets",
    "TransposeInput",
    "transpose",
]
```

Create `core/python/cv_transpose_core/types.py` with temporary minimal dataclasses:

```python
from dataclasses import dataclass
from typing import Any, Literal, Protocol

CvMime = Literal[
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]
Persistence = Literal["session", "ephemeral"]


@dataclass(frozen=True)
class InputFile:
    name: str
    bytes_: bytes
    mime: CvMime
    user_prompt_override: str | None = None


@dataclass(frozen=True)
class BrandTokens:
    primary: str
    secondary: str
    accent: str
    font_family: str


@dataclass(frozen=True)
class TemplateAssets:
    manifest: dict[str, Any]
    base_docx: bytes
    brand: BrandTokens


class LlmProvider(Protocol):
    async def complete(self, **kwargs: Any) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class TransposeInput:
    files: list[InputFile]
    template: TemplateAssets
    persistence: Persistence
    llm: LlmProvider
    extraction: dict[str, Any] | None = None
    stream_callbacks: dict[str, Any] | None = None
```

Create `core/python/README.md`:

```markdown
# cv_transpose_core Python

First Python port of `@cv-transpose/core` for marketplace runtimes.

Run tests from the repo root:

```bash
make test-core-python
```

Scope: PDF + DOCX, pure Python, no LibreOffice/pandoc/pdftotext, `.doc`
returns `unsupported_mime`.
```

- [ ] **Step 5: Run the smoke test and verify it passes**

Run:

```bash
make test-core-python
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add Makefile core/python/pyproject.toml core/python/README.md core/python/cv_transpose_core/__init__.py core/python/cv_transpose_core/types.py core/python/tests/test_public_api.py
git commit -m "chore(core-python): add package skeleton and docker test target"
```

---

## Task 2: Public Contract Dataclasses And CvData Validation

**Files:**
- Modify: `core/python/cv_transpose_core/types.py`
- Create: `core/python/cv_transpose_core/profile.py`
- Modify: `core/python/cv_transpose_core/__init__.py`
- Create: `core/python/tests/test_public_api.py`

- [ ] **Step 1: Extend the public API tests**

Replace `core/python/tests/test_public_api.py` with:

```python
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
```

- [ ] **Step 2: Add shared fixtures**

Create `core/python/tests/conftest.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def expected_profile(repo_root: Path) -> dict:
    return json.loads(
        (repo_root / "core/fixtures/cv-001-junior-pm.expected-extraction.json").read_text()
    )
```

- [ ] **Step 3: Run tests and verify validation does not exist yet**

Run:

```bash
make test-core-python
```

Expected: FAIL with `ModuleNotFoundError: No module named 'cv_transpose_core.profile'`.

- [ ] **Step 4: Implement complete public dataclasses**

Replace `core/python/cv_transpose_core/types.py` with:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol

CvMime = Literal[
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]
Persistence = Literal["session", "ephemeral"]
TransposePhase = Literal[
    "extract-text",
    "extract-cv-llm",
    "render-docx",
    "validate-page1",
    "validate-structural",
    "retry",
    "done",
]


@dataclass(frozen=True)
class InputFile:
    name: str
    bytes_: bytes
    mime: CvMime
    user_prompt_override: str | None = None


@dataclass(frozen=True)
class BrandTokens:
    primary: str
    secondary: str
    accent: str
    font_family: str


@dataclass(frozen=True)
class TemplateAssets:
    manifest: dict[str, Any]
    base_docx: bytes
    brand: BrandTokens


@dataclass(frozen=True)
class LlmCompleteArgs:
    system_prompt: str
    user_prompt: str
    max_tokens: int | None = None
    temperature: float | None = None
    enable_reasoning: bool | None = None
    reasoning_budget: int | None = None
    on_delta: Callable[[dict[str, str]], None] | None = None


@dataclass(frozen=True)
class LlmCompleteResult:
    text: str
    usage: dict[str, int] | None = None


class LlmProvider(Protocol):
    async def complete(self, args: LlmCompleteArgs) -> LlmCompleteResult | dict[str, Any]:
        ...


@dataclass(frozen=True)
class ExtractionOptions:
    reasoning_budget: int | None = None
    enable_reasoning: bool | None = None
    max_validation_retries: int | None = None


@dataclass(frozen=True)
class StreamCallbacks:
    on_phase_change: Callable[[str, TransposePhase], None] | None = None
    on_thinking_delta: Callable[[str, str], None] | None = None
    on_content_delta: Callable[[str, str], None] | None = None
    on_parsed_keys: Callable[[str, list[str]], None] | None = None


@dataclass(frozen=True)
class TransposeInput:
    files: list[InputFile]
    template: TemplateAssets
    persistence: Persistence
    llm: LlmProvider
    extraction: ExtractionOptions | None = None
    stream_callbacks: StreamCallbacks | None = None


@dataclass(frozen=True)
class DetectedFields:
    experience_count: int
    education_count: int
    skill_buckets: int
    languages_count: int
    name: str | None = None
    title_line1: str | None = None
    title_line2: str | None = None
    years_of_experience: int | None = None


@dataclass
class AlignmentReport:
    validation_passed: bool
    warnings: list[str]
    detected_fields: DetectedFields
    page1_sections_found: list[str]
    missing_required_sections: list[str]
    retries_used: int


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int
    total_tokens: int


@dataclass(frozen=True)
class TransposedCv:
    source_file_name: str
    output_docx_name: str
    output_docx: bytes
    profile: dict[str, Any]
    source_text: str
    usage: Usage
    alignment_report: AlignmentReport
    errors: list[str]


@dataclass(frozen=True)
class TransposeOutput:
    results: list[TransposedCv]
```

- [ ] **Step 5: Implement CvData validation**

Create `core/python/cv_transpose_core/profile.py`:

```python
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
```

- [ ] **Step 6: Export full public surface**

Replace `core/python/cv_transpose_core/__init__.py` with:

```python
from .profile import EMPTY_PROFILE_FALLBACK, CvDataError, validate_cv_data
from .transpose import transpose
from .types import (
    AlignmentReport,
    BrandTokens,
    DetectedFields,
    ExtractionOptions,
    InputFile,
    LlmCompleteArgs,
    LlmCompleteResult,
    LlmProvider,
    StreamCallbacks,
    TemplateAssets,
    TransposeInput,
    TransposedCv,
    TransposeOutput,
    Usage,
)

__all__ = [
    "AlignmentReport",
    "BrandTokens",
    "CvDataError",
    "DetectedFields",
    "EMPTY_PROFILE_FALLBACK",
    "ExtractionOptions",
    "InputFile",
    "LlmCompleteArgs",
    "LlmCompleteResult",
    "LlmProvider",
    "StreamCallbacks",
    "TemplateAssets",
    "TransposeInput",
    "TransposedCv",
    "TransposeOutput",
    "Usage",
    "transpose",
    "validate_cv_data",
]
```

Create temporary `core/python/cv_transpose_core/transpose.py`:

```python
from .types import TransposeInput, TransposeOutput


async def transpose(input_: TransposeInput) -> TransposeOutput:
    raise NotImplementedError("transpose() is implemented in Task 8")
```

- [ ] **Step 7: Run tests**

Run:

```bash
make test-core-python
```

Expected: public API and profile tests pass.

- [ ] **Step 8: Commit**

```bash
git add core/python/cv_transpose_core/__init__.py core/python/cv_transpose_core/types.py core/python/cv_transpose_core/profile.py core/python/cv_transpose_core/transpose.py core/python/tests/conftest.py core/python/tests/test_public_api.py
git commit -m "feat(core-python): add public contract dataclasses and profile validation"
```

---

## Task 3: Prompt Assembly And Text Extraction

**Files:**
- Create: `core/python/cv_transpose_core/prompts.py`
- Create: `core/python/cv_transpose_core/extract.py`
- Create: `core/python/tests/test_prompts.py`
- Create: `core/python/tests/test_extract.py`

- [ ] **Step 1: Write prompt tests**

Create `core/python/tests/test_prompts.py`:

```python
from cv_transpose_core.prompts import build_system_prompt, build_user_prompt


def test_system_prompt_is_loaded_from_shared_spec():
    assert len(build_system_prompt()) > 200
    assert "CV" in build_system_prompt()


def test_user_prompt_interpolates_override_filename_and_text():
    prompt = build_user_prompt(
        cv_text="X CV CONTENT",
        source_file_name="cv-007.pdf",
        user_prompt_override="TARGET: Acme",
    )

    assert "TARGET: Acme" in prompt
    assert "cv-007.pdf" in prompt
    assert "X CV CONTENT" in prompt


def test_user_prompt_without_override_has_no_leading_blank_block():
    prompt = build_user_prompt(
        cv_text="X",
        source_file_name="a.pdf",
        user_prompt_override=None,
    )

    assert not prompt.startswith("\n")
```

- [ ] **Step 2: Write extraction tests**

Create `core/python/tests/test_extract.py`:

```python
import pytest

from cv_transpose_core.extract import UnsupportedMimeError, extract_text_from_bytes


def test_extract_text_from_fixture_pdf(repo_root):
    data = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    text = extract_text_from_bytes(data, "cv-001-junior-pm.pdf", "application/pdf")

    assert "Jane Smith" in text
    assert len(text) > 50


def test_extract_text_from_docx_fixture(repo_root):
    data = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()

    text = extract_text_from_bytes(
        data,
        "base.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    assert isinstance(text, str)


def test_extract_doc_is_rejected_without_libreoffice():
    with pytest.raises(UnsupportedMimeError, match="unsupported_mime"):
        extract_text_from_bytes(b"legacy", "old.doc", "application/msword")
```

- [ ] **Step 3: Run tests and verify missing modules**

Run:

```bash
make test-core-python
```

Expected: FAIL for missing `prompts` and `extract` modules.

- [ ] **Step 4: Implement prompt assembly**

Create `core/python/cv_transpose_core/prompts.py`:

```python
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


@lru_cache(maxsize=1)
def _prompt_parts() -> tuple[str, str]:
    md = (_repo_root() / "core/spec/prompts/extract-cv.md").read_text()
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
```

- [ ] **Step 5: Implement pure Python extraction**

Create `core/python/cv_transpose_core/extract.py`:

```python
from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from pypdf import PdfReader

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class UnsupportedMimeError(ValueError):
    pass


def _extract_docx_text(data: bytes) -> str:
    with ZipFile(BytesIO(data)) as zf:
        with zf.open("word/document.xml") as fh:
            xml = fh.read()
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", ns):
        runs = [node.text or "" for node in para.findall(".//w:t", ns)]
        paragraphs.append("".join(runs))
    return "\n".join(paragraphs)


def _extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("encrypted_pdf")
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def extract_text_from_bytes(data: bytes, original_name: str, mime: str) -> str:
    if mime == "application/pdf" or original_name.lower().endswith(".pdf"):
        return _extract_pdf_text(data)
    if mime == DOCX_MIME or original_name.lower().endswith(".docx"):
        return _extract_docx_text(data)
    if mime == "application/msword" or original_name.lower().endswith(".doc"):
        raise UnsupportedMimeError("unsupported_mime: application/msword")
    raise UnsupportedMimeError(f"unsupported_mime: {mime}")
```

- [ ] **Step 6: Run tests**

Run:

```bash
make test-core-python
```

Expected: prompt and extraction tests pass.

- [ ] **Step 7: Commit**

```bash
git add core/python/cv_transpose_core/prompts.py core/python/cv_transpose_core/extract.py core/python/tests/test_prompts.py core/python/tests/test_extract.py
git commit -m "feat(core-python): add shared prompt assembly and text extraction"
```

---

## Task 4: Manifest Validation And Contract Bridge

**Files:**
- Create: `core/python/cv_transpose_core/manifest.py`
- Create: `core/python/cv_transpose_core/contract.py`
- Create: `core/python/tests/test_manifest_contract.py`

- [ ] **Step 1: Write manifest and contract tests**

Create `core/python/tests/test_manifest_contract.py`:

```python
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
```

- [ ] **Step 2: Run tests and verify missing modules**

Run:

```bash
make test-core-python
```

Expected: FAIL for missing `manifest` and `contract`.

- [ ] **Step 3: Implement manifest validation**

Create `core/python/cv_transpose_core/manifest.py`:

```python
from __future__ import annotations

import re
from typing import Any


class ManifestError(ValueError):
    pass


SECTION_KINDS = {"experiences", "education", "skills", "languages", "certifications", "narrative"}
TENANT_RE = re.compile(r"^(direct|ms|gws):[A-Za-z0-9._-]+$")


def _require_obj(raw: Any, path: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ManifestError(f"{path}: expected object")
    return raw


def validate_template_manifest(raw: Any) -> dict[str, Any]:
    manifest = dict(_require_obj(raw, "manifest"))
    if manifest.get("version") != "1.0":
        raise ManifestError("version: expected 1.0")
    if not isinstance(manifest.get("tenantKey"), str) or not TENANT_RE.match(manifest["tenantKey"]):
        raise ManifestError("tenantKey: invalid")
    if not isinstance(manifest.get("naming"), str) or manifest["naming"].strip() == "":
        raise ManifestError("naming: expected non-empty string")
    header = _require_obj(manifest.get("header"), "header")
    for key in ["nameSlot", "titleLine1Slot", "titleLine2Slot"]:
        slot = _require_obj(header.get(key), f"header.{key}")
        for slot_key in ["paragraphIndex", "runIndex"]:
            if not isinstance(slot.get(slot_key), int) or slot[slot_key] < 0:
                raise ManifestError(f"header.{key}.{slot_key}: expected non-negative integer")
    sections = manifest.get("sections")
    if not isinstance(sections, list) or len(sections) == 0:
        raise ManifestError("sections: expected non-empty list")
    for idx, section in enumerate(sections):
        item = _require_obj(section, f"sections.{idx}")
        for key in ["id", "label"]:
            if not isinstance(item.get(key), str) or item[key].strip() == "":
                raise ManifestError(f"sections.{idx}.{key}: expected non-empty string")
        if item.get("kind") not in SECTION_KINDS:
            raise ManifestError(f"sections.{idx}.kind: invalid")
    return manifest
```

- [ ] **Step 4: Implement contract bridge**

Create `core/python/cv_transpose_core/contract.py`:

```python
from __future__ import annotations

import re
import unicodedata
from typing import Any

from .manifest import validate_template_manifest
from .types import BrandTokens

KNOWN_SECTION_KEYS = {
    "executiveSummary",
    "technicalSkills",
    "coreSkills",
    "sectorSkills",
    "sectorExperience",
    "experience",
    "selectedExperience",
    "additionalExperience",
    "languages",
    "education",
    "tools",
}


def _header_style_to_variant(style: str | None) -> str:
    return {
        "brand-accent": "brand-accent",
        "professional-classic": "consulting-classic",
        "modern-band": "executive-modern",
        "compact-split": "professional-compact",
    }.get(style or "ats-minimal", "ats-core")


def manifest_to_contract(manifest: dict[str, Any], brand: BrandTokens | None = None) -> dict[str, Any]:
    manifest = validate_template_manifest(manifest)
    rendering = manifest.get("rendering") or {}
    header_style = rendering.get("headerStyle") or "ats-minimal"
    section_style = rendering.get("sectionStyle") or "rule-caps"
    job_style = rendering.get("jobStyle") or "ats-plain"

    sections = []
    for section in manifest["sections"]:
        key = section["id"]
        if key not in KNOWN_SECTION_KEYS:
            raise ValueError(f'manifestToContract: section id "{key}" is not a known TemplateSectionKey')
        sections.append(
            {
                "key": key,
                "label": section["label"],
                "required": True,
                "repeatable": key in {"experience", "selectedExperience", "additionalExperience"},
            }
        )

    colors = {
        "accent": brand.primary if brand else "#1F2937",
        "sectionBannerFill": "#FFFFFF",
        "sectionBannerText": brand.primary if brand else "#111827",
        "headingText": brand.primary if brand else "#111827",
        "bodyText": "#111827",
        "mutedText": brand.secondary if brand else "#5B6470",
        **(rendering.get("colors") or {}),
    }
    fonts = {
        "heading": brand.font_family if brand else "Liberation Sans Narrow",
        "body": brand.font_family if brand else "Liberation Sans Narrow",
        **(rendering.get("fonts") or {}),
    }
    spacing = {
        "sectionBeforeTwip": 180,
        "sectionAfterTwip": 100,
        "lineTwip": 280,
        **(rendering.get("spacing") or {}),
    }

    return {
        "version": "v1",
        "layout": {"family": "single-column", "variant": _header_style_to_variant(header_style)},
        "header": {
            "fields": [
                {"key": "name", "placeholder": "Candidate Name"},
                {"key": "headline", "placeholder": "Role"},
                {"key": "subheadline", "placeholder": "Specialty"},
                {"key": "years_of_experience", "placeholder": "XX"},
            ],
            "limits": {
                "headlineMaxChars": manifest["header"]["titleLine1Slot"].get("maxChars", 40),
                "subheadlineMaxChars": manifest["header"]["titleLine2Slot"].get("maxChars", 40),
            },
        },
        "sections": sections,
        "styleTokens": {"colors": colors, "fonts": fonts, "spacing": spacing},
        "rendering": {"headerStyle": header_style, "sectionStyle": section_style, "jobStyle": job_style},
        "output": {"filenamePattern": manifest["naming"]},
    }


def _sanitize_file_token(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    stripped = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    token = re.sub(r"[^a-zA-Z0-9]+", "_", stripped)
    token = re.sub(r"_+", "_", token).strip("_")
    return token


def derive_output_name_from_contract(contract: dict[str, Any], original_name: str, cv_name: str) -> str:
    match = re.search(r"_(\d{4,})[\s.]", original_name)
    candidate_id = match.group(1) if match else ""
    first_name = _sanitize_file_token(cv_name.split()[0] if cv_name.split() else "Candidate") or "Candidate"
    full_name = _sanitize_file_token(cv_name) or first_name
    candidate_label = f"Candidate_{candidate_id}" if candidate_id else full_name
    resolved = (
        contract["output"]["filenamePattern"]
        .replace("{candidateId}", candidate_id)
        .replace("{firstName}", first_name)
        .replace("{name}", candidate_label)
    )
    resolved = re.sub(r"_+", "_", resolved)
    resolved = re.sub(r"_+\.", ".", resolved)
    if resolved.startswith("."):
        resolved = "CV_Profile" + resolved
    return resolved if resolved.endswith(".docx") else f"{resolved}.docx"
```

- [ ] **Step 5: Run tests**

Run:

```bash
make test-core-python
```

Expected: manifest and contract tests pass.

- [ ] **Step 6: Commit**

```bash
git add core/python/cv_transpose_core/manifest.py core/python/cv_transpose_core/contract.py core/python/tests/test_manifest_contract.py
git commit -m "feat(core-python): add manifest validation and contract bridge"
```

---

## Task 5: DOCX Rendering And Structural Validation

**Files:**
- Create: `core/python/cv_transpose_core/docx.py`
- Create: `core/python/cv_transpose_core/render.py`
- Create: `core/python/cv_transpose_core/validate.py`
- Create: `core/python/tests/test_render_validate.py`

- [ ] **Step 1: Write render and validation tests**

Create `core/python/tests/test_render_validate.py`:

```python
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
```

- [ ] **Step 2: Run tests and verify missing modules**

Run:

```bash
make test-core-python
```

Expected: FAIL for missing `docx`, `render`, or `validate` modules.

- [ ] **Step 3: Implement DOCX helper**

Create `core/python/cv_transpose_core/docx.py`:

```python
from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile
import xml.etree.ElementTree as ET

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NS}


def extract_text_from_docx_bytes(data: bytes) -> str:
    with ZipFile(BytesIO(data)) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", NS):
        texts = [node.text or "" for node in para.findall(".//w:t", NS)]
        paragraphs.append("".join(texts))
    return "\n".join(paragraphs)


def replace_docx_entries(base_docx: bytes, replacements: dict[str, bytes]) -> bytes:
    out = BytesIO()
    written = set()
    with ZipFile(BytesIO(base_docx)) as src, ZipFile(out, "w", ZIP_DEFLATED) as dst:
        for info in src.infolist():
            if info.filename in replacements:
                dst.writestr(info, replacements[info.filename])
                written.add(info.filename)
            else:
                dst.writestr(info, src.read(info.filename))
        for name, data in replacements.items():
            if name not in written:
                dst.writestr(name, data)
    return out.getvalue()
```

- [ ] **Step 4: Implement structural validation**

Create `core/python/cv_transpose_core/validate.py`:

```python
from __future__ import annotations

from .docx import extract_text_from_docx_bytes


def validate_docx_structure(docx_bytes: bytes, required_section_labels: list[str]) -> dict[str, list[str]]:
    text = extract_text_from_docx_bytes(docx_bytes).upper()
    found: list[str] = []
    missing: list[str] = []
    for label in required_section_labels:
        if not label:
            continue
        if label.upper() in text:
            found.append(label)
        else:
            missing.append(label)
    return {"missing": missing, "found": found}
```

- [ ] **Step 5: Implement first renderer**

Create `core/python/cv_transpose_core/render.py`:

```python
from __future__ import annotations

from html import escape
from typing import Any

from .docx import replace_docx_entries

DOCUMENT_PREFIX = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
"""
DOCUMENT_SUFFIX = """
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>
"""


def _p(text: str, *, bold: bool = False) -> str:
    b = "<w:b/><w:bCs/>" if bold else ""
    return (
        "    <w:p>"
        f"<w:r><w:rPr>{b}</w:rPr><w:t>{escape(text)}</w:t></w:r>"
        "</w:p>"
    )


def _section(label: str) -> str:
    return _p(label, bold=True)


def _render_profile(profile: dict[str, Any], contract: dict[str, Any]) -> str:
    parts: list[str] = [
        _p(profile["name"], bold=True),
        _p(profile.get("title_line1", "")),
        _p(profile.get("title_line2", "")),
        _p(str(profile.get("years", ""))),
    ]
    labels = {section["key"]: section["label"] for section in contract["sections"]}

    if "technicalSkills" in labels:
        parts.append(_section(labels["technicalSkills"]))
        for skill in profile.get("technicalSkills", []):
            parts.append(_p(f'{skill["label"]}: {skill["description"]}'))

    if "sectorSkills" in labels:
        parts.append(_section(labels["sectorSkills"]))
        for sector in profile.get("sectors", []):
            parts.append(_p(sector))
        for domain in profile.get("domains", []):
            parts.append(_p(domain))

    if "experience" in labels:
        parts.append(_section(labels["experience"]))
        for job in profile.get("experience", []):
            parts.append(_p(job["company"], bold=True))
            parts.append(_p(job["title"]))
            parts.append(_p(job["dates"]))
            parts.append(_p(job["description"]))
            for task in job.get("tasks", []):
                parts.append(_p(task))
            if job.get("techEnvironment"):
                parts.append(_p(job["techEnvironment"]))

    if "languages" in labels:
        parts.append(_section(labels["languages"]))
        for language in profile.get("languages", []):
            parts.append(_p(f'{language["label"]}: {language["level"]}'))

    if "education" in labels:
        parts.append(_section(labels["education"]))
        for education in profile.get("education", []):
            parts.append(_p(f'{education["year"]}: {education["description"]}'))

    return DOCUMENT_PREFIX + "\n".join(parts) + DOCUMENT_SUFFIX


def _header_xml(profile: dict[str, Any]) -> bytes:
    xml = DOCUMENT_PREFIX + "\n".join(
        [
            _p(profile["name"], bold=True),
            _p(profile.get("title_line1", "")),
            _p(profile.get("title_line2", "")),
            _p(str(profile.get("years", ""))),
        ]
    ) + DOCUMENT_SUFFIX
    return xml.encode("utf-8")


def render_docx(base_docx: bytes, profile: dict[str, Any], contract: dict[str, Any]) -> bytes:
    document = _render_profile(profile, contract).encode("utf-8")
    replacements = {"word/document.xml": document}
    replacements["word/header2.xml"] = _header_xml(profile)
    return replace_docx_entries(base_docx, replacements)
```

- [ ] **Step 6: Run tests**

Run:

```bash
make test-core-python
```

Expected: render and validation tests pass. Exact visual layout is not judged in this task.

- [ ] **Step 7: Commit**

```bash
git add core/python/cv_transpose_core/docx.py core/python/cv_transpose_core/render.py core/python/cv_transpose_core/validate.py core/python/tests/test_render_validate.py
git commit -m "feat(core-python): add docx rendering and structural validation"
```

---

## Task 6: DOCX Normalization Helper

**Files:**
- Create: `core/python/cv_transpose_core/normalize.py`
- Create: `core/python/tests/test_normalize.py`

- [ ] **Step 1: Write normalization tests**

Create `core/python/tests/test_normalize.py`:

```python
from cv_transpose_core.normalize import normalize_docx


def test_normalize_docx_returns_document_and_binary_hashes(repo_root):
    data = (repo_root / "core/golden/cv-001-junior-pm.scalian.docx").read_bytes()

    normalized = normalize_docx(data)

    assert "word/document.xml" in normalized["xml"]
    assert isinstance(normalized["xml"]["word/document.xml"], str)
    assert isinstance(normalized["binary_hashes"], dict)
```

- [ ] **Step 2: Run tests and verify missing module**

Run:

```bash
make test-core-python
```

Expected: FAIL for missing `normalize`.

- [ ] **Step 3: Implement normalization**

Create `core/python/cv_transpose_core/normalize.py`:

```python
from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile

from lxml import etree

NON_DETERMINISTIC_ATTR_SUFFIXES = (
    "rsidR",
    "rsidRPr",
    "rsidRDefault",
    "rsidP",
    "rsidTr",
    "editId",
)


def _local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1] if "}" in name else name


def _normalize_tree(raw: bytes) -> str:
    parser = etree.XMLParser(remove_blank_text=True, recover=True)
    root = etree.fromstring(raw, parser=parser)
    for el in root.iter():
        for attr in list(el.attrib):
            local = _local_name(attr)
            value = el.attrib[attr]
            if local in NON_DETERMINISTIC_ATTR_SUFFIXES:
                del el.attrib[attr]
            elif local.endswith("Id") and value.isdigit():
                del el.attrib[attr]
        if _local_name(el.tag) in {"created", "modified", "lastModifiedBy"}:
            el.text = ""
        if el.attrib:
            ordered = sorted(el.attrib.items(), key=lambda item: item[0])
            el.attrib.clear()
            el.attrib.update(ordered)
    return etree.tostring(root, encoding="unicode", pretty_print=True)


def normalize_docx(data: bytes) -> dict[str, dict[str, str]]:
    xml: dict[str, str] = {}
    binary_hashes: dict[str, str] = {}
    with ZipFile(BytesIO(data)) as zf:
        for name in sorted(zf.namelist()):
            raw = zf.read(name)
            if name.endswith(".xml"):
                xml[name] = _normalize_tree(raw)
            else:
                binary_hashes[name] = sha256(raw).hexdigest()
    return {"xml": xml, "binary_hashes": binary_hashes}
```

- [ ] **Step 4: Run tests**

Run:

```bash
make test-core-python
```

Expected: normalization tests pass.

- [ ] **Step 5: Commit**

```bash
git add core/python/cv_transpose_core/normalize.py core/python/tests/test_normalize.py
git commit -m "feat(core-python): add docx normalization helper"
```

---

## Task 7: Transpose Orchestration

**Files:**
- Modify: `core/python/cv_transpose_core/transpose.py`
- Create: `core/python/tests/test_transpose.py`

- [ ] **Step 1: Write transpose tests**

Create `core/python/tests/test_transpose.py`:

```python
import json

import pytest

from cv_transpose_core import (
    BrandTokens,
    InputFile,
    TemplateAssets,
    TransposeInput,
    transpose,
)
from cv_transpose_core.types import LlmCompleteResult


class FakeLlm:
    def __init__(self, profile):
        self.profile = profile
        self.calls = []

    async def complete(self, args):
        self.calls.append(args)
        return LlmCompleteResult(text=json.dumps(self.profile), usage={"inputTokens": 10, "outputTokens": 20})


@pytest.mark.asyncio
async def test_transpose_returns_enriched_result(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = FakeLlm(expected_profile)

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf", user_prompt_override="TARGET: Acme")],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=base_docx,
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
            ),
            persistence="ephemeral",
            llm=llm,
        )
    )

    item = result.results[0]
    assert item.errors == []
    assert item.profile["name"] == "Jane Smith"
    assert item.output_docx[:4] == b"PK\x03\x04"
    assert item.output_docx_name == "Scalian_Profile_Jane_Smith.docx"
    assert item.usage.total_tokens == 30
    assert "TARGET: Acme" in llm.calls[0].user_prompt
    assert "cv-001-junior-pm.pdf" in llm.calls[0].user_prompt


@pytest.mark.asyncio
async def test_transpose_captures_malformed_llm_json(repo_root, expected_profile):
    class BadLlm:
        async def complete(self, args):
            return {"text": "not json", "usage": {"inputTokens": 1, "outputTokens": 2}}

    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=base_docx,
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
            ),
            persistence="ephemeral",
            llm=BadLlm(),
        )
    )

    item = result.results[0]
    assert item.errors
    assert item.profile["name"] == "Candidate"
    assert item.usage.total_tokens == 3
```

- [ ] **Step 2: Add async pytest dependency**

Modify `core/python/pyproject.toml` test extras:

```toml
[project.optional-dependencies]
test = [
  "pytest>=8.2,<9",
  "pytest-asyncio>=0.23,<1",
]
```

- [ ] **Step 3: Run tests and verify transpose is still NotImplemented**

Run:

```bash
make test-core-python
```

Expected: FAIL with `NotImplementedError: transpose() is implemented in Task 8`.

- [ ] **Step 4: Implement transpose orchestration**

Replace `core/python/cv_transpose_core/transpose.py` with:

```python
from __future__ import annotations

import json
from typing import Any

from .contract import derive_output_name_from_contract, manifest_to_contract
from .extract import extract_text_from_bytes
from .profile import EMPTY_PROFILE_FALLBACK, validate_cv_data
from .prompts import build_system_prompt, build_user_prompt
from .render import render_docx
from .types import (
    AlignmentReport,
    DetectedFields,
    LlmCompleteArgs,
    LlmCompleteResult,
    TransposeInput,
    TransposedCv,
    TransposeOutput,
    Usage,
)
from .validate import validate_docx_structure


def _empty_report() -> AlignmentReport:
    return AlignmentReport(
        validation_passed=False,
        warnings=[],
        detected_fields=DetectedFields(experience_count=0, education_count=0, skill_buckets=0, languages_count=0),
        page1_sections_found=[],
        missing_required_sections=[],
        retries_used=0,
    )


def _detected_fields(profile: dict[str, Any]) -> DetectedFields:
    years = None
    try:
        years = int(str(profile.get("years") or ""))
    except ValueError:
        years = None
    return DetectedFields(
        name=profile.get("name"),
        title_line1=profile.get("title_line1"),
        title_line2=profile.get("title_line2"),
        years_of_experience=years,
        experience_count=len(profile.get("experience", [])),
        education_count=len(profile.get("education", [])),
        skill_buckets=len(profile.get("technicalSkills", [])),
        languages_count=len(profile.get("languages", [])),
    )


def _coerce_llm_result(raw: LlmCompleteResult | dict[str, Any]) -> LlmCompleteResult:
    if isinstance(raw, LlmCompleteResult):
        return raw
    return LlmCompleteResult(text=raw["text"], usage=raw.get("usage"))


async def _process_one(file, input_: TransposeInput, contract: dict[str, Any]) -> TransposedCv:
    errors: list[str] = []
    source_text = ""
    profile: dict[str, Any] | None = None
    output_docx = b""
    report = _empty_report()
    usage_in = 0
    usage_out = 0
    retries_used = 0
    max_retries = input_.extraction.max_validation_retries if input_.extraction else None
    if max_retries is None:
        max_retries = 1
    user_prompt_override = file.user_prompt_override

    try:
        source_text = extract_text_from_bytes(file.bytes_, file.name, file.mime)
        for attempt in range(max_retries + 1):
            if attempt > 0 and input_.stream_callbacks and input_.stream_callbacks.on_phase_change:
                input_.stream_callbacks.on_phase_change(file.name, "retry")
            args = LlmCompleteArgs(
                system_prompt=build_system_prompt(),
                user_prompt=build_user_prompt(
                    cv_text=source_text,
                    source_file_name=file.name,
                    user_prompt_override=user_prompt_override,
                ),
                max_tokens=8192,
                temperature=0.1,
                enable_reasoning=True if input_.extraction is None or input_.extraction.enable_reasoning is None else input_.extraction.enable_reasoning,
                reasoning_budget=input_.extraction.reasoning_budget if input_.extraction else None,
            )
            llm_result = _coerce_llm_result(await input_.llm.complete(args))
            if llm_result.usage:
                usage_in += int(llm_result.usage.get("inputTokens", llm_result.usage.get("input_tokens", 0)))
                usage_out += int(llm_result.usage.get("outputTokens", llm_result.usage.get("output_tokens", 0)))
            parsed = json.loads(llm_result.text)
            profile = validate_cv_data(parsed)
            output_docx = render_docx(input_.template.base_docx, profile, contract)
            required = [section["label"] for section in contract["sections"] if section["required"]]
            structure = validate_docx_structure(output_docx, required)
            report = AlignmentReport(
                validation_passed=len(structure["missing"]) == 0,
                warnings=[],
                detected_fields=_detected_fields(profile),
                page1_sections_found=structure["found"],
                missing_required_sections=structure["missing"],
                retries_used=retries_used,
            )
            if report.validation_passed or attempt >= max_retries:
                break
            retries_used += 1
            feedback = "; ".join([f'Missing required section "{s}"' for s in report.missing_required_sections])
            user_prompt_override = "\n\n".join(
                part
                for part in [
                    file.user_prompt_override or "",
                    f"VALIDATION ERRORS: {feedback}.",
                    "Shorten all skill descriptions to max 100 characters. Reduce sectors to max 4. Reduce domains to max 4.",
                ]
                if part
            )
        report.retries_used = retries_used
    except Exception as exc:
        errors.append(str(exc))
        report.retries_used = retries_used

    safe_profile = profile or dict(EMPTY_PROFILE_FALLBACK)
    output_name = derive_output_name_from_contract(contract, file.name, safe_profile["name"]) if not errors else ""
    return TransposedCv(
        source_file_name=file.name,
        output_docx_name=output_name,
        output_docx=output_docx,
        profile=safe_profile,
        source_text=source_text,
        usage=Usage(input_tokens=usage_in, output_tokens=usage_out, total_tokens=usage_in + usage_out),
        alignment_report=report,
        errors=errors,
    )


async def transpose(input_: TransposeInput) -> TransposeOutput:
    contract = manifest_to_contract(input_.template.manifest, input_.template.brand)
    results = []
    for file in input_.files:
        results.append(await _process_one(file, input_, contract))
    return TransposeOutput(results=results)
```

- [ ] **Step 5: Run tests**

Run:

```bash
make test-core-python
```

Expected: transpose tests pass.

- [ ] **Step 6: Commit**

```bash
git add core/python/pyproject.toml core/python/cv_transpose_core/transpose.py core/python/tests/test_transpose.py
git commit -m "feat(core-python): implement transpose orchestration"
```

---

## Task 8: Golden Equivalence Test

**Files:**
- Create: `core/python/tests/test_equivalence.py`
- Modify: `core/python/cv_transpose_core/render.py`

- [ ] **Step 1: Write equivalence test**

Create `core/python/tests/test_equivalence.py`:

```python
import json

import pytest

from cv_transpose_core import BrandTokens, InputFile, TemplateAssets, TransposeInput, transpose
from cv_transpose_core.normalize import normalize_docx
from cv_transpose_core.types import LlmCompleteResult


class FixtureLlm:
    def __init__(self, profile):
        self.profile = profile

    async def complete(self, args):
        return LlmCompleteResult(text=json.dumps(self.profile))


@pytest.mark.asyncio
async def test_python_output_matches_ts_golden_core_ooxml(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    golden = (repo_root / "core/golden/cv-001-junior-pm.scalian.docx").read_bytes()

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=base_docx,
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
            ),
            persistence="ephemeral",
            llm=FixtureLlm(expected_profile),
        )
    )

    item = result.results[0]
    assert item.errors == []
    py = normalize_docx(item.output_docx)
    ts = normalize_docx(golden)

    for entry in ["word/document.xml", "word/header2.xml"]:
        assert entry in py["xml"]
        assert entry in ts["xml"]
        assert py["xml"][entry] == ts["xml"][entry]
```

- [ ] **Step 2: Run equivalence test and inspect diff**

Run:

```bash
make test-core-python
```

Expected: FAIL on normalized OOXML equality, proving the current renderer is not yet at the scoped TS golden parity bar.

- [ ] **Step 3: Tighten renderer to parity for Scalian fixture**

Modify `core/python/cv_transpose_core/render.py` by porting the TS Scalian path needed by this fixture. Use these exact source references:

- `core/typescript/src/template/render.ts::sectionHeader`
- `core/typescript/src/template/render.ts::skillBullet`
- `core/typescript/src/template/render.ts::sectorCategory`
- `core/typescript/src/template/render.ts::sectorItem`
- `core/typescript/src/template/render.ts::jobCompany`
- `core/typescript/src/template/render.ts::jobDescription`
- `core/typescript/src/template/render.ts::jobTitleLine`
- `core/typescript/src/template/render.ts::jobBullet`
- `core/typescript/src/template/render.ts::buildTemplateDocumentXml`

The Python version must preserve section label order from
`contract["sections"]`, emit `technicalSkills`, `sectorSkills`, and
`experience` content in the same order as TS, and escape XML with
`html.escape`.

Use this deterministic paragraph id helper in `render.py`:

```python
class ParaIds:
    def __init__(self) -> None:
        self.value = 0x40000000

    def next(self) -> str:
        current = self.value
        self.value += 1
        return f"{current:08X}"
```

Then update `_p` to accept `ids: ParaIds` and emit `w14:paraId="{ids.next()}"`.

- [ ] **Step 4: Run equivalence until green**

Run:

```bash
make test-core-python
```

Expected: all Python tests pass, including `test_python_output_matches_ts_golden_core_ooxml`.

- [ ] **Step 5: Commit**

```bash
git add core/python/cv_transpose_core/render.py core/python/tests/test_equivalence.py
git commit -m "test(core-python): add scoped golden equivalence"
```

---

## Task 9: Final Verification And Documentation Pass

**Files:**
- Modify: `core/python/README.md`
- Modify: `core/golden/README.md` if the equivalence test changes its documented status.

- [ ] **Step 1: Update Python README with exact scope**

Replace `core/python/README.md` with:

```markdown
# cv_transpose_core Python

Python port of `@cv-transpose/core` for marketplace runtimes.

## Current Scope

- Mirrors `transpose()` v0.2 for the Scalian fixture path.
- Supports PDF and DOCX input.
- Rejects legacy `.doc` as `unsupported_mime`.
- Uses pure Python/package dependencies only: no LibreOffice, pandoc, pdftotext, shell commands, or network I/O inside the core.
- Runs structural DOCX validation. Page-1 LibreOffice validation remains TypeScript/API-only in this increment.

## Test

From the repo root:

```bash
make test-core-python
```
```

- [ ] **Step 2: Run Python test suite**

Run:

```bash
make test-core-python
```

Expected: all Python tests pass.

- [ ] **Step 3: Run existing TypeScript core tests through Docker**

Run:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript
```

Expected: existing core TypeScript tests pass.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only intended P1.2 files are modified/staged; unrelated existing untracked files remain untracked and untouched.

- [ ] **Step 5: Commit docs/final polish**

```bash
git add core/python/README.md core/golden/README.md
git commit -m "docs(core-python): document P1.2 scope and test command"
```

If `core/golden/README.md` was not modified, commit only `core/python/README.md`.

---

## Self-Review Checklist

- Spec coverage:
  - Public API mirror: Tasks 1, 2, 7.
  - PDF/DOCX support and `.doc` rejection: Task 3.
  - Prompt assembly from shared markdown: Task 3.
  - CvData validation: Task 2.
  - Manifest bridge: Task 4.
  - DOCX rendering: Task 5, tightened in Task 8.
  - Structural validation: Task 5.
  - Normalization/equivalence: Tasks 6 and 8.
  - Docker-safe test command: Task 1.
- Placeholder scan: none found.
- Type consistency:
  - Python uses `bytes_`, `base_docx`, `font_family`, `source_file_name`, `output_docx_name`.
  - LLM usage accepts both TS-style `inputTokens`/`outputTokens` and Python-style `input_tokens`/`output_tokens`.
- Commit discipline:
  - Each task ends in a scoped commit.
  - No commits include `Co-Authored-By Claude` or generated-tool footers.
