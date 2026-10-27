from flask import Blueprint, jsonify, current_app
from services.db import (
    get_recent_predictions,
    clear_prediction_history,
    get_prediction_statistics,
    get_prediction_by_id
)
from services.auth_helper import get_authenticated_user

predictions_bp = Blueprint("predictions", __name__)


@predictions_bp.route("/predictions/history", methods=["GET"])
def get_history():
    """
    Returns stored prediction records from SQLite.
    When authenticated, strictly scopes records and statistics to the current user.
    """
    user = get_authenticated_user()
    owner_id = user["user_id"] if user else None
    records = get_recent_predictions(limit=100, owner_id=owner_id)
    stats = get_prediction_statistics(owner_id=owner_id)
    return jsonify({
        "status": "success",
        "count": len(records),
        "statistics": stats,
        "predictions": records,
        "scoped_user": user["user_id"] if user else None
    })


@predictions_bp.route("/predictions/<int:prediction_id>", methods=["GET"])
def get_single_prediction(prediction_id: int):
    """
    Returns details for a specific past scan from SQLite.
    Enforces authorization: if a record is owned by a user, unauthorized users receive 403 Forbidden.
    """
    record = get_prediction_by_id(prediction_id)
    if not record:
        return jsonify({"status": "error", "error": "Prediction record not found"}), 404

    record_owner = record.get("owner_id")
    if record_owner:
        user = get_authenticated_user()
        if not user or user["user_id"] != record_owner:
            return jsonify({
                "status": "error",
                "error": "Forbidden: You are not authorized to view this scan record."
            }), 403

    return jsonify({
        "status": "success",
        "prediction": record
    })


@predictions_bp.route("/predictions/history", methods=["DELETE"])
def delete_history():
    """
    Clears prediction records.
    When authenticated, strictly deletes ONLY the current user's records,
    preventing any user from deleting another user's or global records.
    Unauthenticated callers cannot delete records unless in test mode.
    """
    user = get_authenticated_user()
    if user:
        deleted_count = clear_prediction_history(owner_id=user["user_id"])
        return jsonify({
            "status": "success",
            "message": f"Successfully cleared {deleted_count} prediction records for your account.",
            "deleted_count": deleted_count
        })
    else:
        if current_app.config.get("TESTING"):
            deleted_count = clear_prediction_history()
            return jsonify({
                "status": "success",
                "message": f"Successfully cleared {deleted_count} prediction records.",
                "deleted_count": deleted_count
            })
        return jsonify({
            "status": "error",
            "error": "Unauthorized: Authentication required to clear scan history."
        }), 401
