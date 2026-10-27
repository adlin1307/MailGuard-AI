import json
import pytest
from services.auth_helper import generate_auth_token


def test_phase03_explainability_and_chi2_evidence(client):
    """
    Validates Phase 03 Statistical Explainability requirements:
    1. Verdict & genuine probabilities from model output (spam_prob + ham_prob == 100)
    2. Consistent risk score derived directly from spam_prob
    3. Grounded feature contributions with actual log-odds, chi2_score, p_value,
       significance threshold alpha = 0.05, training_association, prediction_contribution, interpretation.
    4. Chi-Square summary with verified alpha_threshold = 0.05 and distinction note.
    5. Heuristic warning signs distinguished from model features.
    """
    token = generate_auth_token("usr_p3_test", "p3test@mailguard.local")
    headers = {"Authorization": f"Bearer {token}"}

    # Test spam-oriented message with active vocabulary
    payload = {
        "subject": "URGENT: Verify your account to claim cash prize reward",
        "body": "Please click http://claim-award.com/verify and confirm your banking password immediately. Free bonus money waiting.",
        "record_history": False
    }

    res = client.post(
        "/api/predict",
        headers=headers,
        data=json.dumps(payload),
        content_type="application/json"
    )
    assert res.status_code == 200
    data = res.get_json()

    assert data["status"] == "success"
    assert data["predicted_class"] in ["spam", "ham"]

    # 1. Probabilities consistency
    spam_prob = data["spam_probability"]
    ham_prob = data["ham_probability"]
    assert isinstance(spam_prob, (int, float))
    assert isinstance(ham_prob, (int, float))
    assert abs((spam_prob + ham_prob) - 100.0) < 0.2

    # 2. Risk score consistency
    risk_score = data["risk_score"]
    assert risk_score == round(spam_prob)
    if risk_score >= 70:
        assert data["risk_level"] == "high"
        assert data["risk_category"] == "High Risk"
    elif risk_score >= 30:
        assert data["risk_level"] == "medium"
        assert data["risk_category"] == "Medium Risk"
    else:
        assert data["risk_level"] == "low"
        assert data["risk_category"] == "Low Risk"

    # 3. Plain English verdict summary
    assert "verdict_summary" in data
    assert len(data["verdict_summary"]) > 10

    # 4. Chi-Square summary
    assert "chi2_summary" in data
    chi2_info = data["chi2_summary"]
    assert chi2_info.get("alpha_threshold") == 0.05
    assert "SelectKBest" in chi2_info.get("method", "")
    assert "distinction_note" in chi2_info
    assert "training" in chi2_info["distinction_note"].lower()

    # 5. Influential features with genuine statistics
    features = data.get("influential_features", [])
    assert len(features) > 0, "Expected influential features for email with strong vocabulary"

    for feat in features:
        assert "word" in feat
        assert "log_odds" in feat
        assert "impact_score" in feat

        # Chi-Square statistics
        if feat.get("chi2_score") is not None:
            assert isinstance(feat["chi2_score"], (int, float))
            assert feat["chi2_score"] >= 0

        if feat.get("p_value") is not None:
            assert isinstance(feat["p_value"], (int, float))
            assert 0.0 <= feat["p_value"] <= 1.0
            assert "p_value_formatted" in feat
            assert "p" in feat["p_value_formatted"]
            assert feat["is_significant"] == (feat["p_value"] < 0.05)
            assert feat.get("significance_status") in ["Highly Significant", "Statistically Significant", "Not Statistically Significant", "Unavailable"]
            assert feat.get("class_association") in ["Spam-associated", "Ham-associated", "Neutral / Shared", "Unavailable"]

        # Training association, prediction contribution, interpretation
        assert "training_association" in feat
        assert "prediction_contribution" in feat
        assert "interpretation" in feat
        assert "log-odds" in feat["prediction_contribution"]

    # 6. Separate heuristic indicators
    warning_signs = data.get("warning_signs", [])
    assert isinstance(warning_signs, list)
    for ws in warning_signs:
        assert "title" in ws
        assert "detail" in ws


