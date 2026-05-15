from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from cv_transpose_core import InputFile


PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOC_MIME = "application/msword"


class MarketplaceInputError(ValueError):
    pass


def _legacy_doc_message(file_name: str) -> str:
    return (
        f"Legacy .doc uploads are not supported in the Python marketplace runtime: {file_name}. "
        "Upload PDF or DOCX instead."
    )


def validate_marketplace_file(*, name: str, mime: str) -> Literal["pdf", "docx"]:
    lower_name = name.lower()
    lower_mime = mime.lower()

    if lower_name.endswith(".doc"):
        raise MarketplaceInputError(_legacy_doc_message(name))
    if lower_name.endswith(".docx"):
        return "docx"
    if lower_name.endswith(".pdf"):
        return "pdf"
    if lower_mime == DOCX_MIME:
        return "docx"
    if lower_mime == PDF_MIME:
        return "pdf"
    if lower_mime == DOC_MIME:
        raise MarketplaceInputError(_legacy_doc_message(name))
    raise MarketplaceInputError(
        f"Unsupported marketplace file type for {name}: {mime}. Upload PDF or DOCX instead."
    )


def assert_marketplace_upload_allowed(file_name: str, mime: str) -> None:
    validate_marketplace_file(name=file_name, mime=mime)


def validate_marketplace_files(files: Sequence[InputFile]) -> None:
    for file in files:
        assert_marketplace_upload_allowed(file.name, file.mime)
