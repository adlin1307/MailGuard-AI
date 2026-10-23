"""
Data Preprocessing Module for ProbMail.
Technical Responsibility #1: Text cleaning, normalization, label mapping, and dataset hygiene.
"""
import re
import html
import unicodedata
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, Optional, List

# Pre-compiled regex patterns for efficiency
URL_PATTERN = re.compile(r'https?://\S+|www\.\S+', re.IGNORECASE)
EMAIL_PATTERN = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+', re.IGNORECASE)
CURRENCY_PATTERN = re.compile(r'[\$\€\£\¥\₹]', re.IGNORECASE)
NUMBER_PATTERN = re.compile(r'\b\d+(?:[\.,]\d+)*\b')
HTML_TAG_PATTERN = re.compile(r'<[^>]+>')
SPECIAL_CHARS_PATTERN = re.compile(r'[^a-zA-Z0-9\s_]')
WHITESPACE_PATTERN = re.compile(r'\s+')

LABEL_MAPPING_RULES = {
    # Ham variants
    'ham': 'ham',
    'legitimate': 'ham',
    'safe': 'ham',
    'normal': 'ham',
    '0': 'ham',
    0: 'ham',
    'clean': 'ham',
    # Spam variants
    'spam': 'spam',
    'unsolicited': 'spam',
    'junk': 'spam',
    'phishing': 'spam', # Mapped to spam when binary model is used
    'malicious': 'spam',
    '1': 'spam',
    1: 'spam'
}


def clean_text(text: Optional[str], replace_tokens: bool = True) -> str:
    """
    Cleans raw email text through a standardized preprocessing pipeline:
    1. Unescapes HTML entities.
    2. Strips HTML markup.
    3. Normalizes unicode characters.
    4. Optionally replaces URLs, emails, currencies, and numbers with semantic tokens.
    5. Converts to lowercase.
    6. Strips unwanted special characters and normalizes whitespace.
    """
    if text is None or not isinstance(text, str):
        return ""

    # Unescape HTML entities (e.g., &amp; -> &, &lt; -> <)
    cleaned = html.unescape(text)

    # Strip HTML tags
    cleaned = HTML_TAG_PATTERN.sub(' ', cleaned)

    # Normalize unicode (e.g. smart quotes, accent marks)
    cleaned = unicodedata.normalize('NFKD', cleaned)

    if replace_tokens:
        # Tokenize sensitive security indicators
        cleaned = URL_PATTERN.sub(' url_token ', cleaned)
        cleaned = EMAIL_PATTERN.sub(' email_token ', cleaned)
        cleaned = CURRENCY_PATTERN.sub(' currency_token ', cleaned)
        cleaned = NUMBER_PATTERN.sub(' num_token ', cleaned)

    # Lowercase
    cleaned = cleaned.lower()

    # Remove extraneous punctuation while keeping alphanumeric and underscore
    cleaned = SPECIAL_CHARS_PATTERN.sub(' ', cleaned)

    # Collapse multiple whitespaces
    cleaned = WHITESPACE_PATTERN.sub(' ', cleaned).strip()

    return cleaned


def combine_subject_and_body(subject: Optional[str], body: Optional[str]) -> str:
    """
    Combines subject and body into a structured representation for vectorization.
    Subjects often contain critical indicators (e.g. 'URGENT:', 'CONGRATULATIONS').
    """
    s = (subject or "").strip()
    b = (body or "").strip()
    if s and b:
        return f"{s}. {b}"
    elif s:
        return s
    return b


def normalize_label(raw_label: Any) -> Optional[str]:
    """
    Normalizes a single label value into 'ham' or 'spam'.
    Returns None if label is unrecognized or ambiguous.
    """
    if pd.isna(raw_label):
        return None
    val = str(raw_label).strip().lower()
    return LABEL_MAPPING_RULES.get(val, None)


