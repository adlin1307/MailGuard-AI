"""
Shared Backend Mailbox Routes for ProbMail.
Provides authenticated, server-persisted message delivery between registered ProbMail users.
Guarantees verified sender and recipient identity enforcement via cryptographic tokens.
"""
import time
import uuid
import re
import json
from flask import Blueprint, request, jsonify
from services.auth_helper import get_authenticated_user
from services.db import (
    save_mailbox_message,
    get_inbox_messages,
    get_spam_messages,
    get_sent_messages,
    mark_message_read,
    toggle_message_star,
    toggle_message_spam,
    delete_mailbox_message,
    get_user_by_email,
    save_draft,
    get_user_drafts,
    get_draft,
    delete_draft,
    get_user_sent_recipients,
)
from ml.predict import predict_email

mailbox_bp = Blueprint("mailbox", __name__)


@mailbox_bp.route("/mailbox/send", methods=["POST"])
def send_email():
    """
    Sends an email from the authenticated user to a recipient.
    Enforces sender identity from cryptographic token.
    Validates that the recipient is a registered ProbMail account.
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
    recipient_email = (data.get("recipient_email") or data.get("to_email") or "").strip().lower()
    recipient_name = (data.get("recipient_name") or data.get("to_name") or "").strip() or recipient_email.split("@")[0]
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()

    if not recipient_email or "@" not in recipient_email:
        return jsonify({"status": "error", "error": "A valid recipient email address is required."}), 400

    if not subject:
        return jsonify({"status": "error", "error": "Email subject is required."}), 400

    if not body:
        return jsonify({"status": "error", "error": "Email body content is required."}), 400

    # Strict Recipient Verification: Check if recipient is a registered account
    recipient_user = get_user_by_email(recipient_email)
    if not recipient_user:
        return jsonify({
            "status": "error",
            "error": f"Delivery failed: Recipient '{recipient_email}' is not a registered ProbMail user. Please verify the address."
        }), 404

    recipient_name = recipient_user.get("name") or recipient_name

    sender_id = user["user_id"]
    sender_email = user["email"].strip().lower()
    sender_name = user.get("name") or sender_email.split("@")[0]

    # Run real ML prediction on incoming message for spam filtering
    # NOTE: Does NOT call save_prediction() so no scan history record is generated
    try:
        pred = predict_email(subject=subject, body=body)
        if isinstance(pred, dict) and pred.get("status") in ["unavailable"]:
            return jsonify({
                "status": "error",
                "error": f"Email delivery failed: ML classifier is unavailable ({pred.get('error')})."
            }), 503

        is_spam = pred.get("predicted_class") == "spam"
        predicted_class = pred.get("predicted_class", "ham")
        confidence = float(pred.get("confidence_percentage", 95.0))
        spam_prob = float(pred.get("spam_probability", 95.0 if is_spam else 5.0))
        ham_prob = float(pred.get("ham_probability", 5.0 if is_spam else 95.0))
        risk_score = int(pred.get("risk_score", 90 if is_spam else 5))
        risk_level = str(pred.get("risk_level", "high" if is_spam else "low"))
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": f"Email delivery aborted: ML classification failed ({str(e)})."
        }), 500

    # Grounded evidence extraction using shared analysis service
    from ml.predict import generate_mailbox_analysis_payload
    analysis_payload = generate_mailbox_analysis_payload(subject=subject, body=body)
    if not analysis_payload:
        combined_raw = f"{subject}\n{body}"
        detected_links = re.findall(r'https?://[^\s<>"]+|www\.[^\s<>"]+', combined_raw)
        analysis_payload = {
            "verdict": "SPAM" if is_spam else "HAM",
            "verdict_title": pred.get("verdict_title", ""),
            "explanation": pred.get("verdict_summary", ""),
            "top_indicators": [],
            "warning_signs": pred.get("warning_signs", []),
            "suspicious_phrases": [],
            "detected_links": detected_links,
            "chi2_summary": pred.get("chi2_summary"),
            "recommended_precautions": pred.get("recommended_precautions", []),
            "accuracy_note": pred.get("accuracy_note", ""),
            "disclaimer": pred.get("disclaimer", "")
        }
    analysis_json_str = json.dumps(analysis_payload)

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
        risk_level=risk_level,
        spam_probability=spam_prob,
        ham_probability=ham_prob,
        analysis_json=analysis_json_str
    )

    draft_id = data.get("draft_id")
    if draft_id:
        try:
            delete_draft(draft_id=draft_id, user_id=user["user_id"])
        except Exception as e:
            print(f"Warning: Failed to remove draft {draft_id} upon send: {e}")

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


@mailbox_bp.route("/mailbox/<mail_id>/toggle-spam", methods=["POST"])
def toggle_spam(mail_id: str):
    """Toggles is_spam for moving message between Inbox and Spam for the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    ok = toggle_message_spam(mail_id=mail_id, user_email=user["email"])
    if not ok:
        return jsonify({"status": "error", "error": "Message not found or unauthorized."}), 404

    return jsonify({"status": "success", "message": "Message spam status toggled."})


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


@mailbox_bp.route("/mailbox/recipients", methods=["GET"])
def get_sent_recipients():
    """
    Returns deduplicated recipients that the authenticated user has previously sent emails to.
    Guarantees account isolation and excludes the user themselves.
    """
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    recipients = get_user_sent_recipients(sender_id=user["user_id"], sender_email=user["email"])
    return jsonify({
        "status": "success",
        "recipients": recipients
    })


@mailbox_bp.route("/mailbox/drafts", methods=["GET"])
def list_drafts():
    """Retrieves all drafts belonging exclusively to the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    drafts = get_user_drafts(user_id=user["user_id"])
    return jsonify({
        "status": "success",
        "count": len(drafts),
        "drafts": drafts
    })


@mailbox_bp.route("/mailbox/drafts", methods=["POST"])
def create_or_update_draft():
    """
    Saves or updates an unsent draft for the authenticated user.
    Does NOT deliver message or classify as received email.
    Prevents duplicates on repeated autosaves by using draft ID.
    """
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    data = request.get_json(silent=True) or {}
    draft_id = (data.get("id") or "").strip()
    if not draft_id:
        draft_id = f"draft_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"

    recipient_email = (data.get("recipient_email") or "").strip().lower()
    recipient_name = (data.get("recipient_name") or "").strip() or (recipient_email.split("@")[0] if recipient_email else "")
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()

    # Reject saving completely empty drafts
    if not recipient_email and not subject and not body:
        return jsonify({"status": "error", "error": "Cannot save empty draft."}), 400

    saved = save_draft(
        draft_id=draft_id,
        user_id=user["user_id"],
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        subject=subject,
        body=body
    )
    return jsonify({
        "status": "success",
        "message": "Draft saved successfully.",
        "draft": saved
    })


@mailbox_bp.route("/mailbox/drafts/<draft_id>", methods=["DELETE"])
def remove_draft(draft_id: str):
    """Deletes an unsent draft for the authenticated user."""
    user = get_authenticated_user()
    if not user:
        return jsonify({"status": "error", "error": "Authentication required."}), 401

    ok = delete_draft(draft_id=draft_id, user_id=user["user_id"])
    if not ok:
        return jsonify({"status": "error", "error": "Draft not found or unauthorized."}), 404

    return jsonify({"status": "success", "message": "Draft deleted successfully."})
