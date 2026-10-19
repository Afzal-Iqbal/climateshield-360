from __future__ import annotations

from pathlib import Path

import pytest

from climateshield.config import RAW_DIR
from climateshield.io_utils import assert_not_raw, sha256_file


def test_assert_not_raw_blocks_raw_writes(tmp_path: Path) -> None:
    target = RAW_DIR / "collected_datasets" / "README_DATASETS_CATALOG.md"
    if not target.exists():
        pytest.skip("raw data not extracted")
    with pytest.raises(PermissionError):
        assert_not_raw(target)


def test_raw_hash_stable_when_present() -> None:
    readme = RAW_DIR / "collected_datasets" / "README_DATASETS_CATALOG.md"
    if not readme.exists():
        pytest.skip("raw data not extracted")
    first = sha256_file(readme)
    second = sha256_file(readme)
    assert first == second
    assert len(first) == 64
