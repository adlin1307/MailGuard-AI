from flask import Blueprint, jsonify
from services.db import (
    get_recent_predictions,
    clear_prediction_history,
    get_prediction_statistics,
    get_prediction_by_id
)

predictions_bp = Blueprint("predictions", __name__)


@predictions_bp.route("/predictions/history", methods=["GET"])
def get_history():
    """Returns stored prediction records from SQLite."""
    records = get_recent_predictions(limit=100)
    stats = get_prediction_statistics()
    return jsonify({
        "status": "success",
        "count": len(records),
        "statistics": stats,
        "predictions": records
    })


@predictions_bp.route("/predictions/<int:prediction_id>", methods=["GET"])
def get_single_prediction(prediction_id: int):
    """Returns details for a specific past scan from SQLite."""
    record = get_prediction_by_id(prediction_id)
    if not record:
        return jsonify({"status": "error", "error": "Prediction record not found"}), 404
    return jsonify({
        "status": "success",
        "prediction": record
    })


@predictions_bp.route("/predictions/history", methods=["DELETE"])
def delete_history():
    """Clears all prediction records from SQLite."""
    deleted_count = clear_prediction_history()
    return jsonify({
        "status": "success",
        "message": f"Successfully cleared {deleted_count} prediction records.",
        "deleted_count": deleted_count
    })
