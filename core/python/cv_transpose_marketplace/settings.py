from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Mapping

from .jwt import RuntimeJwtIssuer


class RuntimeSettingsError(ValueError):
    pass


@dataclass(frozen=True)
class RuntimeSettings:
    assets_base_url: str
    jwt_issuer: str
    jwt_kid: str
    jwt_private_key_pem: str
    onboarding_url: str | None = None
    token_ttl_seconds: int = 300
    assets_cache_ttl_seconds: int = 300

    def build_signer(self) -> RuntimeJwtIssuer:
        return RuntimeJwtIssuer(
            issuer=self.jwt_issuer,
            kid=self.jwt_kid,
            private_key_pem=self.jwt_private_key_pem,
            token_ttl_seconds=self.token_ttl_seconds,
        )


def _require_env(env: Mapping[str, str], key: str) -> str:
    value = env.get(key, "").strip()
    if not value:
        raise RuntimeSettingsError(f"Missing required environment variable {key}")
    return value


def _read_private_key_pem(prefix: str, env: Mapping[str, str]) -> str:
    pem_key = f"{prefix}_JWT_PRIVATE_KEY_PEM"
    pem_b64_key = f"{prefix}_JWT_PRIVATE_KEY_PEM_B64"

    if env.get(pem_key, "").strip():
        return env[pem_key].strip()
    if env.get(pem_b64_key, "").strip():
        try:
            return base64.b64decode(env[pem_b64_key]).decode("utf-8").strip()
        except Exception as exc:  # pragma: no cover - defensive guard
            raise RuntimeSettingsError(f"Invalid base64 private key in {pem_b64_key}") from exc
    raise RuntimeSettingsError(f"Missing required environment variable {pem_key} or {pem_b64_key}")


def load_runtime_settings(prefix: str, env: Mapping[str, str]) -> RuntimeSettings:
    assets_base_url = _require_env(env, f"{prefix}_ASSETS_BASE_URL")
    jwt_issuer = _require_env(env, f"{prefix}_JWT_ISSUER")
    jwt_kid = _require_env(env, f"{prefix}_JWT_KID")
    jwt_private_key_pem = _read_private_key_pem(prefix, env)
    onboarding_url = env.get(f"{prefix}_ONBOARDING_URL", "").strip() or None
    token_ttl_raw = env.get(f"{prefix}_JWT_TTL_SECONDS", "").strip()
    token_ttl_seconds = 300 if not token_ttl_raw else int(token_ttl_raw)
    cache_ttl_raw = env.get(f"{prefix}_ASSETS_CACHE_TTL_SECONDS", "").strip()
    assets_cache_ttl_seconds = 300 if not cache_ttl_raw else max(0, int(cache_ttl_raw))

    return RuntimeSettings(
        assets_base_url=assets_base_url,
        jwt_issuer=jwt_issuer,
        jwt_kid=jwt_kid,
        jwt_private_key_pem=jwt_private_key_pem,
        onboarding_url=onboarding_url,
        token_ttl_seconds=token_ttl_seconds,
        assets_cache_ttl_seconds=assets_cache_ttl_seconds,
    )
