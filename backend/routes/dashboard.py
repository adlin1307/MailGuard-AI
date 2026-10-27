from flask import Blueprint, jsonify
from services.db import get_prediction_statistics, get_recent_predictions
from services.dataset_service import dataset_service
from ml.train import load_trained_pipeline
from services.auth_helper import get_authenticated_user

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard", methods=["GET"])
def get_dashboard_data():
    """
    Returns authentic dashboard statistics aggregated from the real preloaded dataset,
    SQLite scan history, and genuine model evaluation metrics.
    When authenticated, scopes metrics and recent scans strictly to the current user.
    """
    # 1. Dataset information from active loaded dataset
    dataset_summary = dataset_service.get_summary()
    cleaned_df = dataset_service.get_cleaned_dataset()

    if dataset_summary and cleaned_df is not None:
        usable_stats = dataset_summary.get("usable_records", {})
        inspection = dataset_summary.get("inspection", {})
        prep = dataset_summary.get("preprocessing", {})

        dataset_info = {
            "is_loaded": True,
            "filename": dataset_service._filename or "enron_spam_data.csv",
            "total_raw": dataset_summary.get("total_rows_raw", len(cleaned_df)),
            "total_usable": usable_stats.get("total", len(cleaned_df)),
            "duplicates_removed": prep.get("duplicates_removed", 0),
            "missing_values": inspection.get("missing_values", {}).get("total", 0),
            "ham_count": usable_stats.get("ham_count", 0),
            "spam_count": usable_stats.get("spam_count", 0),
            "ham_percentage": usable_stats.get("ham_percentage", 0.0),
            "spam_percentage": usable_stats.get("spam_percentage", 0.0),
            "class_distribution": prep.get("class_distribution", {})
        }
    else:
        dataset_info = {
            "is_loaded": False,
            "filename": None,
            "total_raw": 0,
            "total_usable": 0,
            "duplicates_removed": 0,
            "missing_values": 0,
            "ham_count": 0,
            "spam_count": 0,
            "ham_percentage": 0.0,
            "spam_percentage": 0.0,
            "class_distribution": {}
        }

    # 2. Real scan statistics from SQLite (scoped to authenticated user if present)
    user = get_authenticated_user()
    owner_id = user["user_id"] if user else None
    scan_stats = get_prediction_statistics(owner_id=owner_id)
    recent_scans = get_recent_predictions(limit=10, owner_id=owner_id)

    # 3. Genuine model evaluation and hyperparameters
    pipeline, metadata = load_trained_pipeline()

    if metadata:
        eval_data = metadata.get("evaluation", {})
        overall = eval_data.get("overall", {})
        spam_eval = eval_data.get("spam_detection", {})
        ds_stats = metadata.get("dataset_statistics", {})
        hp = metadata.get("hyperparameters", {})

        model_info = {
            "is_trained": True,
            "trained_at": metadata.get("trained_at"),
            "model_name": metadata.get("model_name"),
            "accuracy": overall.get("accuracy"),
            "precision": overall.get("weighted_precision"),
            "recall": overall.get("weighted_recall"),
            "macro_f1": overall.get("macro_f1"),
            "weighted_f1": overall.get("weighted_f1"),
            "spam_precision": spam_eval.get("precision"),
            "spam_recall": spam_eval.get("recall"),
            "spam_f1": spam_eval.get("f1_score"),
            "test_samples": ds_stats.get("test_samples", 0),
            "train_samples": ds_stats.get("train_samples", 0),
            "k_features": hp.get("k_best_features", 50),
            "classes": ds_stats.get("classes", ["ham", "spam"])
        }
    else:
        model_info = {
            "is_trained": False,
            "trained_at": None,
            "model_name": None,
            "accuracy": None,
            "precision": None,
            "recall": None,
            "macro_f1": None,
            "weighted_f1": None,
            "spam_precision": None,
            "spam_recall": None,
            "spam_f1": None,
            "test_samples": 0,
            "train_samples": 0,
            "k_features": None,
            "classes": []
        }

    return jsonify({
        "status": "success",
        "dataset": dataset_info,
        "metrics": scan_stats,
        "model": model_info,
        "recent_predictions": recent_scans,
        "is_empty_state": scan_stats["total_analyzed"] == 0 and not model_info["is_trained"]
    })
