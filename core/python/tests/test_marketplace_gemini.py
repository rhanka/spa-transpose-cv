from __future__ import annotations

import json

import pytest

from cv_transpose_core import BrandTokens, InputFile, TemplateAssets, transpose
from cv_transpose_core.types import LlmCompleteResult
from cv_transpose_marketplace.gemini import run_gemini_transpose


class FakeLlm:
    def __init__(self, profile: dict) -> None:
        self.profile = profile

    async def complete(self, **kwargs):
        return LlmCompleteResult(text=json.dumps(self.profile), usage={"inputTokens": 10, "outputTokens": 20})


@pytest.mark.asyncio
async def test_run_gemini_transpose_derives_gws_tenant_and_returns_docx(repo_root, expected_profile) -> None:
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    captured: dict[str, object] = {}

    def fetch_assets(**kwargs) -> TemplateAssets:
        captured["assets_kwargs"] = kwargs
        return TemplateAssets(
            manifest=manifest,
            base_docx=base_docx,
            brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
        )

    result = await run_gemini_transpose(
        claims={"hd": "Example.COM", "email": "user@example.com"},
        files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        assets_bearer_token="signed.jwt.token",
        fetch_assets=fetch_assets,
    )

    assert result.tenant_key == "gws:example.com"
    assert result.artifact is not None
    assert result.artifact.name == "Scalian_Profile_Jane_Smith.docx"
    assert result.artifact.mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert captured["assets_kwargs"] == {
        "base_url": "https://cv-api.sent-tech.ca",
        "tenant_key": "gws:example.com",
        "bearer_token": "signed.jwt.token",
    }


@pytest.mark.asyncio
async def test_run_gemini_transpose_passes_user_prompt_override(repo_root, expected_profile) -> None:
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    seen_prompt: list[str | None] = []

    async def fake_transpose(input_):
        seen_prompt.extend(file.user_prompt_override for file in input_.files)
        return await transpose(input_)

    result = await run_gemini_transpose(
        claims={"email": "user@workspace.example"},
        files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        assets_bearer_token="signed.jwt.token",
        fetch_assets=lambda **kwargs: TemplateAssets(
            manifest=manifest,
            base_docx=base_docx,
            brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
        ),
        user_prompt="TARGET: Fabrikam",
        transpose_fn=fake_transpose,
    )

    assert result.results[0].errors == []
    assert seen_prompt == ["TARGET: Fabrikam"]
