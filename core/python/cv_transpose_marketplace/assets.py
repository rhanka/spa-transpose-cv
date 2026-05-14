from __future__ import annotations

import json
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen as default_urlopen

from cv_transpose_core import BrandTokens, TemplateAssets


class AssetsApiError(RuntimeError):
    pass


class TenantNotConfiguredError(AssetsApiError):
    pass


UrlOpen = Callable[..., Any]


def _build_asset_url(base_url: str, tenant_key: str, resource: str) -> str:
    return f"{base_url.rstrip('/')}/api/v1/tenants/{quote(tenant_key, safe='')}/{resource}"


def _read_asset(
    *,
    base_url: str,
    tenant_key: str,
    bearer_token: str,
    resource: str,
    timeout: float,
    urlopen: UrlOpen,
) -> bytes:
    request = Request(
        _build_asset_url(base_url, tenant_key, resource),
        headers={"Authorization": f"Bearer {bearer_token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read()
    except HTTPError as exc:
        if exc.code == 404:
            raise TenantNotConfiguredError(f'Tenant "{tenant_key}" is not configured') from exc
        raise AssetsApiError(f"Assets API returned {exc.code} for {resource}") from exc
    except URLError as exc:
        raise AssetsApiError(f"Assets API request failed for {resource}") from exc


def fetch_template_assets(
    *,
    base_url: str,
    tenant_key: str,
    bearer_token: str,
    timeout: float = 30.0,
    urlopen: UrlOpen = default_urlopen,
) -> TemplateAssets:
    manifest_bytes = _read_asset(
        base_url=base_url,
        tenant_key=tenant_key,
        bearer_token=bearer_token,
        resource="manifest",
        timeout=timeout,
        urlopen=urlopen,
    )
    base_docx = _read_asset(
        base_url=base_url,
        tenant_key=tenant_key,
        bearer_token=bearer_token,
        resource="base.docx",
        timeout=timeout,
        urlopen=urlopen,
    )
    brand_bytes = _read_asset(
        base_url=base_url,
        tenant_key=tenant_key,
        bearer_token=bearer_token,
        resource="brand",
        timeout=timeout,
        urlopen=urlopen,
    )

    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
        brand_payload = json.loads(brand_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AssetsApiError("Assets API returned invalid JSON") from exc

    return TemplateAssets(
        manifest=manifest,
        base_docx=base_docx,
        brand=BrandTokens(
            primary=brand_payload["primary"],
            secondary=brand_payload["secondary"],
            accent=brand_payload["accent"],
            font_family=brand_payload["fontFamily"],
        ),
    )
