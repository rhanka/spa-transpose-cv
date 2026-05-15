from __future__ import annotations

import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_marketplace.copilot import CopilotActionResult, CopilotAttachment
from cv_transpose_marketplace.gemini_adk.types import GeminiToolResult
from cv_transpose_marketplace.types import OutputArtifact


@pytest.fixture
def private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


@pytest.mark.asyncio
async def test_copilot_http_adapter_serves_jwks(private_key_pem: str) -> None:
    from copilot.http import handle_http_request

    response = await handle_http_request(
        "GET",
        "/.well-known/jwks.json",
        b"",
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
    )

    assert response.status == 200
    assert response.headers["content-type"] == "application/json"
    payload = json.loads(response.body)
    assert payload["keys"][0]["kid"] == "copilot-key"


@pytest.mark.asyncio
async def test_copilot_http_adapter_posts_action_payload(private_key_pem: str) -> None:
    from copilot.http import handle_http_request

    captured: dict[str, object] = {}

    async def fake_run_copilot_transpose(**kwargs):
        captured.update(kwargs)
        return CopilotActionResult(
            tenant_key="ms:123e4567-e89b-12d3-a456-426614174000",
            attachments=[
                CopilotAttachment(
                    name="result.docx",
                    content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    bytes_=b"PK\x03\x04docx",
                )
            ],
            card={"type": "AdaptiveCard", "version": "1.5", "body": []},
            transpose_output=None,  # type: ignore[arg-type]
        )

    response = await handle_http_request(
        "POST",
        "/actions/transposeCvs",
        json.dumps(
            {
                "files": [],
                "context": {
                    "identity": {
                        "tid": "123E4567-E89B-12D3-A456-426614174000",
                        "upn": "user@example.com",
                    }
                },
            }
        ).encode("utf-8"),
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        run_transpose=fake_run_copilot_transpose,
    )

    assert response.status == 200
    assert captured["assets_base_url"] == "https://cv-api.sent-tech.ca"
    payload = json.loads(response.body)
    assert payload["tenantKey"] == "ms:123e4567-e89b-12d3-a456-426614174000"
    assert payload["attachments"][0]["name"] == "result.docx"


@pytest.mark.asyncio
async def test_copilot_http_adapter_downloads_graph_file_payload(private_key_pem: str) -> None:
    from copilot.http import handle_http_request

    captured: dict[str, object] = {}

    def fake_download_file(url: str, item: dict[str, object]) -> bytes:
        captured["download_url"] = url
        captured["download_item"] = item
        return b"graph-pdf-bytes"

    async def fake_run_copilot_transpose(**kwargs):
        captured["files"] = kwargs["files"]
        return CopilotActionResult(
            tenant_key="ms:123e4567-e89b-12d3-a456-426614174000",
            attachments=[],
            card={"type": "AdaptiveCard", "version": "1.5", "body": []},
            transpose_output=None,  # type: ignore[arg-type]
        )

    response = await handle_http_request(
        "POST",
        "/actions/transposeCvs",
        json.dumps(
            {
                "files": [
                    {
                        "name": "candidate.pdf",
                        "contentType": "application/pdf",
                        "downloadUrl": "https://graph.microsoft.com/v1.0/me/drive/items/123/content",
                    }
                ],
                "context": {
                    "identity": {
                        "tid": "123E4567-E89B-12D3-A456-426614174000",
                        "upn": "user@example.com",
                    }
                },
            }
        ).encode("utf-8"),
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        run_transpose=fake_run_copilot_transpose,
        download_file=fake_download_file,
    )

    assert response.status == 200
    assert captured["download_url"] == "https://graph.microsoft.com/v1.0/me/drive/items/123/content"
    assert captured["download_item"]["name"] == "candidate.pdf"
    files = captured["files"]
    assert len(files) == 1
    assert files[0].bytes_ == b"graph-pdf-bytes"


@pytest.mark.asyncio
async def test_copilot_http_adapter_rejects_invalid_json(private_key_pem: str) -> None:
    from copilot.http import handle_http_request

    response = await handle_http_request(
        "POST",
        "/actions/transposeCvs",
        b"{",
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
    )

    assert response.status == 400
    assert json.loads(response.body) == {"error": "invalid_json"}


@pytest.mark.asyncio
async def test_copilot_http_adapter_rejects_invalid_request_payload(private_key_pem: str) -> None:
    from copilot.http import handle_http_request

    response = await handle_http_request(
        "POST",
        "/actions/transposeCvs",
        json.dumps(
            {
                "files": [
                    {
                        "name": "candidate.pdf",
                        "contentType": "application/pdf",
                    }
                ],
                "context": {
                    "identity": {
                        "tid": "123E4567-E89B-12D3-A456-426614174000",
                    }
                },
            }
        ).encode("utf-8"),
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
    )

    assert response.status == 400
    payload = json.loads(response.body)
    assert payload["error"] == "invalid_request"
    assert "bytesBase64 or downloadUrl" in payload["message"]


@pytest.mark.asyncio
async def test_gemini_http_adapter_serves_jwks(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.http import handle_http_request

    response = await handle_http_request(
        "GET",
        "/.well-known/jwks.json",
        b"",
        llm=object(),
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_GEMINI_JWT_ISSUER": "gemini-ent.cv-transpose.com",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
    )

    assert response.status == 200
    assert response.headers["content-type"] == "application/json"
    payload = json.loads(response.body)
    assert payload["keys"][0]["kid"] == "gemini-key"


@pytest.mark.asyncio
async def test_gemini_http_adapter_posts_tool_payload(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.http import handle_http_request

    captured: dict[str, object] = {}

    async def fake_transpose_tool(request, *, llm):
        captured["request"] = request
        return GeminiToolResult(
            tenant_key="gws:workspace.example",
            artifact=OutputArtifact(
                name="Candidate.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes_=b"PK\x03\x04docx",
            ),
            report_card={"files": 1, "succeeded": 1, "failed": 0, "warnings": 0},
            results=[],
        )

    response = await handle_http_request(
        "POST",
        "/tools/transposeCvs",
        json.dumps(
            {
                "files": [],
                "context": {
                    "identity": {
                        "hd": "workspace.example",
                        "email": "user@workspace.example",
                    }
                },
            }
        ).encode("utf-8"),
        llm=object(),
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_GEMINI_JWT_ISSUER": "gemini-ent.cv-transpose.com",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        transpose_tool=fake_transpose_tool,
    )

    assert response.status == 200
    request = captured["request"]
    assert request.assets_base_url == "https://cv-api.sent-tech.ca"
    assert request.claims["hd"] == "workspace.example"
    payload = json.loads(response.body)
    assert payload["tenantKey"] == "gws:workspace.example"
    assert payload["artifact"]["name"] == "Candidate.docx"


@pytest.mark.asyncio
async def test_gemini_http_adapter_rejects_invalid_request_payload(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.http import handle_http_request

    response = await handle_http_request(
        "POST",
        "/tools/transposeCvs",
        json.dumps(
            {
                "files": [],
                "context": {
                    "identity": {
                        "email": "user@workspace.example",
                    }
                },
            }
        ).encode("utf-8"),
        llm=object(),
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_GEMINI_JWT_ISSUER": "gemini-ent.cv-transpose.com",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
    )

    assert response.status == 400
    payload = json.loads(response.body)
    assert payload["error"] == "invalid_request"
    assert "primary domain" in payload["message"]
