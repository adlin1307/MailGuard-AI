"""
Dataset Service for ProbMail.
Maintains active dataset state, automatic CSV path resolution, column auto-detection,
dataset hygiene audit (duplicates, missing values), text preprocessing, and change detection.
"""
import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import pandas as pd

from config import resolve_dataset_path, PRIMARY_DATASET_FILENAME, SAMPLE_DATASET_PATH
from ml.preprocessing import validate_and_preprocess_dataset


def auto_detect_columns(df: pd.DataFrame) -> Tuple[str, str, Optional[str]]:
    """
    Safely identifies email text/body, spam/ham label, and subject columns
    from DataFrame column variations, case-insensitively.
    Returns: (text_col, label_col, subject_col)
    """
    cols_map = {str(c).strip().lower(): str(c) for c in df.columns}

    # 1. Subject candidate search
    subject_candidates = [
        "subject", "email_subject", "subject_line", "title", "header", "subj"
    ]
    subject_col: Optional[str] = None
    for cand in subject_candidates:
        if cand in cols_map:
            subject_col = cols_map[cand]
            break

    # 2. Text / Message candidate search
    text_candidates = [
        "message", "body", "email_message", "email_body", "text", "content",
        "email", "mail", "clean_text", "raw_text", "v2"
    ]
    text_col: Optional[str] = None
    for cand in text_candidates:
        if cand in cols_map and cols_map[cand] != subject_col:
            text_col = cols_map[cand]
            break

    # 3. Label candidate search
    label_candidates = [
        "spam/ham", "spam_ham", "spam", "label", "class", "target", "category",
        "type", "is_spam", "classification", "v1"
    ]
    label_col: Optional[str] = None
    for cand in label_candidates:
        if cand in cols_map and cols_map[cand] != text_col and cols_map[cand] != subject_col:
            label_col = cols_map[cand]
            break

    # Heuristic fallback if label column not found by name:
    # Look for a column containing values like 'ham', 'spam', 0, 1
    if not label_col:
        for c in df.columns:
            if c != text_col and c != subject_col:
                sample_vals = set(df[c].dropna().astype(str).str.strip().str.lower().unique())
                if sample_vals.intersection({"ham", "spam", "0", "1", "clean", "junk"}):
                    label_col = str(c)
                    break

    # Heuristic fallback for text column if still not found
    if not text_col:
        remaining = [str(c) for c in df.columns if c != subject_col and c != label_col]
        if remaining:
            text_col = remaining[0]
        else:
            text_col = str(df.columns[0])

    if not label_col:
        raise ValueError(
            f"Could not identify a Spam/Ham label column in dataset columns: {list(df.columns)}"
        )

    return text_col, label_col, subject_col


