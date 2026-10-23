from flask import Blueprint, request, jsonify
from services.dataset_service import dataset_service
from services.job_manager import training_manager
from ml.train import load_trained_pipeline

model_bp = Blueprint("model", __name__)


@model_bp.route("/model/train", methods=["POST"])
def trigger_training():
    """
    Initiates asynchronous model training on the active validated dataset.
    Prevents data leakage by encapsulating TF-IDF and Chi-Square selection inside the training split.
    """
    cleaned_df = dataset_service.get_cleaned_dataset()
    if cleaned_df is None or cleaned_df.empty:
        return jsonify({
            "error": "No validated dataset loaded. Please upload or load a dataset first."
        }), 400

    if len(cleaned_df) < 10:
        return jsonify({
            "error": "Dataset has fewer than 10 valid samples. Insufficient data to train."
        }), 400

    body = request.get_json() or {}
    k_best = int(body.get("k_best", 50))
    test_size = float(body.get("test_size", 0.2))
    alpha = float(body.get("alpha", 1.0))
    max_features = int(body.get("max_features", 1500))

    # Validate parameters
    test_size = max(0.1, min(test_size, 0.4))
    k_best = max(5, min(k_best, 500))
    alpha = max(0.01, min(alpha, 10.0))

    started = training_manager.start_training(
        df=cleaned_df,
        text_col="clean_text",
        label_col="label",
        k_best=k_best,
        max_features=max_features,
        test_size=test_size,
        alpha=alpha
    )

    if not started:
        return jsonify({
            "error": "A training job is already currently running. Please wait for it to complete."
        }), 409

    return jsonify({
        "status": "training_started",
        "message": f"Model training initiated with Top {k_best} Chi-Square features.",
        "configuration": {
            "k_best": k_best,
            "test_size": test_size,
            "alpha": alpha,
            "max_features": max_features
        }
    })


@model_bp.route("/model/status", methods=["GET"])
def get_training_status():
    """Returns genuine status of training process."""
    status_info = training_manager.get_status()
    if status_info["status"] == "completed":
        status_info["result"] = training_manager.get_result()
    return jsonify(status_info)


@model_bp.route("/model/evaluation", methods=["GET"])
def get_model_evaluation():
    """Returns evaluation metrics on held-out test data from the active trained model."""
    pipeline, metadata = load_trained_pipeline()
    if not metadata or not pipeline:
        return jsonify({
            "is_trained": False,
            "message": "No trained model found. Please train a model to view evaluation metrics."
        })

    return jsonify({
        "is_trained": True,
        "trained_at": metadata.get("trained_at"),
        "model_name": metadata.get("model_name"),
        "dataset_statistics": metadata.get("dataset_statistics"),
        "hyperparameters": metadata.get("hyperparameters"),
        "evaluation": metadata.get("evaluation"),
        "chi_square_summary": metadata.get("chi_square_summary")
    })
