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
