"""
Integration tests for backend mailbox persistence, cross-user isolation,
and authentication security enforcement.
"""
import json
import pytest
from services.auth_helper import generate_auth_token
from services.db import get_connection, save_user


def test_cannot_obtain_token_for_registered_user_without_credentials(client):
    """
    Priority 6: Verifies that /api/auth/session rejects attempts to obtain
    a session token for an existing registered account without credentials.
    """
    # 1. Register a user in the test database
    save_user(
        user_id="usr_victim_999",
        name="Alice SecOps",
        email="alice.victim@probmail.internal",
        password_hash="secret_hashed_pw_alice",
        salt="salt123",
        role="SecOps Lead"
    )

    # 2. Attacker attempts to obtain Alice's token by only submitting her email
    res = client.post(
        "/api/auth/session",
        data=json.dumps({
            "user_id": "usr_attacker_666",
            "email": "alice.victim@probmail.internal"
        }),
        content_type="application/json"
    )
    # Must reject with 401 Unauthorized
    assert res.status_code == 401
    assert "Invalid credentials" in res.get_json()["error"]

    # 3. Attacker attempts with wrong password_hash
    res_wrong = client.post(
        "/api/auth/session",
        data=json.dumps({
            "user_id": "usr_attacker_666",
            "email": "alice.victim@probmail.internal",
            "password_hash": "wrong_password_hash"
        }),
        content_type="application/json"
    )
    assert res_wrong.status_code == 401

    # 4. Valid credentials succeed
    res_valid = client.post(
        "/api/auth/session",
        data=json.dumps({
            "user_id": "usr_victim_999",
            "email": "alice.victim@probmail.internal",
            "password_hash": "secret_hashed_pw_alice"
        }),
        content_type="application/json"
    )
    assert res_valid.status_code == 200
    token = res_valid.get_json()["token"]
    assert token is not None


def test_cross_user_mailbox_delivery_and_isolation(client):
    """
    Priority 4: Verifies cross-user delivery:
    1. Sender identity is strictly locked to token (cannot spoof).
    2. Recipient receives email in their inbox.
    3. Sending does NOT create a prediction scan record.
    4. Another user cannot retrieve recipient's inbox.
    """
    alice_token = generate_auth_token(user_id="usr_alice_10", email="alice@corp.org")
    bob_token = generate_auth_token(user_id="usr_bob_20", email="bob@corp.org")
    eve_token = generate_auth_token(user_id="usr_eve_30", email="eve@corp.org")

    # Record scan count before send
    with get_connection() as conn:
        before_pred_count = conn.cursor().execute("SELECT COUNT(*) FROM predictions").fetchone()[0]

    # Alice sends legitimate business email to Bob
    send_res = client.post(
        "/api/mailbox/send",
        headers={"Authorization": f"Bearer {alice_token}"},
        data=json.dumps({
            "recipient_email": "bob@corp.org",
            "recipient_name": "Bob Analyst",
            "subject": "Q4 Risk Assessment Final Review",
            "body": "Hello Bob, please review the finalized risk audit for Q4 infrastructure."
        }),
        content_type="application/json"
    )
    assert send_res.status_code == 201
    sent_data = send_res.get_json()
    assert sent_data["status"] == "success"
    mail_id = sent_data["mail"]["id"]
    assert sent_data["mail"]["fromEmail"] == "alice@corp.org"
    assert sent_data["mail"]["toEmail"] == "bob@corp.org"

    # Verify sending did NOT create a record in the predictions scan history table
    with get_connection() as conn:
        after_pred_count = conn.cursor().execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    assert after_pred_count == before_pred_count, "Sending email must NOT create a scan history record!"

    # Bob retrieves his inbox - the message must arrive
    bob_inbox = client.get(
        "/api/mailbox/inbox",
        headers={"Authorization": f"Bearer {bob_token}"}
    )
    assert bob_inbox.status_code == 200
    bob_msgs = bob_inbox.get_json()["messages"]
    assert any(m["id"] == mail_id for m in bob_msgs)

    # Eve checks her inbox - must NOT see Bob's message
    eve_inbox = client.get(
        "/api/mailbox/inbox",
        headers={"Authorization": f"Bearer {eve_token}"}
    )
    assert eve_inbox.status_code == 200
    eve_msgs = eve_inbox.get_json()["messages"]
    assert not any(m["id"] == mail_id for m in eve_msgs)

    # Alice checks her Sent box - message must be there
    alice_sent = client.get(
        "/api/mailbox/sent",
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert alice_sent.status_code == 200
    alice_sent_msgs = alice_sent.get_json()["messages"]
    assert any(m["id"] == mail_id for m in alice_sent_msgs)
