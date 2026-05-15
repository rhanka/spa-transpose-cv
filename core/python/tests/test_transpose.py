import json

import pytest

from cv_transpose_core import (
    BrandTokens,
    ExtractionOptions,
    InputFile,
    StreamCallbacks,
    TemplateAssets,
    TransposeInput,
    transpose,
)
from cv_transpose_core.types import LlmCompleteResult


class FakeLlm:
    def __init__(self, profile):
        self.profile = profile
        self.calls = []

    async def complete(self, **kwargs):
        self.calls.append(kwargs)
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
    assert "TARGET: Acme" in llm.calls[0]["user_prompt"]
    assert "cv-001-junior-pm.pdf" in llm.calls[0]["user_prompt"]
    assert llm.calls[0]["system_prompt"]
    assert llm.calls[0]["max_tokens"] == 16000
    assert llm.calls[0]["temperature"] == 0.1
    assert llm.calls[0]["enable_reasoning"] is True
    assert llm.calls[0]["response_format"] == "json"


@pytest.mark.asyncio
async def test_transpose_captures_malformed_llm_json(repo_root, expected_profile):
    class BadLlm:
        def __init__(self):
            self.calls = 0

        async def complete(self, **kwargs):
            self.calls += 1
            return {"text": "not json", "usage": {"inputTokens": 1, "outputTokens": 2}}

    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = BadLlm()

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
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
    assert item.errors
    assert item.profile["name"] == "Candidate"
    assert item.usage.total_tokens == 6
    assert llm.calls == 2


@pytest.mark.asyncio
async def test_transpose_retries_invalid_json_once_by_default(repo_root, expected_profile):
    class RetryLlm:
        def __init__(self):
            self.calls = []

        async def complete(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                return {"text": "not json", "usage": {"inputTokens": 1, "outputTokens": 2}}
            return {"text": json.dumps(expected_profile), "usage": {"inputTokens": 3, "outputTokens": 4}}

    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = RetryLlm()

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
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
    assert item.usage.total_tokens == 10
    assert len(llm.calls) == 2
    assert "PREVIOUS LLM OUTPUT WAS NOT VALID JSON" in llm.calls[1]["user_prompt"]


@pytest.mark.asyncio
async def test_transpose_honors_extraction_overrides_for_max_tokens_and_parse_retries(repo_root, expected_profile):
    class RetryLlm:
        def __init__(self):
            self.calls = []

        async def complete(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) <= 2:
                return {"text": "not json", "usage": {"inputTokens": 1, "outputTokens": 1}}
            return {"text": json.dumps(expected_profile), "usage": {"inputTokens": 2, "outputTokens": 2}}

    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = RetryLlm()

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=base_docx,
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
            ),
            persistence="ephemeral",
            llm=llm,
            extraction=ExtractionOptions(
                max_tokens=1234,
                max_parse_retries=2,
            ),
        )
    )

    item = result.results[0]
    assert item.errors == []
    assert item.profile["name"] == "Jane Smith"
    assert len(llm.calls) == 3
    assert [call["max_tokens"] for call in llm.calls] == [1234, 1234, 1234]
    assert item.usage.total_tokens == 8


@pytest.mark.asyncio
async def test_transpose_accepts_renderer_override(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = FakeLlm(expected_profile)

    result = await transpose(
        TransposeInput(
            files=[InputFile(name="cv-001-junior-pm.pdf", bytes_=cv, mime="application/pdf")],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=base_docx,
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
                renderer="legacy-scalian",
            ),
            persistence="ephemeral",
            llm=llm,
        )
    )

    item = result.results[0]
    assert item.errors == []
    assert item.output_docx[:4] == b"PK\x03\x04"


@pytest.mark.asyncio
async def test_transpose_emits_stream_callbacks(repo_root, expected_profile):
    class StreamingLlm:
        async def complete(self, **kwargs):
            assert kwargs["on_delta"] is not None
            kwargs["on_delta"]({"kind": "thinking", "text": "considering"})
            kwargs["on_delta"]({"kind": "content", "text": "profile json"})
            return LlmCompleteResult(text=json.dumps(expected_profile), usage={"inputTokens": 1, "outputTokens": 2})

    phases = []
    thinking = []
    content = []
    parsed_keys = []
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
            llm=StreamingLlm(),
            stream_callbacks=StreamCallbacks(
                on_phase_change=lambda file_name, phase: phases.append((file_name, phase)),
                on_thinking_delta=lambda file_name, text: thinking.append((file_name, text)),
                on_content_delta=lambda file_name, text: content.append((file_name, text)),
                on_parsed_keys=lambda file_name, keys: parsed_keys.append((file_name, keys)),
            ),
        )
    )

    assert result.results[0].errors == []
    assert phases == [
        ("cv-001-junior-pm.pdf", "extract-text"),
        ("cv-001-junior-pm.pdf", "extract-cv-llm"),
        ("cv-001-junior-pm.pdf", "render-docx"),
        ("cv-001-junior-pm.pdf", "validate-page1"),
        ("cv-001-junior-pm.pdf", "done"),
    ]
    assert thinking == [("cv-001-junior-pm.pdf", "considering")]
    assert content == [("cv-001-junior-pm.pdf", "profile json")]
    assert parsed_keys
    assert "name" in parsed_keys[0][1]
    assert "experience" in parsed_keys[0][1]


@pytest.mark.asyncio
async def test_failed_transpose_profiles_have_isolated_fallback_lists(repo_root):
    class BadLlm:
        async def complete(self, **kwargs):
            return {"text": "not json", "usage": {"inputTokens": 1, "outputTokens": 2}}

    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    result = await transpose(
        TransposeInput(
            files=[
                InputFile(name="first.pdf", bytes_=cv, mime="application/pdf"),
                InputFile(name="second.pdf", bytes_=cv, mime="application/pdf"),
            ],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=base_docx,
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
            ),
            persistence="ephemeral",
            llm=BadLlm(),
        )
    )

    result.results[0].profile["experience"].append({"company": "Mutated"})

    assert result.results[1].profile["experience"] == []


@pytest.mark.asyncio
async def test_transpose_captures_unreadable_base_docx_per_file(repo_root, expected_profile):
    class RecordingLlm:
        def __init__(self):
            self.calls = 0

        async def complete(self, **kwargs):
            self.calls += 1
            return LlmCompleteResult(text=json.dumps(expected_profile), usage=None)

    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = RecordingLlm()

    result = await transpose(
        TransposeInput(
            files=[
                InputFile(name="first.pdf", bytes_=cv, mime="application/pdf"),
                InputFile(name="second.pdf", bytes_=cv, mime="application/pdf"),
            ],
            template=TemplateAssets(
                manifest=manifest,
                base_docx=b"not a docx",
                brand=BrandTokens(primary="#0F2137", secondary="#23344A", accent="#7DB7E1", font_family="Lato"),
            ),
            persistence="ephemeral",
            llm=llm,
        )
    )

    assert llm.calls == 0
    assert len(result.results) == 2
    assert result.results[0].errors == ["base_docx_unreadable"]
    assert result.results[1].errors == ["base_docx_unreadable"]
    assert result.results[0].profile["name"] == "Candidate"
    assert result.results[1].profile["name"] == "Candidate"
