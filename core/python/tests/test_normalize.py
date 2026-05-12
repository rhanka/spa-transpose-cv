from cv_transpose_core.normalize import normalize_docx


def test_normalize_docx_returns_document_and_binary_hashes(repo_root):
    data = (repo_root / "core/golden/cv-001-junior-pm.scalian.docx").read_bytes()

    normalized = normalize_docx(data)

    assert "word/document.xml" in normalized["xml"]
    assert isinstance(normalized["xml"]["word/document.xml"], str)
    assert isinstance(normalized["binary_hashes"], dict)
