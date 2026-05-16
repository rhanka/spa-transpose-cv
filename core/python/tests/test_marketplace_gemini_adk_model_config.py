from __future__ import annotations

import pytest
from typing import Mapping

from cv_transpose_marketplace.gemini_adk.model_config import (
    DEFAULT_MODEL,
    ModelConfig,
    resolve_model_config,
)
from cv_transpose_marketplace.validation import MarketplaceInputError


def test_default_when_no_inputs() -> None:
    config = resolve_model_config(claims={}, env={})

    assert config.model == DEFAULT_MODEL
    assert config.region is None
    assert config.project_id is None
    assert config.endpoint_mode == "ai_studio"


def test_env_overrides_default() -> None:
    env = {
        "GEMINI_AGENT_MODEL": "gemini-2.5-pro",
        "GEMINI_AGENT_REGION": "europe-west1",
        "GEMINI_AGENT_PROJECT_ID": "my-proj",
    }

    config = resolve_model_config(claims={}, env=env)

    assert config.model == "gemini-2.5-pro"
    assert config.region == "europe-west1"
    assert config.project_id == "my-proj"
    assert config.endpoint_mode == "vertex"


def test_tenant_lookup_overrides_env() -> None:
    def lookup(tenant_key: str) -> Mapping[str, str] | None:
        assert tenant_key == "gws:example.com"
        return {"gemini.model": "gemini-2.5-pro", "gemini.region": "us-central1", "gemini.project_id": "tenant-proj"}

    env = {"GEMINI_AGENT_MODEL": "gemini-2.5-flash"}
    claims = {"hd": "example.com"}

    config = resolve_model_config(claims=claims, env=env, tenant_lookup=lookup)

    assert config.model == "gemini-2.5-pro"
    assert config.region == "us-central1"
    assert config.project_id == "tenant-proj"
    assert config.endpoint_mode == "vertex"


def test_override_wins_over_everything() -> None:
    override = ModelConfig(
        model="gemini-1.5-flash",
        region=None,
        project_id=None,
        endpoint_mode="ai_studio",
    )

    config = resolve_model_config(
        claims={"hd": "example.com"},
        env={"GEMINI_AGENT_MODEL": "gemini-2.5-pro"},
        override=override,
    )

    assert config is override


def test_region_without_project_id_raises() -> None:
    env = {"GEMINI_AGENT_REGION": "us-central1"}

    with pytest.raises(MarketplaceInputError) as excinfo:
        resolve_model_config(claims={}, env=env)

    # MarketplaceInputError is a plain ValueError subclass; we encode the
    # error code as the leading token of the message ("<code>: <detail>").
    assert str(excinfo.value).startswith("model_config_invalid:")


def test_endpoint_mode_vertex_when_region_and_project_set() -> None:
    env = {"GEMINI_AGENT_REGION": "us-central1", "GEMINI_AGENT_PROJECT_ID": "p"}

    config = resolve_model_config(claims={}, env=env)

    assert config.endpoint_mode == "vertex"


def test_project_id_without_region_raises() -> None:
    env = {"GEMINI_AGENT_PROJECT_ID": "p"}

    with pytest.raises(MarketplaceInputError) as excinfo:
        resolve_model_config(claims={}, env=env)

    assert str(excinfo.value).startswith("model_config_invalid:")


def test_tenant_partial_override_falls_back_to_env() -> None:
    def lookup(_tenant_key: str) -> Mapping[str, str] | None:
        return {"gemini.model": "gemini-2.5-pro"}

    env = {
        "GEMINI_AGENT_MODEL": "gemini-2.5-flash",
        "GEMINI_AGENT_REGION": "us-central1",
        "GEMINI_AGENT_PROJECT_ID": "env-proj",
    }
    claims = {"hd": "example.com"}

    config = resolve_model_config(claims=claims, env=env, tenant_lookup=lookup)

    # Tenant supplies the model; region+project come from env.
    assert config.model == "gemini-2.5-pro"
    assert config.region == "us-central1"
    assert config.project_id == "env-proj"
