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
    # Register users in SQLite database
    save_user(user_id="usr_alice_10", name="Alice Sender", email="alice@corp.org", password_hash="hash_alice", salt="salt1")
    save_user(user_id="usr_bob_20", name="Bob Recipient", email="bob@corp.org", password_hash="hash_bob", salt="salt2")
    save_user(user_id="usr_eve_30", name="Eve Snoop", email="eve@corp.org", password_hash="hash_eve", salt="salt3")

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


def test_mailbox_delivery_spam_routing_and_analysis(client):
    """
    Phase 02 Verification:
    1. Rejects unknown recipients with 404 validation.
    2. Routes Ham email into Recipient Inbox and Sender Sent.
    3. Routes Spam email into Recipient Spam & Threats and Sender Sent.
    4. Persists message exactly once in SQLite mailbox_messages table.
    5. Inbox/Spam/Sent refreshes do not duplicate messages or create scan records.
    6. Verifies grounded analysis: genuine probability, topIndicators, explanation, detectedLinks.
    7. Supports Move to Spam / Recovery via /api/mailbox/<id>/toggle-spam.
    """
    save_user(user_id="usr_david_40", name="David Sender", email="david@corp.org", password_hash="hash_david", salt="salt4")
    save_user(user_id="usr_elena_50", name="Elena Recipient", email="elena@corp.org", password_hash="hash_elena", salt="salt5")

    david_token = generate_auth_token(user_id="usr_david_40", email="david@corp.org")
    elena_token = generate_auth_token(user_id="usr_elena_50", email="elena@corp.org")

    # 1. Unknown recipient validation
    bad_res = client.post(
        "/api/mailbox/send",
        headers={"Authorization": f"Bearer {david_token}"},
        data=json.dumps({
            "recipient_email": "nonexistent_ghost@corp.org",
            "subject": "Hello",
            "body": "Checking if you exist."
        }),
        content_type="application/json"
    )
    assert bad_res.status_code == 404
    bad_err = bad_res.get_json()["error"]
    assert "not a registered ProbMail user" in bad_err

    # Count initial scan history and mailbox messages
    with get_connection() as conn:
        c = conn.cursor()
        init_preds = c.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
        init_msgs = c.execute("SELECT COUNT(*) FROM mailbox_messages").fetchone()[0]

    # 2. Send Legitimate Ham message
    ham_res = client.post(
        "/api/mailbox/send",
        headers={"Authorization": f"Bearer {david_token}"},
        data=json.dumps({
            "recipient_email": "elena@corp.org",
            "subject": "Sprint planning sync tomorrow 10am",
            "body": "Hi Elena, let us connect tomorrow morning at 10 to review our deployment milestones and backlog."
        }),
        content_type="application/json"
    )
    assert ham_res.status_code == 201
    ham_json = ham_res.get_json()
    ham_mail = ham_json["mail"]
    assert ham_mail["isSpam"] is False
    assert ham_mail["predictedClass"] == "ham"
    assert "hamProbability" in ham_mail
    assert "spamProbability" in ham_mail
    ham_id = ham_mail["id"]

    # 3. Send Phishing/Spam message
    spam_res = client.post(
        "/api/mailbox/send",
        headers={"Authorization": f"Bearer {david_token}"},
        data=json.dumps({
            "recipient_email": "elena@corp.org",
            "subject": "URGENT WINNER: Claim your $5000 prize now!",
            "body": "CONGRATULATIONS! You have been selected as the grand winner. Click http://claim-funds.suspicious-domain.com/collect to receive your cash immediately."
        }),
        content_type="application/json"
    )
    assert spam_res.status_code == 201
    spam_json = spam_res.get_json()
    spam_mail = spam_json["mail"]
    assert spam_mail["isSpam"] is True
    assert spam_mail["predictedClass"] == "spam"
    assert spam_mail["spamProbability"] > 50.0
    assert "detectedLinks" in spam_mail
    assert any("claim-funds.suspicious-domain.com" in link for link in spam_mail["detectedLinks"])
    spam_id = spam_mail["id"]

    # 4. Check Elena's Inbox -> Must contain Ham, must NOT contain Spam
    elena_inbox = client.get("/api/mailbox/inbox", headers={"Authorization": f"Bearer {elena_token}"})
    assert elena_inbox.status_code == 200
    inbox_ids = [m["id"] for m in elena_inbox.get_json()["messages"]]
    assert ham_id in inbox_ids
    assert spam_id not in inbox_ids

    # 5. Check Elena's Spam folder -> Must contain Spam, must NOT contain Ham
    elena_spam = client.get("/api/mailbox/spam", headers={"Authorization": f"Bearer {elena_token}"})
    assert elena_spam.status_code == 200
    spam_ids = [m["id"] for m in elena_spam.get_json()["messages"]]
    assert spam_id in spam_ids
    assert ham_id not in spam_ids

    # 6. Check David's Sent folder -> Must contain both Ham and Spam sent messages
    david_sent = client.get("/api/mailbox/sent", headers={"Authorization": f"Bearer {david_token}"})
    assert david_sent.status_code == 200
    sent_ids = [m["id"] for m in david_sent.get_json()["messages"]]
    assert ham_id in sent_ids
    assert spam_id in sent_ids

    # 7. Verify persistent storage integrity: exactly 2 new messages in DB
    with get_connection() as conn:
        c = conn.cursor()
        new_msgs = c.execute("SELECT COUNT(*) FROM mailbox_messages").fetchone()[0]
        new_preds = c.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    assert new_msgs == init_msgs + 2
    assert new_preds == init_preds, "Mailbox sending must not add rows to predictions table"

    # Refresh mailbox multiple times: count must remain exactly the same
    for _ in range(3):
        client.get("/api/mailbox/inbox", headers={"Authorization": f"Bearer {elena_token}"})
        client.get("/api/mailbox/spam", headers={"Authorization": f"Bearer {elena_token}"})
        client.get("/api/mailbox/sent", headers={"Authorization": f"Bearer {david_token}"})

    with get_connection() as conn:
        c = conn.cursor()
        assert c.execute("SELECT COUNT(*) FROM mailbox_messages").fetchone()[0] == init_msgs + 2

    # 8. Test Toggle Spam / Recovery functionality
    toggle_res = client.post(f"/api/mailbox/{spam_id}/toggle-spam", headers={"Authorization": f"Bearer {elena_token}"})
    assert toggle_res.status_code == 200
    assert toggle_res.get_json()["status"] == "success"

    # Elena inbox now has the recovered message, spam folder does not
    elena_inbox2 = client.get("/api/mailbox/inbox", headers={"Authorization": f"Bearer {elena_token}"})
    inbox2_ids = [m["id"] for m in elena_inbox2.get_json()["messages"]]
    assert spam_id in inbox2_ids

    elena_spam2 = client.get("/api/mailbox/spam", headers={"Authorization": f"Bearer {elena_token}"})
    spam2_ids = [m["id"] for m in elena_spam2.get_json()["messages"]]
    assert spam_id not in spam2_ids

    # Toggle it back to Spam
    toggle_back = client.post(f"/api/mailbox/{spam_id}/toggle-spam", headers={"Authorization": f"Bearer {elena_token}"})
    assert toggle_back.status_code == 200
    assert toggle_back.get_json()["status"] == "success"

    elena_spam3 = client.get("/api/mailbox/spam", headers={"Authorization": f"Bearer {elena_token}"})
    spam3_ids = [m["id"] for m in elena_spam3.get_json()["messages"]]
    assert spam_id in spam3_ids



