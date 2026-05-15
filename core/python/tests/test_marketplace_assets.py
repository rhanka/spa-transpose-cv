from __future__ import annotations

import json
from urllib.error import HTTPError

import pytest

from cv_transpose_marketplace import (
    AssetsApiError,
    InvalidJwtError,
    TenantNotConfiguredError,
    fetch_template_assets,
)


class FakeHttpResponse:
    def __init__(self, body: bytes, status: int = 200, content_type: str = "application/json") -> None:
        self._body = body
        self.status = status
        self.headers = {"Content-Type": content_type}

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "FakeHttpResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def close(self) -> None:
        return None


def test_fetch_template_assets_loads_manifest_docx_and_brand(repo_root) -> None:
    manifest = (repo_root / "core/fixtures/templates-test/scalian/manifest.json").read_bytes()
    base_docx = (repo_root / "core/fixtures/templates-test/scalian/base.docx").read_bytes()
    brand = json.dumps(
        {
            "primary": "#0F2137",
            "secondary": "#23344A",
            "accent": "#7DB7E1",
            "fontFamily": "Lato",
        }
    ).encode("utf-8")
    seen_urls: list[str] = []
    seen_auth: list[str | None] = []

    def fake_urlopen(request, timeout=0):
        seen_urls.append(request.full_url)
        seen_auth.append(request.get_header("Authorization"))
        if request.full_url.endswith("/manifest"):
            return FakeHttpResponse(manifest)
        if request.full_url.endswith("/base.docx"):
            return FakeHttpResponse(
                base_docx,
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        if request.full_url.endswith("/brand"):
            return FakeHttpResponse(brand)
        raise AssertionError(f"Unexpected URL {request.full_url}")

    assets = fetch_template_assets(
        base_url="https://cv-api.sent-tech.ca",
        tenant_key="direct:scalian",
        bearer_token="signed.jwt.token",
        urlopen=fake_urlopen,
    )

    assert assets.manifest["tenantKey"] == "direct:scalian-test"
    assert assets.base_docx[:4] == b"PK\x03\x04"
    assert assets.brand.font_family == "Lato"
    assert seen_urls == [
        "https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/manifest",
        "https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/base.docx",
        "https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/brand",
    ]
    assert seen_auth == ["Bearer signed.jwt.token"] * 3


def test_fetch_template_assets_raises_tenant_not_configured_on_404() -> None:
    def fake_urlopen(request, timeout=0):
        raise HTTPError(request.full_url, 404, "not found", hdrs=None, fp=None)

    with pytest.raises(TenantNotConfiguredError, match="direct:missing"):
        fetch_template_assets(
            base_url="https://cv-api.sent-tech.ca",
            tenant_key="direct:missing",
            bearer_token="signed.jwt.token",
            urlopen=fake_urlopen,
        )


def test_fetch_template_assets_raises_invalid_jwt_error_on_401_with_reason() -> None:
    def fake_urlopen(request, timeout=0):
        raise HTTPError(
            request.full_url,
            401,
            "unauthorized",
            hdrs=None,
            fp=FakeHttpResponse(b'{"error":"invalid_jwt","reason":"tk_mismatch"}'),
        )

    with pytest.raises(InvalidJwtError, match="tk_mismatch") as exc_info:
        fetch_template_assets(
            base_url="https://cv-api.sent-tech.ca",
            tenant_key="direct:scalian",
            bearer_token="signed.jwt.token",
            urlopen=fake_urlopen,
        )

    assert exc_info.value.reason == "tk_mismatch"


def test_fetch_template_assets_raises_invalid_jwt_error_without_reason_on_non_json_401() -> None:
    def fake_urlopen(request, timeout=0):
        raise HTTPError(
            request.full_url,
            401,
            "unauthorized",
            hdrs=None,
            fp=FakeHttpResponse(b"not-json"),
        )

    with pytest.raises(InvalidJwtError, match="manifest") as exc_info:
        fetch_template_assets(
            base_url="https://cv-api.sent-tech.ca",
            tenant_key="direct:scalian",
            bearer_token="signed.jwt.token",
            urlopen=fake_urlopen,
        )

    assert exc_info.value.reason is None
