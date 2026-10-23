import pytest
import pandas as pd
from ml.preprocessing import clean_text, combine_subject_and_body, normalize_label, validate_and_preprocess_dataset


def test_clean_text_basic():
    raw = "Hello World! Please visit https://spam-link.biz and call $100 dollars."
    cleaned = clean_text(raw)
    assert "https" not in cleaned
    assert "url_token" in cleaned
    assert "currency_token" in cleaned
    assert "hello world" in cleaned


def test_clean_text_html_stripping():
    html_raw = "<html><body><h3>Urgent Notice</h3><p>Verify your <b>account</b> &amp; details</p></body></html>"
    cleaned = clean_text(html_raw)
    assert "<html>" not in cleaned
    assert "<h3>" not in cleaned
    assert "urgent notice" in cleaned
    assert "account" in cleaned
    assert "&amp;" not in cleaned


def test_combine_subject_and_body():
    combined = combine_subject_and_body("Meeting Tomorrow", "Don't forget the slides.")
    assert combined == "Meeting Tomorrow. Don't forget the slides."

    assert combine_subject_and_body("Only Subject", None) == "Only Subject"
    assert combine_subject_and_body(None, "Only Body") == "Only Body"


def test_normalize_label():
    assert normalize_label("spam") == "spam"
    assert normalize_label("SPAM") == "spam"
    assert normalize_label("1") == "spam"
    assert normalize_label(1) == "spam"
    assert normalize_label("ham") == "ham"
    assert normalize_label("legitimate") == "ham"
    assert normalize_label("0") == "ham"
    assert normalize_label(0) == "ham"
    assert normalize_label("unknown_label_xyz") is None


def test_validate_and_preprocess_dataset_synthetic():
    synthetic_data = pd.DataFrame({
        "label": ["ham", "spam", "HAM", "1", "invalid_class", None, "ham"],
        "message": [
            "Hey, team standup at 10 AM.",
            "URGENT: Click http://phish.com to win $500!",
            "Lunch tomorrow?",
            "Cheap pharmacy meds online without rx",
            "This is unmapped label",
            "Missing label row",
            "Hey, team standup at 10 AM."  # Duplicate
        ]
    })

    cleaned_df, summary = validate_and_preprocess_dataset(
        synthetic_data,
        text_column="message",
        label_column="label",
        drop_duplicates=True
    )

    # Missing label and invalid_class filtered out, duplicate filtered out
    assert len(cleaned_df) == 4
    assert summary["duplicates_removed"] == 1
    assert "invalid_class" in summary["unrecognized_labels"]
    assert "ham" in summary["class_distribution"]
    assert "spam" in summary["class_distribution"]