def test_phase03_ham_email_consistency(client):
    """
    Validates genuine probability and Chi-Square explainability on a legitimate Ham email.
    """
    token = generate_auth_token("usr_ham_eval", "hameval@mailguard.local")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "subject": "Team Sync: Weekly status and code review agenda",
        "body": "Hi team, please find attached the draft agenda for our weekly sprint sync. Looking forward to reviewing the pull request together.",
        "record_history": False
    }

    res = client.post(
        "/api/predict",
        headers=headers,
        data=json.dumps(payload),
        content_type="application/json"
    )
    assert res.status_code == 200
    data = res.get_json()

    assert data["predicted_class"] == "ham"
    assert data["ham_probability"] > data["spam_probability"]
    assert data["risk_score"] < 40
    assert data["risk_level"] in ["low", "medium"]

    # Verify no fabricated per-email aggregate p-value
    assert "email_p_value" not in data, "Must not compute an arbitrary per-email aggregate p-value"


def test_feature_statistics_exact_parity_scanner_and_inbox(client):
    """
    Verifies that Scanner and Inbox display 100% identical Chi-Square statistics,
    training p-values, significance status, class associations, and prediction contributions
    for the exact same email message content.
    """
    sender_token = generate_auth_token("usr_sender_p3", "senderp3@mailguard.local")
    recip_token = generate_auth_token("usr_recip_p3", "recipp3@mailguard.local")

    # Register recipient user in DB so mailbox delivery succeeds
    from services.db import save_user
    try:
        save_user(
            user_id="usr_recip_p3",
            name="Recipient P3",
            email="recipp3@mailguard.local",
            password_hash="testhash123",
            salt="testsalt"
        )
    except Exception:
        pass

    subject = "Claim your cash prize now"
    body = "Congratulations, you won a free lottery prize. Click to claim your reward immediately."

    # 1. Scanner Analysis via /api/predict
    scanner_res = client.post(
        "/api/predict",
        headers={"Authorization": f"Bearer {sender_token}"},
        data=json.dumps({"subject": subject, "body": body, "record_history": False}),
        content_type="application/json"
    )
    assert scanner_res.status_code == 200
    scanner_data = scanner_res.get_json()
    scanner_features = {f["word"]: f for f in scanner_data.get("influential_features", [])}

    # 2. Inbox Delivery via /api/mailbox/send
    send_res = client.post(
        "/api/mailbox/send",
        headers={"Authorization": f"Bearer {sender_token}"},
        data=json.dumps({
            "recipient_email": "recipp3@mailguard.local",
            "subject": subject,
            "body": body
        }),
        content_type="application/json"
    )
    assert send_res.status_code == 201

    # 3. Recipient retrieves message from /api/mailbox/spam or /api/mailbox/inbox
    folder_url = "/api/mailbox/spam" if scanner_data["predicted_class"] == "spam" else "/api/mailbox/inbox"
    inbox_res = client.get(
        folder_url,
        headers={"Authorization": f"Bearer {recip_token}"}
    )
    assert inbox_res.status_code == 200
    inbox_data = inbox_res.get_json()
    assert inbox_data["count"] > 0

    target_mail = None
    for m in inbox_data["messages"]:
        if m["subject"] == subject:
            target_mail = m
            break
    assert target_mail is not None, "Sent message must be delivered to recipient mailbox"

    inbox_features = {
        (ind.get("token") or ind.get("word")): ind
        for ind in target_mail.get("topIndicators", [])
    }

    # 4. Compare feature statistics between Scanner and Inbox
    overlapping_words = [w for w in ["prize", "claim", "free"] if w in scanner_features]
    assert len(overlapping_words) > 0, "Expected at least one primary indicator in test email"

    for word in overlapping_words:
        assert word in inbox_features, f"Feature '{word}' present in Scanner must also be present in Inbox"
        s_feat = scanner_features[word]
        i_feat = inbox_features[word]

        # Verify numerical Chi-Square statistic parity
        s_chi2 = s_feat.get("chi2_score") or s_feat.get("chi2Score")
        i_chi2 = i_feat.get("chi2_score") or i_feat.get("chi2Score")
        assert s_chi2 is not None and i_chi2 is not None
        assert abs(s_chi2 - i_chi2) < 0.01, f"Chi2 score mismatch for '{word}': Scanner={s_chi2}, Inbox={i_chi2}"

        # Verify training p-value parity
        s_pval = s_feat.get("p_value") or s_feat.get("pValue")
        i_pval = i_feat.get("p_value") or i_feat.get("pValue")
        assert s_pval is not None and i_pval is not None
        assert abs(s_pval - i_pval) < 0.001

        # Verify significance status parity
        s_sig = s_feat.get("significance_status") or s_feat.get("significanceStatus")
        i_sig = i_feat.get("significance_status") or i_feat.get("significanceStatus")
        assert s_sig == i_sig
        assert s_sig in ["Highly Significant", "Statistically Significant", "Not Statistically Significant"]

        # Verify class association parity
        s_assoc = s_feat.get("class_association") or s_feat.get("classAssociation")
        i_assoc = i_feat.get("class_association") or i_feat.get("classAssociation")
        assert s_assoc == i_assoc

        # Verify prediction contribution direction parity
        s_contrib = s_feat.get("prediction_contribution") or s_feat.get("predictionContribution")
        i_contrib = i_feat.get("prediction_contribution") or i_feat.get("predictionContribution")
        assert s_contrib == i_contrib

    # Verify chi2Summary present in inbox email
    assert target_mail.get("chi2Summary") is not None
    assert target_mail["chi2Summary"].get("alpha_threshold") == 0.05


