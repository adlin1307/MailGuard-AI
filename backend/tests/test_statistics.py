import pytest
import pandas as pd
from ml.statistics import compute_dataset_statistics


def test_statistics_calculation():
    synthetic_df = pd.DataFrame({
        "clean_text": [
            "engineering standup meeting today in room 402 with alex",
            "please review the pull request for code changes on github",
            "quarterly team budget report attached for review",
            "urgent winner claim your free cash prize lottery now",
            "account suspended click link to verify your password immediately"
        ],
        "raw_text": [
            "Engineering standup meeting today in room 402 with Alex",
            "Please review the pull request for code changes on GitHub",
            "Quarterly team budget report attached for review",
            "URGENT: WINNER! Claim your free cash prize lottery now!",
            "Account suspended! Click link to verify your password immediately"
        ],
        "label": ["ham", "ham", "ham", "spam", "spam"]
    })

    stats = compute_dataset_statistics(synthetic_df, text_col="clean_text", label_col="label")

    assert stats["total_samples"] == 5
    assert stats["classes"]["ham"]["count"] == 3
    assert stats["classes"]["spam"]["count"] == 2
    assert stats["class_imbalance"]["ratio"] == 1.5
    assert "by_class" in stats["length_metrics"]
    assert "ham" in stats["length_metrics"]["by_class"]
    assert "spam" in stats["length_metrics"]["by_class"]
    assert len(stats["frequent_words"]["ham"]) > 0
    assert len(stats["frequent_words"]["spam"]) > 0
    assert "viva_insights" in stats
