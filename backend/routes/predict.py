from flask import Blueprint, request, jsonify, send_file
import io
from datetime import datetime, timezone
from ml.predict import predict_email
from services.db import save_prediction, get_prediction_by_id, get_recent_predictions
from services.report_service import generate_scan_report_pdf
from services.auth_helper import get_authenticated_user

predict_bp = Blueprint("predict", __name__)


@predict_bp.route("/predict", methods=["POST"])
def scan_email():
    """
    Scans an email (subject + body or uploaded text file) using the trained pipeline.
    Saves an audit record to SQLite with estimated spam and ham probabilities,
    attributed to the authenticated user if logged in, and
    returns probabilistic verdict, influential words, risk score, and explanation.
    """
    subject = None
    body = None

    # Support multipart file upload (e.g. email.txt, alert.eml)
    upload_info = None
    if "file" in request.files:
        file = request.files["file"]
        if file and file.filename != "":
            filename = file.filename
            file_ext = "eml" if filename.lower().endswith(".eml") else "txt" if filename.lower().endswith(".txt") else "file"
            try:
                raw_bytes = file.read()
                content = raw_bytes.decode("utf-8", errors="replace")
                subject = filename  # Retain original uploaded filename as subject
                
                if file_ext == "eml":
                    try:
                        import email
                        from email import policy
                        msg = email.message_from_bytes(raw_bytes, policy=policy.default)
                        body_part = msg.get_body(preferencelist=("plain", "html"))
                        if body_part:
                            extracted = body_part.get_content()
                            body = extracted if isinstance(extracted, str) and extracted.strip() else content
                        else:
                            payload = msg.get_payload()
                            body = payload if isinstance(payload, str) and payload.strip() else content
                    except Exception:
                        body = content
                else:
                    body = content

                upload_info = {
                    "filename": filename,
                    "file_type": file_ext,
                    "label": f"Uploaded {file_ext.upper()} File"
                }
            except Exception as e:
                return jsonify({"error": f"Failed to read email file: {str(e)}"}), 400

    # Or standard JSON payload
    json_data = request.get_json(silent=True) or {}
    if not body and not subject:
        subject = json_data.get("subject")
        body = json_data.get("body") or json_data.get("text")

    subj_clean = (subject or "").strip()
    body_clean = (body or "").strip()

    if not subj_clean and not body_clean:
        return jsonify({
            "status": "error",
            "error": "Email subject and body are both empty. Please enter an email subject or message body to analyze."
        }), 400

    # Run ML prediction
    result = predict_email(subject=subj_clean, body=body_clean)

    if result.get("status") != "success":
        return jsonify(result), 400

    if upload_info:
        result["upload_info"] = upload_info

    # Save to SQLite prediction history, scoping to authenticated owner if present
    # Check if recording history is explicitly disabled (e.g. for transient pre-flight checks or on-demand detail inspection)
    record_history = True
    if isinstance(json_data, dict):
        if "record_history" in json_data:
            record_history = bool(json_data["record_history"])
        elif "recordHistory" in json_data:
            record_history = bool(json_data["recordHistory"])

    if record_history:
        try:
            user = get_authenticated_user()
            owner_id = user["user_id"] if user else None

            snippet_text = body_clean if body_clean else subj_clean
            snippet = snippet_text[:120]
            rec_id = save_prediction(
                subject=subj_clean if subj_clean else "Untitled Email",
                snippet=snippet,
                predicted_class=result["predicted_class"],
                confidence=result["confidence_percentage"],
                spam_prob=result.get("spam_probability"),
                ham_prob=result.get("ham_probability"),
                risk_score=result.get("risk_score"),
                owner_id=owner_id
            )
            result["prediction_id"] = rec_id
            if owner_id:
                result["owner_id"] = owner_id
        except Exception as e:
            print(f"Warning: Failed to save prediction to DB: {e}")

    return jsonify(result)


@predict_bp.route("/predict/report", methods=["POST", "GET"])
@predict_bp.route("/predict/report/", methods=["POST", "GET"])
def download_scan_report():
    """
    Generates and serves a downloadable PDF scan report for an analyzed email.
    Supports both POST with JSON scan payload and GET with query parameters or recent scan.
    Filename: ProbMail_Scan_Report_YYYY-MM-DD.pdf
    """
    data = {}
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form.to_dict() or {}
    else:  # GET
        pred_id = request.args.get("id") or request.args.get("prediction_id")
        if pred_id and str(pred_id).isdigit():
            rec = get_prediction_by_id(int(pred_id))
            if rec:
                rec_owner = rec.get("owner_id")
                if rec_owner:
                    user = get_authenticated_user()
                    if not user or user["user_id"] != rec_owner:
                        return jsonify({"error": "Forbidden: You are not authorized to download this scan report."}), 403
                data = rec
        if not data and request.args:
            data = request.args.to_dict()
        if not data:
            recent = get_recent_predictions(limit=1)
            if recent:
                data = recent[0]

    if not data:
        return jsonify({"error": "No scan data provided to generate report."}), 400

    try:
        pdf_bytes = generate_scan_report_pdf(data)
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filename = f"ProbMail_Scan_Report_{date_str}.pdf"

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f"[ProbMail Report Error] Failed to generate PDF: {e}")
        return jsonify({"error": f"Failed to generate scan report: {str(e)}"}), 500


@predict_bp.route("/predict/report/<int:prediction_id>", methods=["GET", "POST"])
@predict_bp.route("/predict/report/<int:prediction_id>/", methods=["GET", "POST"])
def download_scan_report_by_id(prediction_id: int):
    """
    Generates and downloads a scan report for an existing prediction record in the SQLite database.
    Enforces authorization: users cannot download another user's owned scan report.
    """
    record = get_prediction_by_id(prediction_id)
    if not record:
        return jsonify({"error": f"Scan record #{prediction_id} not found."}), 404

    record_owner = record.get("owner_id")
    if record_owner:
        user = get_authenticated_user()
        if not user or user["user_id"] != record_owner:
            return jsonify({"error": "Forbidden: You are not authorized to download this scan report."}), 403

    try:
        pdf_bytes = generate_scan_report_pdf(record)
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filename = f"ProbMail_Scan_Report_{prediction_id}_{date_str}.pdf"

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"error": f"Failed to generate scan report: {str(e)}"}), 500


@predict_bp.route("/features/statistics/<term>", methods=["GET"])
def get_term_statistics(term: str):
    """
    Returns actual training-set Chi-Square statistics, p-value, significance status,
    and selection status for a feature term from the fitted statistical selector.
    """
    from ml.predict import get_feature_statistics
    stats = get_feature_statistics(term)
    return jsonify({
        "status": "success",
        "feature": stats
    })


@predict_bp.route("/features/statistics", methods=["POST"])
def get_multiple_feature_statistics():
    """
    Returns actual training-set Chi-Square statistics for multiple terms.
    """
    from ml.predict import get_feature_statistics
    data = request.get_json(silent=True) or {}
    terms = data.get("terms") or data.get("features") or []
    if not isinstance(terms, list):
        return jsonify({"status": "error", "error": "terms must be a list of strings"}), 400

    results = [get_feature_statistics(t) for t in terms]
    return jsonify({
        "status": "success",
        "count": len(results),
        "features": results
    })