def test_feature_statistics_lookup_endpoint(client):
    """
    Tests the standalone feature statistics endpoint for:
    - Selected vocabulary features (e.g. prize, claim)
    - Non-selected candidate features (e.g. lottery)
    - Out-of-vocabulary terms (e.g. unknown term)
    """
    # 1. Selected feature: prize
    res_prize = client.get("/api/features/statistics/prize")
    assert res_prize.status_code == 200
    feat_prize = res_prize.get_json()["feature"]
    assert feat_prize["in_vocabulary"] is True
    assert feat_prize["in_selected"] is True
    assert feat_prize["selection_status"] == "Selected Feature"
    assert feat_prize["chi2_score"] == 15.45
    assert feat_prize["p_value_formatted"] == "p < 0.001"
    assert feat_prize["significance_status"] == "Highly Significant"
    assert feat_prize["class_association"] == "Spam-associated"

    # 2. Selected feature: claim
    res_claim = client.get("/api/features/statistics/claim")
    assert res_claim.status_code == 200
    feat_claim = res_claim.get_json()["feature"]
    assert feat_claim["chi2_score"] == 17.39
    assert feat_claim["p_value_formatted"] == "p < 0.001"
    assert feat_claim["significance_status"] == "Highly Significant"
    assert feat_claim["class_association"] == "Spam-associated"

    # 3. Non-selected candidate feature: lottery
    res_lottery = client.get("/api/features/statistics/lottery")
    assert res_lottery.status_code == 200
    feat_lottery = res_lottery.get_json()["feature"]
    assert feat_lottery["in_vocabulary"] is True
    assert feat_lottery["in_selected"] is False
    assert feat_lottery["selection_status"] == "Not in selected features"
    assert feat_lottery["chi2_score"] == 5.10
    assert feat_lottery["significance_status"] == "Statistically Significant"
    assert feat_lottery["class_association"] == "Unavailable"

    # 4. Out of vocabulary: nonexistentword
    res_oov = client.get("/api/features/statistics/nonexistentwordxyz123")
    assert res_oov.status_code == 200
    feat_oov = res_oov.get_json()["feature"]
    assert feat_oov["in_vocabulary"] is False
    assert feat_oov["chi2_score"] is None
    assert feat_oov["p_value"] is None
    assert feat_oov["significance_status"] == "Unavailable"
    assert feat_oov["class_association"] == "Unavailable"
    assert feat_oov["selection_status"] == "Unavailable"


