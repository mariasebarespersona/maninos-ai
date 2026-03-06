"""
Tests for the Title Monitor service.
Tests name matching logic and field population (no live TDHCA calls).
"""
import pytest
from api.services.title_monitor import _normalize_name, _names_match


# ═══════════════════════════════════════════════════════════════════
# NAME NORMALIZATION
# ═══════════════════════════════════════════════════════════════════

def test_normalize_name_lowercase():
    assert _normalize_name("MANINOS HOMES LLC") == "maninos homes llc"


def test_normalize_name_strips_punctuation():
    assert _normalize_name("O'Brien, Jr.") == "obrien jr"


def test_normalize_name_empty():
    assert _normalize_name("") == ""
    assert _normalize_name(None) == ""


# ═══════════════════════════════════════════════════════════════════
# NAME MATCHING
# ═══════════════════════════════════════════════════════════════════

def test_exact_match():
    assert _names_match("Maninos Homes", "Maninos Homes") is True


def test_case_insensitive_match():
    assert _names_match("MANINOS HOMES", "maninos homes") is True


def test_contains_match():
    assert _names_match("MANINOS HOMES LLC", "Maninos Homes") is True


def test_subset_words_match():
    assert _names_match("MANINOS HOMES LLC DBA", "Maninos Homes") is True


def test_no_match():
    assert _names_match("JOHN DOE", "Maninos Homes") is False


def test_empty_no_match():
    assert _names_match("", "Maninos Homes") is False
    assert _names_match("Maninos Homes", "") is False


def test_partial_name_match():
    """When expected is a full name and TDHCA has a slightly different format"""
    assert _names_match("MARIA GARCIA LOPEZ", "Maria Garcia") is True


def test_reversed_contains():
    """When expected name is longer than TDHCA name"""
    assert _names_match("Maninos", "Maninos Homes LLC") is True
