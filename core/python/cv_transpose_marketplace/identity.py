from __future__ import annotations

from typing import Literal, Mapping


TenantProvider = Literal["direct", "ms", "gws"]


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
    return f"gws:{_normalize_subject(primary_domain, field_name='domain')}"


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
        email = claims.get("email")
        if email and "@" in email:
            return derive_gws_tenant_key(email.rsplit("@", 1)[1])
        raise MarketplaceIdentityError("domain is required to derive a gws tenant key")

    raise MarketplaceIdentityError(f"Unsupported tenant provider {provider!r}")
