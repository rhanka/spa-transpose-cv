import json
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from cv_transpose_core import (
    BrandTokens,
    InputFile,
    StreamCallbacks,
    TemplateAssets,
    TransposeInput,
    transpose,
)
from cv_transpose_core.normalize import normalize_docx
from cv_transpose_core.types import LlmCompleteResult


class FixtureLlm:
    def __init__(self, profile):
        self.profile = profile

    async def complete(self, **kwargs):
        return LlmCompleteResult(text=json.dumps(self.profile))


class RecordingLlm:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls: list[dict] = []

    async def complete(self, **kwargs):
        self.calls.append(kwargs)
        return LlmCompleteResult(text=self.text)


def _minimal_docx(document_xml: str) -> bytes:
    out = BytesIO()
    with ZipFile(out, "w", ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", document_xml.encode("utf-8"))
    return out.getvalue()


def _document_xml(paragraphs: list[str]) -> str:
    body = "\n".join(
        f"<w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p>" for paragraph in paragraphs
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{body}</w:body>
</w:document>
"""


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

    common_headers = sorted(
        entry
        for entry in set(py["xml"]) & set(ts["xml"])
        if entry.startswith("word/header") and entry.endswith(".xml")
    )
    assert {"word/header1.xml", "word/header2.xml"} <= set(common_headers)

    for entry in ["word/document.xml", *common_headers]:
        assert entry in py["xml"]
        assert entry in ts["xml"]
        assert py["xml"][entry] == ts["xml"][entry]


@pytest.mark.asyncio
async def test_python_extraction_budget_matches_ts_for_long_cv(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    long_cv_text = "\n".join(
        f"Experience {i}: cloud transformation, programme delivery, architecture governance, data platforms, security, and operations."
        for i in range(900)
    )
    long_docx = _minimal_docx(_document_xml([long_cv_text]))
    llm = RecordingLlm(json.dumps(expected_profile))

    result = await transpose(
        TransposeInput(
            files=[
                InputFile(
                    name="long-cv.docx",
                    bytes_=long_docx,
                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    assert len(item.source_text) > 30_000
    assert len(llm.calls) == 1
    assert llm.calls[0]["max_tokens"] == 32000


@pytest.mark.asyncio
async def test_python_accepts_fenced_json_like_ts(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    llm = RecordingLlm(f"```json\n{json.dumps(expected_profile)}\n```")

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
    assert item.profile["name"] == expected_profile["name"]


@pytest.mark.asyncio
async def test_python_retry_contract_matches_ts_for_parse_retry(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    class ParseRetryLlm:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        async def complete(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                return LlmCompleteResult(
                    text='Let me now construct the final JSON.\n{"name":"Jane Smith"',
                    usage={"inputTokens": 10, "outputTokens": 20},
                )
            return LlmCompleteResult(
                text=json.dumps(expected_profile),
                usage={"inputTokens": 11, "outputTokens": 21},
            )

    llm = ParseRetryLlm()

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
    assert item.profile["name"] == expected_profile["name"]
    assert len(llm.calls) == 2
    assert "PREVIOUS LLM OUTPUT WAS NOT VALID JSON" in llm.calls[1]["user_prompt"]
    assert [call["max_tokens"] for call in llm.calls] == [16000, 16000]
    assert [call["response_format"] for call in llm.calls] == ["json", "json"]
    assert item.usage.input_tokens == 21
    assert item.usage.output_tokens == 41


@pytest.mark.asyncio
async def test_python_error_contract_matches_ts_for_persistent_malformed_json(repo_root):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()

    class BadLlm:
        def __init__(self) -> None:
            self.calls = 0

        async def complete(self, **kwargs):
            self.calls += 1
            return LlmCompleteResult(
                text="this is not JSON",
                usage={"inputTokens": 10, "outputTokens": 5},
            )

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
    assert llm.calls == 2
    assert item.profile["name"] == "Candidate"
    assert len(item.source_text) > 50
    assert item.usage.input_tokens == 20
    assert item.usage.output_tokens == 10
    assert item.usage.total_tokens == 30
    assert isinstance(item.output_docx, bytes)


@pytest.mark.asyncio
async def test_python_callback_contract_matches_ts(repo_root, expected_profile):
    manifest = json.loads((repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_text())
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    cv = (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
    phases: list[tuple[str, str]] = []
    thinking: list[tuple[str, str]] = []
    content: list[tuple[str, str]] = []
    parsed_keys: list[tuple[str, list[str]]] = []

    class StreamingLlm:
        async def complete(self, **kwargs):
            kwargs["on_delta"]({"kind": "thinking", "text": "considering"})
            kwargs["on_delta"]({"kind": "content", "text": "profile json"})
            return LlmCompleteResult(
                text=json.dumps(expected_profile),
                usage={"inputTokens": 1, "outputTokens": 2},
            )

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
