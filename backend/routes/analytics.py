from flask import Blueprint, request, jsonify
from services.dataset_service import dataset_service
from ml.statistics import compute_dataset_statistics
from ml.feature_selection import fit_chi_square_selector, analyze_selected_features
from ml.train import load_trained_pipeline

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/analytics/statistics", methods=["GET"])
def get_dataset_statistics():
    """
    Returns authentic statistical analysis of the active dataset:
    Class imbalance, descriptive length metrics, top frequent tokens by class,
    security characteristics, and CO5 viva defense notes.
    """
    cleaned_df = dataset_service.get_cleaned_dataset()
    if cleaned_df is None or cleaned_df.empty:
        return jsonify({
            "is_available": False,
            "error": "No dataset currently loaded. Please ensure enron_spam_data.csv is available."
        }), 404

    stats = compute_dataset_statistics(
        df=cleaned_df,
        text_col="clean_text",
        label_col="label"
    )

    summary = dataset_service.get_summary() or {}
    prep = summary.get("preprocessing", {})
    insp = summary.get("inspection", {})
    usable = summary.get("usable_records", {})

    stats["hygiene"] = {
        "total_raw_rows": summary.get("total_rows_raw", len(cleaned_df)),
        "total_usable_emails": usable.get("total", len(cleaned_df)),
        "duplicates_removed": prep.get("duplicates_removed", 0),
        "missing_values_count": insp.get("missing_values", {}).get("total", 0),
        "unrecognized_labels_count": len(prep.get("unrecognized_labels", []))
    }

    stats["co5_definitions"] = {
        "mean_length": "Average email length across all records. Measures central tendency of email size.",
        "median_length": "Middle email length when sorted. Robust against extreme length outliers.",
        "std_dev_length": "Standard deviation measures the dispersion/variance of email length around the mean.",
        "conditional_probability": "P(Class | Word) — The probability that an email belongs to class C given term presence.",
        "chi_square_test": "Pearson's chi2 test assesses whether a term's occurrence is statistically independent of the Spam/Ham label."
    }

    return jsonify({
        "is_available": True,
        "filename": dataset_service._filename or "enron_spam_data.csv",
        "statistics": stats
    })


@analytics_bp.route("/analytics/chi-square", methods=["GET"])
def get_chi_square_analysis():
    """
    Performs Chi-Square feature selection on the active dataset:
    Computes chi2 scores and p-values for top k terms, determines class association,
    and formats statistical significance interpretations.
    """
    cleaned_df = dataset_service.get_cleaned_dataset()
    if cleaned_df is None or cleaned_df.empty:
        return jsonify({
            "is_available": False,
            "error": "No dataset currently loaded for Chi-Square analysis."
        }), 404

    # Configurable k
    try:
        k = int(request.args.get("k", 50))
        k = max(5, min(k, 300))
    except ValueError:
        k = 50

    try:
        # Check if active model has pre-computed analysis
        pipeline, metadata = load_trained_pipeline()
        if metadata and "chi_square_summary" in metadata and k == metadata.get("hyperparameters", {}).get("k_best_features", 50):
            # If fitted selector is available in memory
            if pipeline and "tfidf" in pipeline.named_steps and "chi2" in pipeline.named_steps:
                tfidf = pipeline.named_steps["tfidf"]
                chi2 = pipeline.named_steps["chi2"]
                X = cleaned_df["clean_text"].tolist()
                y = cleaned_df["label"].tolist()
                X_vec = tfidf.transform(X)
                analysis = analyze_selected_features(
                    vectorizer=tfidf,
                    selector=chi2,
                    X_train_vec=X_vec,
                    y_train=y,
                    top_n=k
                )
                return jsonify({
                    "is_available": True,
                    "filename": dataset_service._filename or "enron_spam_data.csv",
                    "source": "fitted_pipeline",
                    "analysis": analysis
                })

        # Otherwise calculate on dataset
        X = cleaned_df["clean_text"].tolist()
        y = cleaned_df["label"].tolist()

        vectorizer, selector, analysis = fit_chi_square_selector(
            X_train=X,
            y_train=y,
            k=k
        )

        return jsonify({
            "is_available": True,
            "filename": dataset_service._filename or "enron_spam_data.csv",
            "source": "calculated",
            "analysis": analysis
        })
    except Exception as e:
        return jsonify({
            "is_available": False,
            "error": f"Error performing Chi-Square feature selection: {str(e)}"
        }), 500
