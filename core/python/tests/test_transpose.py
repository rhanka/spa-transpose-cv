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
            files=[
                InputFile(
                    name="cv-001-junior-pm.pdf",
                    bytes_=cv,
                    mime="application/pdf",
                    user_prompt_override="TARGET: Acme",
                )
            ],
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
