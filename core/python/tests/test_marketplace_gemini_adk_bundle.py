from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile


EXPECTED_GEMINI_ADK_PATHS = [
    "cv_transpose_marketplace/gemini_adk/__init__.py",
    "cv_transpose_marketplace/gemini_adk/__main__.py",
    "cv_transpose_marketplace/gemini_adk/agent.py",
    "cv_transpose_marketplace/gemini_adk/http.py",
    "cv_transpose_marketplace/gemini_adk/model_config.py",
    "cv_transpose_marketplace/gemini_adk/package.py",
    "cv_transpose_marketplace/gemini_adk/request.schema.json",
    "cv_transpose_marketplace/gemini_adk/response.schema.json",
    "cv_transpose_marketplace/gemini_adk/runtime.py",
    "cv_transpose_marketplace/gemini_adk/tool.py",
    "cv_transpose_marketplace/gemini_adk/types.py",
]


def test_gemini_adk_bundle_builder_is_deterministic_and_includes_runtime_scaffold(repo_root, tmp_path) -> None:
    from cv_transpose_marketplace.gemini_adk import build_gemini_adk_bundle, iter_gemini_adk_bundle_paths

    bundle_path = tmp_path / "gemini-adk-bundle.zip"
    first = build_gemini_adk_bundle(repo_root, bundle_path)
    second = build_gemini_adk_bundle(repo_root)

    assert first == second
    assert bundle_path.read_bytes() == first

    listed = [relative for _, relative in iter_gemini_adk_bundle_paths(repo_root)]
    archive = ZipFile(BytesIO(first))
    names = archive.namelist()

    assert names == listed
    assert "pyproject.toml" in names
    assert "cv_transpose_core/spec/prompts/extract-cv.md" in names
    assert "cv_transpose_marketplace/assets.py" in names
    assert "cv_transpose_marketplace/gemini.py" in names
    assert "cv_transpose_marketplace/report.py" in names
    assert not any("__pycache__" in name for name in names)
    assert not any(name.endswith(".pyc") for name in names)

    for info in archive.infolist():
        assert info.date_time == (2026, 1, 1, 0, 0, 0)
        assert info.external_attr >> 16 == 0o100644


def test_gemini_adk_bundle_paths_keep_runtime_files_explicit(repo_root) -> None:
    from cv_transpose_marketplace.gemini_adk import iter_gemini_adk_bundle_paths

    listed = [relative for _, relative in iter_gemini_adk_bundle_paths(repo_root)]
    gemini_paths = [relative for relative in listed if relative.startswith("cv_transpose_marketplace/gemini_adk/")]

    assert gemini_paths == sorted(gemini_paths)
    assert set(gemini_paths) == set(EXPECTED_GEMINI_ADK_PATHS)
