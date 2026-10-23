from flask import Blueprint, request, jsonify, send_file
import io
from datetime import datetime, timezone
from ml.predict import predict_email
from services.db import save_prediction, get_prediction_by_id, get_recent_predictions
from services.report_service import generate_scan_report_pdf

predict_bp = Blueprint("predict", __name__)


@predict_bp.route("/predict", methods=["POST"])
def scan_email():
    """
    Scans an email (subject + body or uploaded text file) using the trained pipeline.
    Saves an audit record to SQLite with estimated spam and ham probabilities and
    returns probabilistic verdict, influential words, risk score, and explanation.
    """
    subject = None
    body = None

    # Support multipart file upload (e.g. email.txt)
    if "file" in request.files:
        file = request.files["file"]
        if file and file.filename != "":
            try:
                content = file.read().decode("utf-8", errors="replace")
                subject = file.filename
                body = content
            except Exception as e:
                return jsonify({"error": f"Failed to read email file: {str(e)}"}), 400

    # Or standard JSON payload
    if not body and not subject:
        json_data = request.get_json(silent=True) or {}
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

    # Save to SQLite prediction history
    try:
        snippet_text = body_clean if body_clean else subj_clean
        snippet = snippet_text[:120]
        rec_id = save_prediction(
            subject=subj_clean if subj_clean else "Untitled Email",
            snippet=snippet,
            predicted_class=result["predicted_class"],
            confidence=result["confidence_percentage"],
            spam_prob=result.get("spam_probability"),
            ham_prob=result.get("ham_probability"),
            risk_score=result.get("risk_score")
        )
        result["prediction_id"] = rec_id
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
    """
    record = get_prediction_by_id(prediction_id)
    if not record:
        return jsonify({"error": f"Scan record #{prediction_id} not found."}), 404

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