def validate_and_preprocess_dataset(
    df: pd.DataFrame,
    text_column: str,
    label_column: str,
    subject_column: Optional[str] = None,
    drop_duplicates: bool = True,
    custom_label_map: Optional[Dict[str, str]] = None
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Validates, cleans, and standardizes an uploaded email dataset.
    Returns the cleaned DataFrame and a comprehensive preprocessing summary audit.
    """
    summary: Dict[str, Any] = {
        "original_rows": len(df),
        "missing_text_count": 0,
        "missing_label_count": 0,
        "duplicates_removed": 0,
        "unrecognized_labels": [],
        "cleaned_rows": 0,
        "class_distribution": {},
        "warnings": []
    }

    if df.empty:
        summary["warnings"].append("Dataset is empty.")
        return pd.DataFrame(columns=["clean_text", "label"]), summary

    if text_column not in df.columns:
        raise ValueError(f"Specified text column '{text_column}' not found in dataset columns: {list(df.columns)}")

    if label_column not in df.columns:
        raise ValueError(f"Specified label column '{label_column}' not found in dataset columns: {list(df.columns)}")

    # Work on a copy
    work_df = df.copy()

    # 1. Combine subject and body if separate subject column is specified
    if subject_column and subject_column in work_df.columns:
        raw_text_series = work_df.apply(
            lambda r: combine_subject_and_body(str(r[subject_column]), str(r[text_column])),
            axis=1
        )
    else:
        raw_text_series = work_df[text_column].astype(str)

    # 2. Track missing text values
    missing_text_mask = raw_text_series.isna() | (raw_text_series.str.strip() == "")
    summary["missing_text_count"] = int(missing_text_mask.sum())

    # 3. Handle and normalize labels
    mapping_dict = dict(LABEL_MAPPING_RULES)
    if custom_label_map:
        for k, v in custom_label_map.items():
            mapping_dict[str(k).strip().lower()] = str(v).strip().lower()

    raw_labels = work_df[label_column]
    summary["missing_label_count"] = int(raw_labels.isna().sum())

    normalized_labels = []
    unrecognized = set()
    for lbl in raw_labels:
        if pd.isna(lbl):
            normalized_labels.append(None)
            continue
        key = str(lbl).strip().lower()
        norm = mapping_dict.get(key)
        if norm in ['ham', 'spam']:
            normalized_labels.append(norm)
        else:
            normalized_labels.append(None)
            unrecognized.add(str(lbl))

    summary["unrecognized_labels"] = list(unrecognized)
    if unrecognized:
        summary["warnings"].append(f"Found unrecognized or unmapped labels: {list(unrecognized)}")

    # Build intermediate cleaned DataFrame
    cleaned_df = pd.DataFrame({
        "raw_text": raw_text_series,
        "label": normalized_labels
    })

    # Drop rows with missing text or missing/unrecognized labels
    valid_mask = (~cleaned_df["raw_text"].isna()) & \
                 (cleaned_df["raw_text"].str.strip() != "") & \
                 (~cleaned_df["label"].isna())
    
    cleaned_df = cleaned_df[valid_mask].copy()

    # 4. Handle duplicates
    if drop_duplicates:
        initial_count = len(cleaned_df)
        cleaned_df = cleaned_df.drop_duplicates(subset=["raw_text"])
        summary["duplicates_removed"] = initial_count - len(cleaned_df)

    # 5. Apply text cleaning
    cleaned_df["clean_text"] = cleaned_df["raw_text"].apply(clean_text)

    # Filter out empty texts after cleaning
    cleaned_df = cleaned_df[cleaned_df["clean_text"].str.strip().str.len() > 0].copy()

    summary["cleaned_rows"] = len(cleaned_df)
    
    # Class distribution
    dist = cleaned_df["label"].value_counts().to_dict()
    summary["class_distribution"] = {str(k): int(v) for k, v in dist.items()}

    # Validation checks
    if len(cleaned_df) == 0:
        summary["warnings"].append("No valid rows remaining after preprocessing.")
    elif len(dist) < 2:
        summary["warnings"].append("Dataset contains only one class after normalization. Binary classification requires both ham and spam.")

    return cleaned_df[["clean_text", "label", "raw_text"]], summary
