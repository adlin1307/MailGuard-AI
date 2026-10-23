import pytest
import json
from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_spam_risk_score_and_flag_reasons(client):
    payload = {
        "subject": "URGENT: Your Bank Account Access Has Been Suspended",
        "body": "Your financial account security has been compromised. Immediate action is required to avoid permanent suspension. Please visit our verification portal to confirm your password and identity now."
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.get_json()

    assert data["predicted_class"] == "spam"
    assert "risk_score" in data
    assert data["risk_score"] >= 50
    assert data["risk_category"] in ["High Risk", "Medium Risk"]
    assert data["risk_level"] in ["high", "medium"]

    # Warning signs check
    assert "warning_signs" in data
    assert len(data["warning_signs"]) > 0
    categories = [ws.get("category") for ws in data["warning_signs"]]
    assert any(c in ["Urgency", "Credential Phishing", "Model Vocabulary"] for c in categories)

    # Precautions check
    assert "recommended_precautions" in data
    assert len(data["recommended_precautions"]) >= 3


def test_ham_risk_score_and_routine_dialogue(client):
    payload = {
        "subject": "Quarterly review notes and forecast deliverables",
        "body": "Attached are the volume forecasts and budget reviews for through October. Demand remains steady with operating efficiency at 94%. Please send any comments before Thursday."
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.get_json()

    assert data["predicted_class"] == "ham"
    assert "risk_score" in data
    assert data["risk_score"] < 30
    assert data["risk_category"] == "Low Risk"
    assert data["risk_level"] == "low"

    # Warning signs / dialogue cues check
    assert "warning_signs" in data
    assert len(data["warning_signs"]) > 0

    # Precautions check
    assert "recommended_precautions" in data
    assert len(data["recommended_precautions"]) >= 2
    # Ensure disclaimer is included
    assert any("not an absolute guarantee" in p.lower() or "vigilance" in p.lower() for p in data["recommended_precautions"])


def test_download_scan_report_pdf(client):
    # Predict an email first
    payload = {
        "subject": "CONGRATULATIONS! You won $1,000,000 cash payout",
        "body": "You have been selected as our grand prize winner of $1,000,000 cash. To claim your prize immediately, reply with your personal details and wire routing numbers today."
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    scan_result = res.get_json()

    # Probabilities must sum to ~100%
    assert abs((scan_result["spam_probability"] + scan_result["ham_probability"]) - 100.0) < 0.2
    assert scan_result["risk_score"] == round(scan_result["spam_probability"])

    # Request PDF report
    pdf_res = client.post("/api/predict/report", json=scan_result)
    assert pdf_res.status_code == 200
    assert pdf_res.mimetype == "application/pdf"
    assert pdf_res.data.startswith(b"%PDF-1.4")
    assert b"%%EOF" in pdf_res.data
    assert "attachment" in pdf_res.headers.get("Content-Disposition", "")
    assert "ProbMail_Scan_Report_" in pdf_res.headers.get("Content-Disposition", "")

    # Test PDF generation resilience when fields are None or partial
    partial_payload = {
        "subject": "Minimal Test",
        "predicted_class": "spam",
        "risk_score": None,
        "spam_probability": None,
        "ham_probability": None,
        "warning_signs": None,
        "recommended_precautions": None
    }
    partial_pdf_res = client.post("/api/predict/report", json=partial_payload)
    assert partial_pdf_res.status_code == 200
    assert partial_pdf_res.data.startswith(b"%PDF-1.4")
    assert b"%%EOF" in partial_pdf_res.data


def test_no_internal_tokens_in_explanations(client):
    """Verifies that internal preprocessing tokens like num_token or url_token never leak to users."""
    payload = {
        "subject": "Invoice 492040 for $5,400.00 from client 9982",
        "body": "Please see transaction 492040 totaling 5400 dollars. Check link https://payments.example.com/inv9982."
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.get_json()

    # Check influential features
    features = data.get("influential_features", [])
    for f in features:
        word = f.get("word", "").lower()
        desc = f.get("description", "").lower()
        assert "num_token" not in word and "num_token" not in desc
        assert "url_token" not in word and "url_token" not in desc
        assert "_token" not in word and "_token" not in desc

    # Check warning signs
    signs = data.get("warning_signs", [])
    for s in signs:
        title = s.get("title", "").lower()
        detail = s.get("detail", "").lower()
        phrase = s.get("highlighted_phrase", "").lower()
        assert "num_token" not in title and "num_token" not in detail and "num_token" not in phrase
        assert "url_token" not in title and "url_token" not in detail and "url_token" not in phrase


def test_no_fabricated_routine_dialogue_or_safety_proof(client):
    """
    Verifies that an email is not stamped as 'Routine Workplace Dialogue' simply for containing 'attached',
    and does not claim safety based on the absence of phishing keywords.
    """
    payload = {
        "subject": "Attached invoice.exe for your review",
        "body": "Please find attached the software invoice. Thanks and regards."
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.get_json()

    signs = data.get("warning_signs", [])
    titles = [s.get("title", "") for s in signs]
    details = [s.get("detail", "") for s in signs]

    # Ensure no fabricated claims of safety or legitimacy
    assert "Routine Operational & Workplace Dialogue" not in titles
    assert not any("Absence of High-Pressure" in t for t in titles)
    assert not any("guarantees safety" in d.lower() or "proves legitimate" in d.lower() for d in details)
    # Ensure disclaimer that it does NOT guarantee safety is present
    assert any("does not guarantee" in d.lower() or "statistical association" in d.lower() for d in details)


def test_honest_fallback_when_no_reliable_features(client):
    """Verifies that out-of-vocabulary emails display the honest fallback message."""
    payload = {
        "subject": "Violet xylophone zebra quokka",
        "body": "Amethyst kaleidoscope whispering beneath ethereal cloudscape serenades."
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.get_json()

    signs = data.get("warning_signs", [])
    assert len(signs) == 1
    fallback_text = signs[0].get("detail", "")
    assert "The model classified this email based on learned text patterns; no reliable feature-level explanation is available." in fallback_text
