"""
Tests for Backend Authorization and Account Isolation.
Verifies:
1. Cryptographic token generation, verification, and tamper detection.
2. Endpoint authorization on scan records, history, and PDF reports.
3. Rejection of untrusted client-supplied headers (e.g. X-User-Email).
4. Prevention of cross-user record retrieval, report download, or deletion.
"""
import pytest
import json
from app import create_app
from services.auth_helper import generate_auth_token, verify_auth_token
from services.db import save_prediction, get_prediction_by_id, clear_prediction_history


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_token_cryptographic_verification():
    """Verifies that tokens signed with SECRET_KEY verify and tampered tokens fail."""
    token = generate_auth_token(user_id="usr_alice_123", email="alice@security.org")
    assert token is not None
    assert len(token) > 20

    data = verify_auth_token(token)
    assert data is not None
    assert data["user_id"] == "usr_alice_123"
    assert data["email"] == "alice@security.org"

    # Tampered token must fail verification
    tampered = token[:-4] + "xyz9"
    assert verify_auth_token(tampered) is None
    assert verify_auth_token("") is None
    assert verify_auth_token("not-a-token") is None


def test_auth_session_endpoint(client):
    """Verifies /api/auth/session issuance and /api/auth/me verification."""
    # Valid session issuance
    res = client.post(
        "/api/auth/session",
        data=json.dumps({"user_id": "usr_bob_456", "email": "bob@security.org"}),
        content_type="application/json"
    )
    assert res.status_code == 200
    token = res.get_json()["token"]
    assert token is not None

    # Test /api/auth/me with Bearer token
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_res.status_code == 200
    me_data = me_res.get_json()
    assert me_data["authenticated"] is True
    assert me_data["user"]["user_id"] == "usr_bob_456"

    # Test /api/auth/me without token -> 401
    unauth_res = client.get("/api/auth/me")
    assert unauth_res.status_code == 401


def test_untrusted_client_header_not_trusted(client):
    """
    Verifies that client-supplied unverified identity headers (e.g. X-User-Email)
    are NOT trusted as proof of identity without cryptographic signature.
    """
    res = client.get(
        "/api/auth/me",
        headers={"X-User-Email": "victim@domain.com"}
    )
    assert res.status_code == 401


def test_prediction_scoping_and_cross_user_isolation(client):
    """
    Verifies that:
    1. Scans are attributed to the authenticated user.
    2. User B cannot access User A's scan details (403 Forbidden).
    3. User B cannot download User A's PDF scan report (403 Forbidden).
    4. User A deleting history does NOT delete User B's scan records.
    """
    token_a = generate_auth_token(user_id="usr_alice_111", email="alice@test.com")
    token_b = generate_auth_token(user_id="usr_bob_222", email="bob@test.com")

    # 1. User A scans an email
    scan_a = client.post(
        "/api/predict",
        data=json.dumps({
            "subject": "Confidential Security Audit for Alice",
            "body": "System routine quarterly maintenance schedule."
        }),
        content_type="application/json",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert scan_a.status_code == 200
    pred_a_id = scan_a.get_json()["prediction_id"]

    # 2. User B scans an email
    scan_b = client.post(
        "/api/predict",
        data=json.dumps({
            "subject": "Wire Transfer for Bob",
            "body": "URGENT: Claim $5,000,000 lottery cash prize immediately."
        }),
        content_type="application/json",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert scan_b.status_code == 200
    pred_b_id = scan_b.get_json()["prediction_id"]

    # 3. User A queries history -> sees User A's scan, but NOT User B's scan
    hist_a = client.get(
        "/api/predictions/history",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert hist_a.status_code == 200
    ids_a = [p["id"] for p in hist_a.get_json()["predictions"]]
    assert pred_a_id in ids_a
    assert pred_b_id not in ids_a

    # 4. User B queries history -> sees User B's scan, but NOT User A's scan
    hist_b = client.get(
        "/api/predictions/history",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert hist_b.status_code == 200
    ids_b = [p["id"] for p in hist_b.get_json()["predictions"]]
    assert pred_b_id in ids_b
    assert pred_a_id not in ids_b

    # 5. User B attempts to access User A's scan details -> 403 Forbidden
    cross_access_res = client.get(
        f"/api/predictions/{pred_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert cross_access_res.status_code == 403
    assert "Forbidden" in cross_access_res.get_json()["error"]

    # User A CAN access their own scan details
    own_access_res = client.get(
        f"/api/predictions/{pred_a_id}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert own_access_res.status_code == 200

    # 6. User B attempts to download User A's report by ID -> 403 Forbidden
    cross_report_res = client.get(
        f"/api/predict/report/{pred_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert cross_report_res.status_code == 403

    # User A CAN download their own report
    own_report_res = client.get(
        f"/api/predict/report/{pred_a_id}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert own_report_res.status_code == 200
    assert own_report_res.mimetype == "application/pdf"

    # 7. Scoped deletion: User A clears history -> ONLY User A's records are deleted
    del_res = client.delete(
        "/api/predictions/history",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert del_res.status_code == 200

    # User A now has 0 records in history
    hist_a_after = client.get(
        "/api/predictions/history",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    ids_a_after = [p["id"] for p in hist_a_after.get_json()["predictions"]]
    assert pred_a_id not in ids_a_after

    # User B's record is STILL PRESENT and completely preserved
    hist_b_after = client.get(
        "/api/predictions/history",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    ids_b_after = [p["id"] for p in hist_b_after.get_json()["predictions"]]
    assert pred_b_id in ids_b_after
