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
