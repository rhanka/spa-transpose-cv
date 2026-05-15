from __future__ import annotations


def test_build_root_agent_returns_fallback_descriptor_without_google_sdk() -> None:
    from cv_transpose_marketplace.gemini_adk.agent import build_agent_instruction, build_root_agent

    agent = build_root_agent()

    assert isinstance(agent, dict)
    assert agent["name"] == "cv_transpose_gemini"
    assert agent["tool_names"] == ["transpose_cvs"]
    assert agent["tool_entrypoint"] == "transpose_cvs_payload"
    assert agent["request_schema"]["required"] == ["files", "context"]
    assert agent["response_schema"]["required"] == ["tenantKey", "artifact", "reportCard"]
    assert "Do not keep conversational memory" in build_agent_instruction()
