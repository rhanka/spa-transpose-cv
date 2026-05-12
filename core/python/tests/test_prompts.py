from cv_transpose_core.prompts import build_system_prompt, build_user_prompt


def test_system_prompt_is_loaded_from_shared_spec():
    assert len(build_system_prompt()) > 200
    assert "CV" in build_system_prompt()


def test_user_prompt_interpolates_override_filename_and_text():
    prompt = build_user_prompt(
        cv_text="X CV CONTENT",
        source_file_name="cv-007.pdf",
        user_prompt_override="TARGET: Acme",
    )

    assert "TARGET: Acme" in prompt
    assert "cv-007.pdf" in prompt
    assert "X CV CONTENT" in prompt


def test_user_prompt_without_override_has_no_leading_blank_block():
    prompt = build_user_prompt(
        cv_text="X",
        source_file_name="a.pdf",
        user_prompt_override=None,
    )

    assert not prompt.startswith("\n")
