from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


BUNDLE_TIMESTAMP = (2026, 1, 1, 0, 0, 0)
INCLUDED_ROOTS = ("cv_transpose_core", "cv_transpose_marketplace")
TOP_LEVEL_FILES = ("pyproject.toml",)
REQUIRED_GEMINI_ADK_PATHS = (
    "cv_transpose_marketplace/gemini_adk/__init__.py",
    "cv_transpose_marketplace/gemini_adk/__main__.py",
    "cv_transpose_marketplace/gemini_adk/agent.py",
    "cv_transpose_marketplace/gemini_adk/http.py",
    "cv_transpose_marketplace/gemini_adk/model_config.py",
    "cv_transpose_marketplace/gemini_adk/package.py",
    "cv_transpose_marketplace/gemini_adk/prompts/__init__.py",
    "cv_transpose_marketplace/gemini_adk/prompts/transpose_cvs.md",
    "cv_transpose_marketplace/gemini_adk/request.schema.json",
    "cv_transpose_marketplace/gemini_adk/response.schema.json",
    "cv_transpose_marketplace/gemini_adk/runner.py",
    "cv_transpose_marketplace/gemini_adk/runtime.py",
    "cv_transpose_marketplace/gemini_adk/tool.py",
    "cv_transpose_marketplace/gemini_adk/types.py",
)


def _python_root(repo_root: Path) -> Path:
    return repo_root / "core/python"


def iter_gemini_adk_bundle_paths(repo_root: Path) -> list[tuple[Path, str]]:
    python_root = _python_root(repo_root)
    bundle_paths: list[tuple[Path, str]] = []
    included_relatives: set[str] = set()

    for name in TOP_LEVEL_FILES:
        source = python_root / name
        bundle_paths.append((source, name))
        included_relatives.add(name)

    for root_name in INCLUDED_ROOTS:
        root = python_root / root_name
        for source in sorted(path for path in root.rglob("*") if path.is_file()):
            relative = source.relative_to(python_root).as_posix()
            if "__pycache__" in relative.split("/"):
                continue
            if relative.endswith(".pyc"):
                continue
            bundle_paths.append((source, relative))
            included_relatives.add(relative)

    missing = [relative for relative in REQUIRED_GEMINI_ADK_PATHS if relative not in included_relatives]
    if missing:
        missing_display = ", ".join(missing)
        raise FileNotFoundError(f"Missing Gemini ADK bundle files: {missing_display}")

    return bundle_paths


def build_gemini_adk_bundle(repo_root: Path, output_path: Path | None = None) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for source, relative in iter_gemini_adk_bundle_paths(repo_root):
            info = ZipInfo(relative, date_time=BUNDLE_TIMESTAMP)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())

    data = buffer.getvalue()
    if output_path is not None:
        output_path.write_bytes(data)
    return data
