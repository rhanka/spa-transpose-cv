from __future__ import annotations

import base64
import inspect

import pytest


def test_build_transpose_cvs_function_declaration_exposes_only_llm_facing_args() -> None:
    from cv_transpose_marketplace.gemini_adk import build_transpose_cvs_function_declaration

    declaration = build_transpose_cvs_function_declaration()

    assert declaration["name"] == "transpose_cvs"
    description = declaration["description"]
    assert isinstance(description, str)
    assert "Workspace" in description
    assert "memory" in description.lower()

    parameters = declaration["parameters"]
    assert parameters["type"] == "object"
    assert parameters["required"] == ["files"]

    properties = parameters["properties"]
    assert set(properties) == {"files", "user_prompt"}

    files_schema = properties["files"]
    assert files_schema["type"] == "array"
    item_schema = files_schema["items"]
    assert item_schema["type"] == "object"
    assert set(item_schema["required"]) == {"name", "contentType", "bytesBase64"}

    user_prompt_schema = properties["user_prompt"]
    assert user_prompt_schema["type"] == "string"


def test_build_transpose_cvs_function_declaration_returns_independent_copy() -> None:
    from cv_transpose_marketplace.gemini_adk import build_transpose_cvs_function_declaration

    first = build_transpose_cvs_function_declaration()
    first["parameters"]["properties"]["files"]["items"]["required"].append("garbage")

    second = build_transpose_cvs_function_declaration()

    assert "garbage" not in second["parameters"]["properties"]["files"]["items"]["required"]


@pytest.mark.asyncio
async def test_make_transpose_cvs_tool_only_takes_llm_facing_args() -> None:
    from cv_transpose_marketplace.gemini_adk import make_transpose_cvs_tool
    from cv_transpose_marketplace.gemini_adk.types import GeminiToolResult
    from cv_transpose_marketplace.types import OutputArtifact

    captured: dict[str, object] = {}

    async def fake_run_gemini_transpose(**kwargs):
        captured.update(kwargs)
        from cv_transpose_marketplace.types import MarketplaceRunResult

        return MarketplaceRunResult(
            tenant_key="gws:workspace.example",
            results=[],
            artifact=OutputArtifact(
                name="Candidate.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes_=b"PK\x03\x04docx",
            ),
        )

    llm = object()
    tool = make_transpose_cvs_tool(
        claims={"hd": "workspace.example", "email": "user@workspace.example"},
        llm=llm,
        assets_base_url="https://cv-api.sent-tech.ca",
        assets_bearer_token="signed.jwt.token",
        assets_cache_ttl_seconds=120,
        run_fn=fake_run_gemini_transpose,
    )

    signature = inspect.signature(tool)
    assert list(signature.parameters) == ["files", "user_prompt"]

    result = await tool(
        files=[
            {
                "name": "candidate.pdf",
                "contentType": "application/pdf",
                "bytesBase64": base64.b64encode(b"pdf-bytes").decode("ascii"),
            }
        ],
        user_prompt="TARGET: Fabrikam",
    )

    assert captured["claims"] == {"hd": "workspace.example", "email": "user@workspace.example"}
    assert captured["assets_base_url"] == "https://cv-api.sent-tech.ca"
    assert captured["assets_bearer_token"] == "signed.jwt.token"
    assert captured["assets_cache_ttl_seconds"] == 120
    assert captured["user_prompt"] == "TARGET: Fabrikam"
    assert captured["llm"] is llm
    assert result["tenantKey"] == "gws:workspace.example"
    assert result["artifact"]["name"] == "Candidate.docx"


@pytest.mark.asyncio
async def test_make_transpose_cvs_tool_does_not_leak_caller_mutations() -> None:
    from cv_transpose_marketplace.gemini_adk import make_transpose_cvs_tool

    claims = {"hd": "workspace.example", "email": "user@workspace.example"}

    async def fake_run_gemini_transpose(**kwargs):
        from cv_transpose_marketplace.types import MarketplaceRunResult

        return MarketplaceRunResult(tenant_key=kwargs.get("claims", {}).get("hd", "?"), results=[], artifact=None)

    tool = make_transpose_cvs_tool(
        claims=claims,
        llm=object(),
        assets_base_url="https://cv-api.sent-tech.ca",
        assets_bearer_token="signed.jwt.token",
        run_fn=fake_run_gemini_transpose,
    )

    claims["hd"] = "evil.example"
    await tool(files=[], user_prompt=None)

    assert claims["hd"] == "evil.example"


def test_root_agent_fallback_exposes_function_declarations() -> None:
    from cv_transpose_marketplace.gemini_adk import build_root_agent, build_transpose_cvs_function_declaration

    agent = build_root_agent()

    assert isinstance(agent, dict)
    declarations = agent["function_declarations"]
    assert isinstance(declarations, list)
    assert len(declarations) == 1
    assert declarations[0] == build_transpose_cvs_function_declaration()