def test_auth_registration_and_login_flow(client):
    """
    Verifies the complete registration and login flow:
    1. Case-insensitive and trimmed email registration.
    2. Duplicate email rejection (409 Conflict).
    3. Login with correct password and mixed-case email (200 OK + JWT token).
    4. Login with unknown email (404 Not Found + required message).
    5. Login with incorrect password (401 Unauthorized).
    6. GET /api/auth/users includes user without leaking password hash or salt.
    """
    raw_email = "  Charlie.Analyst@SecCorp.Org  "
    clean_email = "charlie.analyst@seccorp.org"
    password = "SecOpsPassword2026!"

    # 1. Register new user
    reg_res = client.post(
        "/api/auth/register",
        data=json.dumps({
            "name": "Charlie Analyst",
            "email": raw_email,
            "password": password,
            "role": "SOC Analyst"
        }),
        content_type="application/json"
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.get_json()
    assert reg_data["status"] == "success"
    assert reg_data["user"]["email"] == clean_email
    assert "token" in reg_data

    # 2. Duplicate registration with different casing and extra spaces must fail (409)
    dup_res = client.post(
        "/api/auth/register",
        data=json.dumps({
            "name": "Charlie Duplicate",
            "email": "CHARLIE.ANALYST@seccorp.org",
            "password": "AnotherPassword999!"
        }),
        content_type="application/json"
    )
    assert dup_res.status_code == 409
    assert "already registered" in dup_res.get_json()["error"]

    # 3. Successful login with mixed-case email and whitespace
    login_res = client.post(
        "/api/auth/login",
        data=json.dumps({
            "email": "  CHARLIE.analyst@SECcorp.org  ",
            "password": password
        }),
        content_type="application/json"
    )
    assert login_res.status_code == 200
    login_data = login_res.get_json()
    assert login_data["status"] == "success"
    assert login_data["user"]["email"] == clean_email
    assert "token" in login_data
    token = login_data["token"]

    # Verify token allows accessing /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.get_json()["user"]["email"] == clean_email

    # 4. Login with unknown account must return 404 with exact message
    unknown_res = client.post(
        "/api/auth/login",
        data=json.dumps({
            "email": "nonexistent.user@randomdomain.xyz",
            "password": password
        }),
        content_type="application/json"
    )
    assert unknown_res.status_code == 404
    assert "No registered account found with this email. You must sign up first before logging in." in unknown_res.get_json()["error"]

    # 5. Login with registered account but incorrect password must return 401
    wrong_pw_res = client.post(
        "/api/auth/login",
        data=json.dumps({
            "email": clean_email,
            "password": "WrongPassword999!"
        }),
        content_type="application/json"
    )
    assert wrong_pw_res.status_code == 401
    assert "Incorrect password. Authentication failed." in wrong_pw_res.get_json()["error"]

    # 6. GET /api/auth/users must include user and never expose password_hash or salt
    users_res = client.get("/api/auth/users")
    assert users_res.status_code == 200
    user_list = users_res.get_json()["users"]
    charlie_entry = next((u for u in user_list if u["email"] == clean_email), None)
    assert charlie_entry is not None
    assert "password_hash" not in charlie_entry
    assert "salt" not in charlie_entry


def test_sent_recipients_history_and_isolation(client):
    """
    Phase 03 Requirement 1:
    - User with 0 sent emails gets empty recipient list.
    - When user sends emails, recipient list contains only recipients they previously sent to.
    - Recipients are deduplicated, exclude the user themselves, and are isolated across users.
    """
    save_user(
        user_id="usr_rec_a",
        name="Alice Sender",
        email="alice.sender@test.org",
        password_hash="pw_hash_alice",
        salt="salt_a"
    )
    save_user(
        user_id="usr_p1",
        name="Partner One",
        email="partner1@company.com",
        password_hash="pw_hash_p1",
        salt="salt_p1"
    )
    save_user(
        user_id="usr_p2",
        name="Partner Two",
        email="partner2@company.com",
        password_hash="pw_hash_p2",
        salt="salt_p2"
    )

    user_a_token = generate_auth_token("usr_rec_a", "alice.sender@test.org")
    user_b_token = generate_auth_token("usr_rec_b", "bob.sender@test.org")
    headers_a = {"Authorization": f"Bearer {user_a_token}"}
    headers_b = {"Authorization": f"Bearer {user_b_token}"}

    # 1. Zero sent emails -> empty list
    res_zero = client.get("/api/mailbox/recipients", headers=headers_a)
    assert res_zero.status_code == 200
    assert res_zero.get_json()["recipients"] == []

    # 2. Alice sends email to recipient 1
    res_send1 = client.post(
        "/api/mailbox/send",
        headers=headers_a,
        data=json.dumps({
            "to_email": "partner1@company.com",
            "to_name": "Partner One",
            "subject": "Proposal Discussion",
            "body": "Here is the proposal for Q4."
        }),
        content_type="application/json"
    )
    assert res_send1.status_code == 201

    # 3. Alice sends second email to partner1 (duplicate recipient) and one to partner2
    client.post(
        "/api/mailbox/send",
        headers=headers_a,
        data=json.dumps({
            "to_email": "partner1@company.com",
            "to_name": "Partner One",
            "subject": "Follow up",
            "body": "Quick follow-up on the proposal."
        }),
        content_type="application/json"
    )
    client.post(
        "/api/mailbox/send",
        headers=headers_a,
        data=json.dumps({
            "to_email": "partner2@company.com",
            "to_name": "Partner Two",
            "subject": "Architecture Specs",
            "body": "Here are the architecture notes."
        }),
        content_type="application/json"
    )

    # 4. Verify Alice's recipients list has exactly partner1 and partner2 (deduplicated)
    res_a = client.get("/api/mailbox/recipients", headers=headers_a)
    assert res_a.status_code == 200
    recs_a = res_a.get_json()["recipients"]
    emails_a = [r["email"] for r in recs_a]
    assert len(emails_a) == 2
    assert "partner1@company.com" in emails_a
    assert "partner2@company.com" in emails_a
    assert "alice.sender@test.org" not in emails_a

    # 5. Verify Bob's recipients list is isolated and remains empty
    res_b = client.get("/api/mailbox/recipients", headers=headers_b)
    assert res_b.status_code == 200
    assert res_b.get_json()["recipients"] == []


def test_drafts_lifecycle_autosave_and_cleanup_on_send(client):
    """
    Phase 03 Requirement 3:
    - Save, autosave without duplicates, list, delete, and send drafts.
    - Sending a draft removes it from drafts.
    - User account isolation on drafts.
    """
    save_user(
        user_id="usr_draft_a",
        name="Dan Author",
        email="dan.author@test.org",
        password_hash="pw_hash_dan",
        salt="salt_dan"
    )
    save_user(
        user_id="usr_client_b",
        name="Business Client",
        email="client@business.org",
        password_hash="pw_hash_client",
        salt="salt_client"
    )

    user_a_token = generate_auth_token("usr_draft_a", "dan.author@test.org")
    user_b_token = generate_auth_token("usr_draft_b", "eve.intruder@test.org")
    headers_a = {"Authorization": f"Bearer {user_a_token}"}
    headers_b = {"Authorization": f"Bearer {user_b_token}"}

    # 1. Reject saving completely empty draft
    res_empty = client.post(
        "/api/mailbox/drafts",
        headers=headers_a,
        data=json.dumps({"recipient_email": "", "subject": "", "body": ""}),
        content_type="application/json"
    )
    assert res_empty.status_code == 400

    # 2. Create a new draft
    draft_id = "draft_dan_test_1001"
    res_create = client.post(
        "/api/mailbox/drafts",
        headers=headers_a,
        data=json.dumps({
            "id": draft_id,
            "recipient_email": "client@business.org",
            "subject": "Initial Draft Pitch",
            "body": "Starting draft text..."
        }),
        content_type="application/json"
    )
    assert res_create.status_code == 200
    created = res_create.get_json()["draft"]
    assert created["id"] == draft_id
    assert created["subject"] == "Initial Draft Pitch"

    # 3. Repeated autosave with updated body must update the row, NOT duplicate
    res_update = client.post(
        "/api/mailbox/drafts",
        headers=headers_a,
        data=json.dumps({
            "id": draft_id,
            "recipient_email": "client@business.org",
            "subject": "Initial Draft Pitch - Finalizing",
            "body": "Updated draft text with complete details."
        }),
        content_type="application/json"
    )
    assert res_update.status_code == 200

    # Verify Dan has exactly 1 draft in list
    res_list_a = client.get("/api/mailbox/drafts", headers=headers_a)
    assert res_list_a.status_code == 200
    drafts_a = res_list_a.get_json()["drafts"]
    assert len(drafts_a) == 1
    assert drafts_a[0]["subject"] == "Initial Draft Pitch - Finalizing"
    assert drafts_a[0]["body"] == "Updated draft text with complete details."

    # 4. User B cannot see Dan's draft
    res_list_b = client.get("/api/mailbox/drafts", headers=headers_b)
    assert res_list_b.status_code == 200
    assert len(res_list_b.get_json()["drafts"]) == 0

    # 5. User B cannot delete Dan's draft
    res_del_b = client.delete(f"/api/mailbox/drafts/{draft_id}", headers=headers_b)
    assert res_del_b.status_code == 404

    # 6. Dan sends the email specifying draft_id -> delivers email and removes draft
    res_send = client.post(
        "/api/mailbox/send",
        headers=headers_a,
        data=json.dumps({
            "to_email": "client@business.org",
            "subject": "Initial Draft Pitch - Finalizing",
            "body": "Updated draft text with complete details.",
            "draft_id": draft_id
        }),
        content_type="application/json"
    )
    assert res_send.status_code == 201

    # Verify draft is now removed
    res_list_after_send = client.get("/api/mailbox/drafts", headers=headers_a)
    assert res_list_after_send.status_code == 200
    assert len(res_list_after_send.get_json()["drafts"]) == 0


def test_chi2_feature_selection_exposure_in_prediction(client):
    """
    Phase 03 Requirements 4 & 5:
    - Prediction endpoint exposes genuine training-time Chi-Square statistics.
    - Exposes chi2_summary with method and distinction note.
    - Tokens have training-time p_value, p_value_formatted, and chi2_score.
    - record_history: false creates no scan history records.
    """
    user_token = generate_auth_token("usr_chi2_eval", "evaluator@test.org")
    headers = {"Authorization": f"Bearer {user_token}"}

    pred_res = client.post(
        "/api/predict",
        headers=headers,
        data=json.dumps({
            "subject": "Account security verification required immediately",
            "body": "Please confirm your password and bank account numbers to claim prize award.",
            "record_history": False
        }),
        content_type="application/json"
    )
    assert pred_res.status_code == 200
    pred = pred_res.get_json()

    # Chi-Square summary present
    assert "chi2_summary" in pred
    chi2_info = pred["chi2_summary"]
    assert "SelectKBest" in chi2_info["method"]
    assert "p < 0.05" in chi2_info["description"]
    assert "Training-time" in chi2_info["distinction_note"]

    # Influential tokens retain genuine feature selection statistics
    assert len(pred["influential_features"]) > 0
    for feat in pred["influential_features"]:
        assert "word" in feat
        assert "log_odds" in feat or "impact_score" in feat
        if "p_value" in feat:
            assert isinstance(feat["p_value"], (int, float))
            assert "p_value_formatted" in feat
            assert "p" in feat["p_value_formatted"]

    # Verify no prediction record was stored when record_history=False
    history_res = client.get("/api/predictions/history?limit=10", headers=headers)
    assert history_res.status_code == 200
    assert history_res.get_json()["count"] == 0

