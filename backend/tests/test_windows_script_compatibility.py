"""Regression guard for Windows PowerShell 5.1 demo-script compatibility.

PowerShell 5.1 may decode UTF-8 without a BOM as a legacy code page; a UTF-8
em dash can then be misread as a smart quote and break parsing. This test
verifies source encoding, not full PowerShell language syntax.
"""
from pathlib import Path


def test_synthetic_seed_has_ascii_source_and_preserves_demo_author_alias():
    path = Path(__file__).resolve().parents[2] / "scripts" / "seed_demo_knowledge.ps1"
    source = path.read_bytes().decode("ascii")
    author = "Synthetic Demo Mentor $([char]0x2014) Not a Real Operator"
    assert source.count(author) == 2
    assert "status=all" in source
    assert "Skipped duplicate seed. No new record was written." in source
    assert "param([switch]$ConfirmSynthetic)" in source
