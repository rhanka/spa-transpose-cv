from __future__ import annotations

import pytest

from cv_transpose_marketplace import MarketplaceIdentityError, derive_tenant_key_from_claims


def test_derive_tenant_key_from_ms_claims_uses_tid() -> None:
    tenant_key = derive_tenant_key_from_claims("ms", {"tid": "123E4567-E89B-12D3-A456-426614174000"})

    assert tenant_key == "ms:123e4567-e89b-12d3-a456-426614174000"


def test_derive_tenant_key_from_gws_claims_prefers_hd() -> None:
    tenant_key = derive_tenant_key_from_claims(
        "gws",
        {
            "hd": "Example.COM",
            "email": "user@other.example",
        },
    )

    assert tenant_key == "gws:example.com"


def test_derive_tenant_key_from_claims_rejects_gws_email_without_primary_domain() -> None:
    with pytest.raises(MarketplaceIdentityError, match="primary domain"):
        derive_tenant_key_from_claims(
            "gws",
            {
                "email": "user@workspace.example",
            },
        )


def test_derive_tenant_key_from_claims_rejects_missing_ms_tid() -> None:
    with pytest.raises(MarketplaceIdentityError, match="tid"):
        derive_tenant_key_from_claims("ms", {"oid": "abc"})


def test_derive_tenant_key_from_claims_rejects_missing_gws_domain() -> None:
    with pytest.raises(MarketplaceIdentityError, match="primary domain"):
        derive_tenant_key_from_claims("gws", {"sub": "abc"})


@pytest.mark.parametrize(
    "value",
    [
        "no-dot",
        "with space.example",
        "bad_underscore.example",
        "trailing-dot.",
        ".leading-dot",
        "double..dot.example",
        "-leading-hyphen.example",
        "trailing-hyphen-.example",
    ],
)
def test_derive_tenant_key_from_gws_claims_rejects_malformed_domain(value: str) -> None:
    with pytest.raises(MarketplaceIdentityError, match="domain"):
        derive_tenant_key_from_claims("gws", {"hd": value})


def test_derive_tenant_key_from_gws_claims_accepts_hyphenated_subdomain() -> None:
    tenant_key = derive_tenant_key_from_claims("gws", {"hd": "sub-domain.workspace.example"})

    assert tenant_key == "gws:sub-domain.workspace.example"
