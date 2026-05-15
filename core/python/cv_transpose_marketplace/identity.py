from __future__ import annotations

import re
from typing import Literal, Mapping


TenantProvider = Literal["direct", "ms", "gws"]


_GWS_DOMAIN_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
_GWS_DOMAIN_PATTERN = re.compile(rf"^{_GWS_DOMAIN_LABEL}(?:\.{_GWS_DOMAIN_LABEL})+$")


class MarketplaceIdentityError(ValueError):
    pass


def _normalize_subject(value: str, *, field_name: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        raise MarketplaceIdentityError(f"{field_name} is required")
    return normalized


def derive_direct_tenant_key(slug: str) -> str:
    return f"direct:{_normalize_subject(slug, field_name='slug')}"


def derive_ms_tenant_key(tid: str) -> str:
    return f"ms:{_normalize_subject(tid, field_name='tid')}"


def derive_gws_tenant_key(primary_domain: str) -> str:
    normalized = _normalize_subject(primary_domain, field_name="domain")
    if not _GWS_DOMAIN_PATTERN.match(normalized):
        raise MarketplaceIdentityError(
            f"Invalid Workspace primary domain {primary_domain!r}; expected a DNS-style domain"
        )
    return f"gws:{normalized}"


def derive_tenant_key_from_claims(provider: TenantProvider, claims: Mapping[str, str]) -> str:
    if provider == "direct":
        slug = claims.get("slug")
        if slug is None:
            raise MarketplaceIdentityError("slug is required to derive a direct tenant key")
        return derive_direct_tenant_key(slug)

    if provider == "ms":
        tid = claims.get("tid")
        if tid is None:
            raise MarketplaceIdentityError("tid is required to derive an ms tenant key")
        return derive_ms_tenant_key(tid)

    if provider == "gws":
        domain = claims.get("hd")
        if domain:
            return derive_gws_tenant_key(domain)
        raise MarketplaceIdentityError("primary domain is required to derive a gws tenant key")

    raise MarketplaceIdentityError(f"Unsupported tenant provider {provider!r}")
