from __future__ import annotations

import base64
import json
import threading
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlparse

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_core import InputFile
from cv_transpose_core.types import LlmCompleteResult
from cv_transpose_marketplace.copilot import run_copilot_transpose
from cv_transpose_marketplace.gemini import run_gemini_transpose
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer


class FakeLlm:
    def __init__(self, profile: dict[str, Any]) -> None:
        self.profile = profile

    async def complete(self, **kwargs):
        return LlmCompleteResult(text=json.dumps(self.profile), usage={"inputTokens": 10, "outputTokens": 20})


def _generate_private_key_pem() -> str:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    parts = token.split(".")
    assert len(parts) == 3
    payload = parts[1]
    padding = "=" * ((4 - len(payload) % 4) % 4)
    return json.loads(base64.urlsafe_b64decode(payload + padding).decode("utf-8"))


@dataclass
class RecordedAssetsRequests:
    tenant_keys: list[str] = field(default_factory=list)
    bearer_tokens: list[str] = field(default_factory=list)
    claims: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class LocalAssetsServer:
    base_url: str
    recorded: RecordedAssetsRequests
    shutdown: Any


def _start_assets_server(repo_root, expected_tenant_key: str) -> LocalAssetsServer:
    manifest_bytes = (repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_bytes()
    base_docx_bytes = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    brand_bytes = json.dumps(
        {
            "primary": "#0F2137",
            "secondary": "#23344A",
            "accent": "#7DB7E1",
            "fontFamily": "Lato",
        }
    ).encode("utf-8")
    recorded = RecordedAssetsRequests()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            segments = parsed.path.strip("/").split("/")
            if len(segments) != 5 or segments[:3] != ["api", "v1", "tenants"]:
                self.send_error(404)
                return

            tenant_key = unquote(segments[3])
            resource = segments[4]
            auth_header = self.headers.get("Authorization")
            if auth_header is None or not auth_header.startswith("Bearer "):
                self.send_error(401)
                return

            bearer_token = auth_header.removeprefix("Bearer ")
            claims = _decode_jwt_payload(bearer_token)
            recorded.tenant_keys.append(tenant_key)
            recorded.bearer_tokens.append(bearer_token)
            recorded.claims.append(claims)

            if tenant_key != expected_tenant_key or claims.get("tk") != expected_tenant_key:
                self.send_error(401)
                return

            if resource == "manifest":
                body = manifest_bytes
                content_type = "application/json"
            elif resource == "base.docx":
                body = base_docx_bytes
                content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            elif resource == "brand":
                body = brand_bytes
                content_type = "application/json"
            else:
                self.send_error(404)
                return

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:  # noqa: A003
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return LocalAssetsServer(
        base_url=f"http://127.0.0.1:{server.server_address[1]}",
        recorded=recorded,
        shutdown=lambda: (server.shutdown(), thread.join(timeout=2), server.server_close()),
    )


@pytest.mark.asyncio
async def test_run_copilot_transpose_roundtrips_against_local_signed_assets_api(repo_root, expected_profile) -> None:
    server = _start_assets_server(repo_root, "ms:123e4567-e89b-12d3-a456-426614174000")
    issuer = RuntimeJwtIssuer(
        issuer="ms-copilot.cv-transpose.com",
        kid="copilot-key",
        private_key_pem=_generate_private_key_pem(),
    )
    try:
        result = await run_copilot_transpose(
            claims={"tid": "123E4567-E89B-12D3-A456-426614174000", "upn": "user@example.com"},
            files=[
                InputFile(
                    name="cv-001-junior-pm.pdf",
                    bytes_=(repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes(),
                    mime="application/pdf",
                )
            ],
            llm=FakeLlm(expected_profile),
            assets_base_url=server.base_url,
            make_bearer_token=lambda tenant_key, claims: issuer.mint_token(
                subject="user@example.com",
                tenant_key=tenant_key,
                issued_at=1_715_708_800,
            ),
        )
    finally:
        server.shutdown()

    assert result.tenant_key == "ms:123e4567-e89b-12d3-a456-426614174000"
    assert len(result.attachments) == 1
    assert server.recorded.tenant_keys == [result.tenant_key, result.tenant_key, result.tenant_key]
    assert all(claims["iss"] == "ms-copilot.cv-transpose.com" for claims in server.recorded.claims)
    assert all(claims["sub"] == "user@example.com" for claims in server.recorded.claims)
    assert all(claims["tk"] == result.tenant_key for claims in server.recorded.claims)


@pytest.mark.asyncio
async def test_run_gemini_transpose_roundtrips_against_local_signed_assets_api(repo_root, expected_profile) -> None:
    server = _start_assets_server(repo_root, "gws:workspace.example")
    issuer = RuntimeJwtIssuer(
        issuer="gemini-ent.cv-transpose.com",
        kid="gemini-key",
        private_key_pem=_generate_private_key_pem(),
    )
    try:
        result = await run_gemini_transpose(
            claims={"hd": "workspace.example", "email": "user@workspace.example"},
            files=[
                InputFile(
                    name="cv-001-junior-pm.pdf",
                    bytes_=(repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes(),
                    mime="application/pdf",
                )
            ],
            llm=FakeLlm(expected_profile),
            assets_base_url=server.base_url,
            assets_bearer_token=issuer.mint_token(
                subject="user@workspace.example",
                tenant_key="gws:workspace.example",
                issued_at=1_715_708_800,
            ),
        )
    finally:
        server.shutdown()

    assert result.tenant_key == "gws:workspace.example"
    assert result.artifact is not None
    assert server.recorded.tenant_keys == [result.tenant_key, result.tenant_key, result.tenant_key]
    assert all(claims["iss"] == "gemini-ent.cv-transpose.com" for claims in server.recorded.claims)
    assert all(claims["sub"] == "user@workspace.example" for claims in server.recorded.claims)
    assert all(claims["tk"] == result.tenant_key for claims in server.recorded.claims)
