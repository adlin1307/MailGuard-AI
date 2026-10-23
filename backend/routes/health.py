import os
from datetime import datetime, timezone
from flask import Blueprint, jsonify
from ml.train import load_trained_pipeline

health_bp = Blueprint("health", __name__)

@health_bp.route("/health", methods=["GET"])
def health_check():
    pipeline, metadata = load_trained_pipeline()
    return jsonify({
        "status": "healthy",
        "service": "ProbMail AI Email Security Platform",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_loaded": pipeline is not None,
        "last_trained_at": metadata.get("trained_at") if metadata else None
    })