def test_older_inbox_record_enrichment(client):
    """
    Tests that an older saved mailbox record missing Chi-Square statistics or chi2Summary
    is safely enriched on the fly without changing subject, body, sender, recipient, or spam status.
    """
    token = generate_auth_token("usr_legacy_eval", "legacyeval@mailguard.local")
    from services.db import save_mailbox_message, get_spam_messages

    legacy_analysis = json.dumps({
        "verdict": "SPAM",
        "verdict_title": "Spam Detected",
        "explanation": "Legacy scan record",
        "top_indicators": [
            {"token": "prize", "logOdds": 0.51, "impact": "spam"},
            {"token": "claim", "logOdds": 0.46, "impact": "spam"}
        ]
        # No chi2_summary and no chi2Score in indicators
    })

    mail_id = "mail_legacy_test_001"
    save_mailbox_message(
        mail_id=mail_id,
        sender_id="usr_legacy_sender",
        sender_email="legacysender@mailguard.local",
        sender_name="Legacy Sender",
        recipient_email="legacyeval@mailguard.local",
        recipient_name="Legacy Recipient",
        subject="You won a prize",
        body="Claim your free prize immediately by clicking the link.",
        is_spam=True,
        predicted_class="spam",
        confidence=85.0,
        risk_score=85,
        risk_level="high",
        spam_probability=85.0,
        ham_probability=15.0,
        analysis_json=legacy_analysis
    )

    # Fetch mailbox via authenticated API
    res = client.get("/api/mailbox/spam", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    messages = res.get_json()["messages"]
    target = next((m for m in messages if m["id"] == mail_id), None)
    assert target is not None

    # Check preserved metadata
    assert target["subject"] == "You won a prize"
    assert target["fromEmail"] == "legacysender@mailguard.local"
    assert target["toEmail"] == "legacyeval@mailguard.local"
    assert target["isSpam"] is True

    # Check enriched Chi-Square statistics
    assert target.get("chi2Summary") is not None
    assert target["chi2Summary"]["alpha_threshold"] == 0.05
    assert len(target.get("topIndicators", [])) > 0

    prize_ind = next((ind for ind in target["topIndicators"] if (ind.get("token") or ind.get("word")) == "prize"), None)
    assert prize_ind is not None
    assert (prize_ind.get("chi2Score") or prize_ind.get("chi2_score")) == 15.45
    assert (prize_ind.get("significanceStatus") or prize_ind.get("significance_status")) == "Highly Significant"


def test_malformed_and_empty_scanner_input(client):
    """
    Tests edge cases: empty strings, pure punctuation, numbers, and malformed inputs.
    """
    token = generate_auth_token("usr_edge", "edge@mailguard.local")
    headers = {"Authorization": f"Bearer {token}"}

    # Empty payload
    res_empty = client.post("/api/predict", headers=headers, json={"subject": "", "body": ""})
    assert res_empty.status_code == 400

    # Only punctuation and whitespace
    res_punct = client.post("/api/predict", headers=headers, json={"subject": "... ! ??", "body": "--- /// $$$"})
    assert res_punct.status_code == 200
    data_punct = res_punct.get_json()
    assert abs(data_punct["spam_probability"] + data_punct["ham_probability"] - 100.0) < 0.2
    assert data_punct["predicted_class"] in ["ham", "spam"]

