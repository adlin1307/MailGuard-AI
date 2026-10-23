import pytest
import numpy as np
from ml.feature_selection import fit_chi_square_selector


def test_chi_square_selection_and_pvalues():
    # Synthetic vocabulary with distinct class associations
    X = [
        "team project code review meeting sprint jira",
        "standup sprint agile backlog deployment server",
        "coffee lunch discussion paper curriculum university",
        "urgent cash prize winner claim lottery million dollars",
        "verify account password suspended urgent action required",
        "congratulations lottery winner bonus deposit cash prize"
    ]
    y = ["ham", "ham", "ham", "spam", "spam", "spam"]

    vec, sel, analysis = fit_chi_square_selector(X, y, k=10)

    assert analysis["selected_k"] > 0
    assert "features" in analysis
    assert len(analysis["features"]) > 0

    # Test that each feature has chi2_score and p_value
    for f in analysis["features"]:
        assert "chi2_score" in f
        assert "p_value" in f
        assert "significance" in f
        assert "tendency" in f
        assert f["chi2_score"] >= 0.0
        assert 0.0 <= f["p_value"] <= 1.0

    # Ensure methodology notes distinguish score vs p-value
    assert "score_vs_pvalue_distinction" in analysis["methodology"]
