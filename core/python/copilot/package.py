from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


BUNDLE_TIMESTAMP = (2026, 1, 1, 0, 0, 0)
INCLUDED_ROOTS = ("copilot", "cv_transpose_core", "cv_transpose_marketplace")
TOP_LEVEL_FILES = ("pyproject.toml",)


def _python_root(repo_root: Path) -> Path:
    return repo_root / "core/python"


def iter_copilot_bundle_paths(repo_root: Path) -> list[tuple[Path, str]]:
    python_root = _python_root(repo_root)
    bundle_paths: list[tuple[Path, str]] = []

    for name in TOP_LEVEL_FILES:
        source = python_root / name
        bundle_paths.append((source, name))

    for root_name in INCLUDED_ROOTS:
        root = python_root / root_name
        for source in sorted(path for path in root.rglob("*") if path.is_file()):
            relative = source.relative_to(python_root).as_posix()
            if "__pycache__" in relative.split("/"):
                continue
            if relative.endswith(".pyc"):
                continue
            bundle_paths.append((source, relative))

    return bundle_paths


def build_copilot_bundle(repo_root: Path, output_path: Path | None = None) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for source, relative in iter_copilot_bundle_paths(repo_root):
            info = ZipInfo(relative, date_time=BUNDLE_TIMESTAMP)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())

    data = buffer.getvalue()
    if output_path is not None:
        output_path.write_bytes(data)
    return data
