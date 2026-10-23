import os
import pytest
import pandas as pd
from sklearn.feature_selection import SelectKBest, chi2
from sklearn.naive_bayes import MultinomialNB
from sklearn.feature_extraction.text import TfidfVectorizer
from ml.train import train_probmail_model, load_trained_pipeline, ensure_trained_model
from ml.predict import predict_email


def test_chi_square_in_active_pipeline():
    """
    Verification Requirement: Proves that SelectKBest(chi2, ...) is an active,
    fitted step inside the prediction pipeline, that feature inputs are non-negative,
    and that new emails pass through it before classification.
    """
    ensure_trained_model()
    pipeline, metadata = load_trained_pipeline()
    assert pipeline is not None
    assert list(pipeline.named_steps.keys()) == ["tfidf", "chi2", "nb"]

    tfidf = pipeline.named_steps["tfidf"]
    chi2_step = pipeline.named_steps["chi2"]
    nb = pipeline.named_steps["nb"]

    assert isinstance(tfidf, TfidfVectorizer)
    assert isinstance(chi2_step, SelectKBest)
    assert chi2_step.score_func == chi2
    assert isinstance(nb, MultinomialNB)

    # 1. Non-negative TF-IDF compatibility check
    sample_text = ["urgent bank account verification and password reset needed"]
    vec_out = tfidf.transform(sample_text)
    assert vec_out.min() >= 0.0, "TF-IDF features must be non-negative for Chi-Square test"

    # 2. Chi-Square feature reduction check
    chi2_out = chi2_step.transform(vec_out)
    assert chi2_out.shape[1] == chi2_step.k, f"Output features must equal k={chi2_step.k}"
    assert chi2_out.shape[1] <= vec_out.shape[1], "Chi-square must project onto selected features"

    # 3. Naive Bayes classification on Chi-Square features
    nb_proba = nb.predict_proba(chi2_out)[0]
    assert len(nb_proba) == 2
    assert abs(sum(nb_proba) - 1.0) < 1e-4


def test_pipeline_train_leakage_prevention_and_predict():
    synthetic_corpus = pd.DataFrame({
        "clean_text": [
            "engineering sprint retrospective agenda for team review",
            "server infrastructure cloud maintenance scheduled for weekend",
            "pull request merged into master branch with passing tests",
            "research seminar on probabilistic machine learning scheduled",
            "customer support inquiry regarding api quota limits",
            "lunch catchup tomorrow at the campus cafe",
            "office parking permit annual renewal notice from facilities",
            "draft paper feedback on methodology section sent via email",
            # Spam
            "urgent your bank account has been suspended verify login",
            "congratulations you won lottery million dollar grand prize",
            "claim free gift card bonus deposit immediate reward",
            "exclusive bitcoin investment guaranteed return cash daily",
            "microsoft office password expiring verify identity immediately",
            "urgent wire transfer requested by ceo confirm immediately",
            "cheap online pharmacy medications without prescription needed",
            "unclaimed tax refund notice from federal revenue department"
        ],
        "label": [
            "ham", "ham", "ham", "ham", "ham", "ham", "ham", "ham",
            "spam", "spam", "spam", "spam", "spam", "spam", "spam", "spam"
        ]
    })

    # Train model
    metadata = train_probmail_model(
        df=synthetic_corpus,
        k_best=15,
        test_size=0.25,
        random_state=42
    )

    # 1. Leakage prevention check: train and test sets strictly separated
    assert metadata["dataset_statistics"]["train_samples"] == 12
    assert metadata["dataset_statistics"]["test_samples"] == 4
    assert metadata["hyperparameters"]["k_best_features"] <= 15

    # 2. Evaluation metrics exist and are calculated from test set
    eval_res = metadata["evaluation"]
    assert "accuracy" in eval_res["overall"]
    assert "confusion_matrix" in eval_res
    assert eval_res["test_samples"] == 4

    # 3. Model persistence check
    pipeline, loaded_meta = load_trained_pipeline()
    assert pipeline is not None
    assert loaded_meta["model_name"] == metadata["model_name"]

    # 4. Predict on legitimate email
    ham_pred = predict_email(
        subject="Sprint Retrospective",
        body="Hi team, please review the pull request and server infrastructure notes.",
        pipeline=pipeline,
        metadata=loaded_meta
    )
    assert ham_pred["status"] == "success"
    assert "predicted_class" in ham_pred
    assert "confidence_percentage" in ham_pred
    assert ham_pred["confidence_percentage"] >= 50.0

    # 5. Predict on spam email
    spam_pred = predict_email(
        subject="URGENT: WINNER CLAIM CASH",
        body="Congratulations lottery winner! Your account is credited with $1,000,000. Verify immediately.",
        pipeline=pipeline,
        metadata=loaded_meta
    )
    assert spam_pred["status"] == "success"
    assert "influential_features" in spam_pred
    assert spam_pred["confidence_percentage"] >= 50.0

    # 6. Predict on empty input check
    invalid_pred = predict_email(subject="", body="", pipeline=pipeline)
    assert invalid_pred["status"] == "invalid_input"

    # Restore primary model on enron dataset
    ensure_trained_model(force_retrain=True)
