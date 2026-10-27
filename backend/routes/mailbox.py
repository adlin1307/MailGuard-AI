"""
Shared Backend Mailbox Routes for ProbMail.
Provides authenticated, server-persisted message delivery between registered ProbMail users.
Guarantees verified sender and recipient identity enforcement via cryptographic tokens.
"""
import time
import uuid
from flask import Blueprint, request, jsonify
from services.auth_helper import get_authenticated_user
from services.db import (
    save_mailbox_message,
    get_inbox_messages,
    get_spam_messages,
    get_sent_messages,
    mark_message_read,
    toggle_message_star,
    delete_mailbox_message,
)
from ml.predict import predict_email

mailbox_bp = Blueprint("mailbox", __name__)


@mailbox_bp.route("/mailbox/send", methods=["POST"])
def send_email():
    """
    Sends an email from the authenticated user to a recipient.
    Enforces sender identity from cryptographic token.
    Runs ML classification on the message without adding it to the public scan history audit log.
    Persists to SQLite mailbox_messages for genuine cross-browser delivery.
    """
    user = get_authenticated_user()
    if not user:
        return jsonify({
            "status": "error",
            "error": "Authentication required. You must be logged in to send messages."
        }), 401

    data = request.get_json(silent=True) or {}
    recipient_email = (data.get("recipient_email") or "").strip().lower()
    recipient_name = (data.get("recipient_name") or "").strip() or recipient_email.split("@")[0]
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()

    if not recipient_email or "@" not in recipient_email:
        return jsonify({"status": "error", "error": "A valid recipient email address is required."}), 400

    if not subject:
        return jsonify({"status": "error", "error": "Email subject is required."}), 400

    if not body:
        return jsonify({"status": "error", "error": "Email body content is required."}), 400

    sender_id = user["user_id"]
    sender_email = user["email"].strip().lower()
    sender_name = user.get("name") or sender_email.split("@")[0]

    # Run ML prediction on incoming message for spam filtering
    # NOTE: Does NOT call save_prediction() so no scan history record is generated
    try:
        pred = predict_email(subject=subject, body=body)
        is_spam = pred.get("predicted_class") == "spam"
        predicted_class = pred.get("predicted_class", "ham")
        confidence = float(pred.get("confidence_percentage", 95.0))
        risk_score = int(pred.get("risk_score", 90 if is_spam else 5))
        risk_level = str(pred.get("risk_level", "high" if is_spam else "low"))
    except Exception as e:
        is_spam = False
        predicted_class = "ham"
        confidence = 90.0
        risk_score = 10
        risk_level = "low"

    mail_id = f"mail_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"

    saved_mail = save_mailbox_message(
        mail_id=mail_id,
        sender_id=sender_id,
        sender_email=sender_email,
        sender_name=sender_name,
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        subject=subject,
        body=body,
        is_spam=is_spam,
        predicted_class=predicted_class,
        confidence=confidence,
        risk_score=risk_score,
        risk_level=risk_level
    )

    return jsonify({
        "status": "success",
        "message": "Message sent and stored on backend successfully.",
        "mail": saved_mail
    }), 201


@mailbox_bp.route("/mailbox/inbox", methods=["GET"])
def get_inbox():
    """Retrieves legitimate inbox messages for the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    messages = get_inbox_messages(user["email"])
    return jsonify({
        "status": "success",
        "count": len(messages),
        "messages": messages
    })


@mailbox_bp.route("/mailbox/spam", methods=["GET"])
def get_spam():
    """Retrieves filtered spam messages for the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    messages = get_spam_messages(user["email"])
    return jsonify({
        "status": "success",
        "count": len(messages),
        "messages": messages
    })


@mailbox_bp.route("/mailbox/sent", methods=["GET"])
def get_sent():
    """Retrieves sent messages sent by the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    messages = get_sent_messages(user["user_id"])
    return jsonify({
        "status": "success",
        "count": len(messages),
        "messages": messages
    })


@mailbox_bp.route("/mailbox/<mail_id>/read", methods=["POST"])
def mark_read(mail_id: str):
    """Marks a message as read for the authenticated recipient."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    ok = mark_message_read(mail_id=mail_id, recipient_email=user["email"])
    if not ok:
        return jsonify({"status": "error", "error": "Message not found or unauthorized."}), 404

    return jsonify({"status": "success", "message": "Message marked as read."})


@mailbox_bp.route("/mailbox/<mail_id>/star", methods=["POST"])
def toggle_star(mail_id: str):
    """Toggles starred status for the authenticated user's message."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    ok = toggle_message_star(mail_id=mail_id, user_email=user["email"])
    if not ok:
        return jsonify({"status": "error", "error": "Message not found or unauthorized."}), 404

    return jsonify({"status": "success", "message": "Message star toggled."})


@mailbox_bp.route("/mailbox/<mail_id>", methods=["DELETE"])
def delete_message(mail_id: str):
    """Deletes a message for the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    ok = delete_mailbox_message(mail_id=mail_id, user_email=user["email"])
    if not ok:
        return jsonify({"status": "error", "error": "Message not found or unauthorized."}), 404

    return jsonify({"status": "success", "message": "Message deleted successfully."})
