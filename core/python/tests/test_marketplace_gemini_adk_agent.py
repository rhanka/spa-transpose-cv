from __future__ import annotations


def test_load_system_instruction_returns_markdown_with_role_section() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import load_system_instruction

    instruction = load_system_instruction()

    assert "# Role" in instruction
    assert "transpose_cvs" in instruction
    assert "exactly once" in instruction
    assert instruction.endswith("\n") or instruction.endswith(".")


def test_load_system_instruction_is_cached_across_calls() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import load_system_instruction

    first = load_system_instruction()
    second = load_system_instruction()

    assert first is second


def test_build_agent_descriptor_returns_pure_dict_without_sdk() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import build_agent_descriptor
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")
    descriptor = build_agent_descriptor(model_config=config)

    assert descriptor["name"] == "cv_transpose_gemini"
    assert descriptor["tool_names"] == ["transpose_cvs"]
    assert descriptor["model"] == "gemini-2.5-flash"
    assert descriptor["instruction"].startswith("# Role")
    assert isinstance(descriptor["instruction_sha256"], str)
    assert len(descriptor["instruction_sha256"]) == 64


def test_build_agent_descriptor_uses_explicit_instruction_when_passed() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import build_agent_descriptor
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")
    descriptor = build_agent_descriptor(model_config=config, instruction="custom prompt")

    assert descriptor["instruction"] == "custom prompt"


def test_build_root_agent_requires_gemini_adk_extra(monkeypatch) -> None:
    import sys

    from cv_transpose_marketplace.gemini_adk.agent import build_root_agent
    from cv_transpose_marketplace.gemini_adk.model_config import ModelConfig

    monkeypatch.setitem(sys.modules, "google.adk.agents", None)

    config = ModelConfig(model="gemini-2.5-flash", region=None, project_id=None, endpoint_mode="ai_studio")

    import pytest

    with pytest.raises(ImportError) as excinfo:
        build_root_agent(
            claims={"hd": "example.com"},
            llm=object(),
            assets_base_url="https://x",
            assets_bearer_token="t",
            model_config=config,
        )

    assert "gemini-adk" in str(excinfo.value)
