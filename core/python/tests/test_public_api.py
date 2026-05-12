def test_public_api_exports_transpose_contract_types():
    import cv_transpose_core as core

    assert callable(core.transpose)
    assert core.InputFile.__name__ == "InputFile"
    assert core.TransposeInput.__name__ == "TransposeInput"
    assert core.TemplateAssets.__name__ == "TemplateAssets"
