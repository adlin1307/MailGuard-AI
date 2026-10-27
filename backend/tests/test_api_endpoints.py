import pytest
import json
import io
from app import create_app
from services.db import clear_prediction_history
from services.dataset_service import dataset_service


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "healthy"
    assert "service" in data


def test_enron_dataset_auto_loaded():
    """Verifies that enron_spam_data.csv is automatically loaded on initialization."""
    assert dataset_service.is_loaded() is True
    summary = dataset_service.get_summary()
    assert summary is not None
    assert "enron_spam_data.csv" in summary["filename"]
    assert summary["total_rows_raw"] == 1500
    assert summary["usable_records"]["total"] == 1352
    assert summary["usable_records"]["ham_count"] == 824
    assert summary["usable_records"]["spam_count"] == 528


def test_dashboard_endpoint(client):
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.get_json()
    assert "dataset" in data
    assert data["dataset"]["is_loaded"] is True
    assert data["dataset"]["total_usable"] == 1352
    assert data["dataset"]["ham_count"] == 824
    assert data["dataset"]["spam_count"] == 528
    assert "metrics" in data
    assert "model" in data
    assert "recent_predictions" in data


def test_analytics_endpoints(client):
    # Stats endpoint
    res_stats = client.get("/api/analytics/statistics")
    assert res_stats.status_code == 200
    stats_data = res_stats.get_json()
    assert stats_data["is_available"] is True
    assert "classes" in stats_data["statistics"]
    assert "class_imbalance" in stats_data["statistics"]
    assert "hygiene" in stats_data["statistics"]
    assert stats_data["statistics"]["hygiene"]["total_usable_emails"] == 1352

    # Chi-Square endpoint
    res_chi = client.get("/api/analytics/chi-square?k=20")
    assert res_chi.status_code == 200
    chi_data = res_chi.get_json()
    assert chi_data["is_available"] is True
    assert "features" in chi_data["analysis"]
    assert len(chi_data["analysis"]["features"]) > 0


def test_predict_and_prediction_history_flow(client):
    # Clear previous history
    client.delete("/api/predictions/history")

    # Scan a ham email
    scan_payload = {
        "subject": "Staff Meeting Tomorrow Morning",
        "body": "Here is the agenda for tomorrow morning staff meeting: pipeline maintenance and volume targets."
    }
    scan_res = client.post(
        "/api/predict",
        data=json.dumps(scan_payload),
        content_type="application/json"
    )
    assert scan_res.status_code == 200
    scan_data = scan_res.get_json()
    assert scan_data["status"] == "success"
    assert "predicted_class" in scan_data
    assert "confidence_percentage" in scan_data
    assert "spam_probability" in scan_data
    assert "ham_probability" in scan_data

    # Check that history now includes the prediction with probabilities
    hist_res = client.get("/api/predictions/history")
    assert hist_res.status_code == 200
    hist_data = hist_res.get_json()
    assert hist_data["count"] >= 1
    rec = hist_data["predictions"][0]
    assert rec["subject"] == "Staff Meeting Tomorrow Morning"
    assert "spam_probability" in rec
    assert "ham_probability" in rec
    assert "risk_score" in rec
    assert "risk_category" in rec

    # Check single prediction detail endpoint
    rec_id = rec["id"]
    detail_res = client.get(f"/api/predictions/{rec_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.get_json()
    assert detail_data["status"] == "success"
    assert detail_data["prediction"]["id"] == rec_id

    # Test PDF Report generation endpoint
    report_res = client.post(
        "/api/predict/report",
        data=json.dumps(scan_data),
        content_type="application/json"
    )
    assert report_res.status_code == 200
    assert report_res.mimetype == "application/pdf"
    assert report_res.data.startswith(b"%PDF-1.4")
    assert len(report_res.data) > 500

    # Test PDF Report by prediction ID
    report_id_res = client.get(f"/api/predict/report/{rec_id}")
    assert report_id_res.status_code == 200
    assert report_id_res.mimetype == "application/pdf"
    assert report_id_res.data.startswith(b"%PDF-1.4")


def test_invalid_predict_input(client):
    # Empty payload should return 400
    res = client.post(
        "/api/predict",
        data=json.dumps({"subject": "", "body": ""}),
        content_type="application/json"
    )
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_predict_txt_file_upload(client):
    data = {
        "file": (io.BytesIO(b"Urgent account security alert: verify password immediately"), "security_alert.txt")
    }
    res = client.post("/api/predict", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    result = res.get_json()
    assert result["status"] == "success"
    assert "predicted_class" in result
    assert "upload_info" in result
    assert result["upload_info"]["filename"] == "security_alert.txt"
    assert result["upload_info"]["file_type"] == "txt"

    # Verify history retains the original filename
    hist_res = client.get("/api/predictions/history")
    assert hist_res.status_code == 200
    predictions = hist_res.get_json()["predictions"]
    assert any(p["subject"] == "security_alert.txt" for p in predictions)


def test_predict_eml_file_upload(client):
    eml_content = (
        b"From: billing@phish-domain.com\r\n"
        b"To: victim@example.org\r\n"
        b"Subject: Overdue Invoice\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n"
        b"\r\n"
        b"Dear user, you have won $1,000,000 lottery cash prize! Click here immediately to claim.\r\n"
    )
    data = {
        "file": (io.BytesIO(eml_content), "invoice_1092.eml")
    }
    res = client.post("/api/predict", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    result = res.get_json()
    assert result["status"] == "success"
    assert "predicted_class" in result
    assert "upload_info" in result
    assert result["upload_info"]["filename"] == "invoice_1092.eml"
    assert result["upload_info"]["file_type"] == "eml"

    # Verify history retains the .eml filename
    hist_res = client.get("/api/predictions/history")
    assert hist_res.status_code == 200
    predictions = hist_res.get_json()["predictions"]
    assert any(p["subject"] == "invoice_1092.eml" for p in predictions)

