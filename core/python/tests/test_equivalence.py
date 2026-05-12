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

    for entry in ["word/document.xml", "word/header1.xml", "word/header2.xml"]:
        assert entry in py["xml"]
        assert entry in ts["xml"]
        assert py["xml"][entry] == ts["xml"][entry]