class DatasetService:
    def __init__(self):
        self._raw_df: Optional[pd.DataFrame] = None
        self._cleaned_df: Optional[pd.DataFrame] = None
        self._summary: Optional[Dict[str, Any]] = None
        self._filename: Optional[str] = None
        self._dataset_path: Optional[Path] = None
        self._dataset_mtime: Optional[float] = None
        self._dataset_size: Optional[int] = None
        self._error: Optional[str] = None
        self._text_col: str = "Message"
        self._label_col: str = "Spam/Ham"
        self._subject_col: Optional[str] = "Subject"

        # Automatically load the primary dataset (enron_spam_data.csv)
        self.load_primary_dataset()

    def get_raw_dataset(self) -> Optional[pd.DataFrame]:
        return self._raw_df

    def get_cleaned_dataset(self) -> Optional[pd.DataFrame]:
        return self._cleaned_df

    def get_summary(self) -> Optional[Dict[str, Any]]:
        return self._summary

    def get_error(self) -> Optional[str]:
        return self._error

    def is_loaded(self) -> bool:
        return self._cleaned_df is not None and len(self._cleaned_df) > 0

    def get_dataset_file_info(self) -> Dict[str, Any]:
        """Returns file metadata to detect changes between application launches."""
        return {
            "filename": self._filename,
            "path": str(self._dataset_path) if self._dataset_path else None,
            "mtime": self._dataset_mtime,
            "size": self._dataset_size,
            "usable_samples": len(self._cleaned_df) if self._cleaned_df is not None else 0
        }

    def is_dataset_changed(self) -> bool:
        """Checks whether the underlying dataset file has changed on disk."""
        if not self._dataset_path or not self._dataset_path.exists():
            return False
        try:
            stat = self._dataset_path.stat()
            return stat.st_mtime != self._dataset_mtime or stat.st_size != self._dataset_size
        except OSError:
            return False

    def reload_if_changed(self) -> bool:
        """Reloads the dataset if modified on disk."""
        if self.is_dataset_changed():
            self.load_primary_dataset()
            return True
        return False

    def load_primary_dataset(self) -> Optional[Dict[str, Any]]:
        """
        Locates, inspects, validates, and standardizes the primary enron_spam_data.csv dataset.
        Never replaces with a tiny sample if loading fails; returns clear error diagnostics.
        """
        resolved_path = resolve_dataset_path(PRIMARY_DATASET_FILENAME)

        if not resolved_path:
            self._error = (
                f"Primary dataset '{PRIMARY_DATASET_FILENAME}' not found. "
                f"Please ensure it exists in 'data/{PRIMARY_DATASET_FILENAME}' or 'backend/data/'."
            )
            self._raw_df = None
            self._cleaned_df = None
            self._summary = None
            return None

        try:
            # Safe CSV ingestion (handles UTF-8 and Latin-1)
            try:
                df = pd.read_csv(resolved_path)
            except UnicodeDecodeError:
                df = pd.read_csv(resolved_path, encoding="latin-1")

            if df.empty:
                self._error = f"Dataset file '{resolved_path.name}' is empty."
                return None

            # Inspect actual file columns and map safely
            text_col, label_col, subject_col = auto_detect_columns(df)

            # Record file stat for change tracking
            file_stat = resolved_path.stat()
            self._dataset_path = resolved_path
            self._dataset_mtime = file_stat.st_mtime
            self._dataset_size = file_stat.st_size
            self._error = None

            return self.set_dataset(
                df=df,
                filename=resolved_path.name,
                text_col=text_col,
                label_col=label_col,
                subject_col=subject_col
            )

        except Exception as e:
            self._error = f"Failed to load dataset '{PRIMARY_DATASET_FILENAME}': {str(e)}"
            self._raw_df = None
            self._cleaned_df = None
            self._summary = None
            return None

    def set_dataset(
        self,
        df: pd.DataFrame,
        filename: str,
        text_col: str,
        label_col: str,
        subject_col: Optional[str] = None,
        custom_label_map: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Validates and sets the active working dataset."""
        self._raw_df = df
        self._filename = filename
        self._text_col = text_col
        self._label_col = label_col
        self._subject_col = subject_col

        # Execute preprocessing and validation with duplicate removal
        cleaned_df, preprocessing_summary = validate_and_preprocess_dataset(
            df=df,
            text_column=text_col,
            label_column=label_col,
            subject_column=subject_col,
            drop_duplicates=True,
            custom_label_map=custom_label_map
        )

        self._cleaned_df = cleaned_df

        # Raw data inspection metrics
        raw_missing_text = int(df[text_col].isna().sum()) if text_col in df.columns else 0
        raw_missing_label = int(df[label_col].isna().sum()) if label_col in df.columns else 0
        raw_missing_subject = int(df[subject_col].isna().sum()) if (subject_col and subject_col in df.columns) else 0
        total_raw_duplicates = int(df.duplicated().sum())

        # Class counts and percentages from usable cleaned records
        usable_total = len(cleaned_df)
        class_dist = preprocessing_summary.get("class_distribution", {})
        ham_count = int(class_dist.get("ham", 0))
        spam_count = int(class_dist.get("spam", 0))
        ham_pct = round((ham_count / usable_total * 100), 2) if usable_total > 0 else 0.0
        spam_pct = round((spam_count / usable_total * 100), 2) if usable_total > 0 else 0.0

        full_summary = {
            "filename": filename,
            "dataset_path": str(self._dataset_path) if self._dataset_path else filename,
            "total_rows_raw": len(df),
            "columns": list(df.columns),
            "selected_columns": {
                "text_column": text_col,
                "label_column": label_col,
                "subject_column": subject_col
            },
            "inspection": {
                "raw_total_rows": len(df),
                "raw_duplicates": total_raw_duplicates,
                "missing_values": {
                    "text": raw_missing_text,
                    "label": raw_missing_label,
                    "subject": raw_missing_subject,
                    "total": raw_missing_text + raw_missing_label + raw_missing_subject
                }
            },
            "usable_records": {
                "total": usable_total,
                "ham_count": ham_count,
                "spam_count": spam_count,
                "ham_percentage": ham_pct,
                "spam_percentage": spam_pct
            },
            "preview": df.head(5).fillna("").to_dict(orient="records"),
            "preprocessing": preprocessing_summary,
            "is_ready_for_training": usable_total >= 10 and len(class_dist) >= 2
        }

        self._summary = full_summary
        return full_summary

    def load_benchmark_dataset(self) -> Dict[str, Any]:
        """Fallback for test harness or explicit benchmark comparison."""
        if not os.path.exists(SAMPLE_DATASET_PATH):
            raise FileNotFoundError("Bundled benchmark dataset not found.")

        df = pd.read_csv(SAMPLE_DATASET_PATH)
        text_col, label_col, subject_col = auto_detect_columns(df)
        return self.set_dataset(
            df=df,
            filename="sample_dataset.csv",
            text_col=text_col,
            label_col=label_col,
            subject_col=subject_col
        )


# Singleton instance
dataset_service = DatasetService()
