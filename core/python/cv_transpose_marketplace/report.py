from __future__ import annotations

from typing import Any, Sequence

from cv_transpose_core.types import TransposedCv


def _build_item(result: TransposedCv) -> dict[str, Any]:
    if result.errors:
        return {
            "sourceFileName": result.source_file_name,
            "outputDocxName": result.output_docx_name,
            "validationPassed": False,
            "warnings": [],
            "sectionsDetected": [],
            "missingRequiredSections": [],
            "retriesUsed": 0,
            "errors": list(result.errors),
        }

    alignment_report = result.alignment_report
    return {
        "sourceFileName": result.source_file_name,
        "outputDocxName": result.output_docx_name,
        "validationPassed": alignment_report.validation_passed,
        "warnings": list(alignment_report.warnings),
        "sectionsDetected": list(alignment_report.page1_sections_found),
        "missingRequiredSections": list(alignment_report.missing_required_sections),
        "retriesUsed": alignment_report.retries_used,
    }


def build_alignment_report(results: Sequence[TransposedCv]) -> dict[str, Any]:
    successful = [result for result in results if not result.errors]
    warnings = sum(len(result.alignment_report.warnings) for result in successful)
    validation_passed = sum(1 for result in successful if result.alignment_report.validation_passed)
    alignment_score = 0 if not successful else round((validation_passed / len(successful)) * 100)
    return {
        "files": len(results),
        "succeeded": len(successful),
        "failed": len(results) - len(successful),
        "warnings": warnings,
        "alignmentScore": alignment_score,
        "items": [_build_item(result) for result in results],
    }
