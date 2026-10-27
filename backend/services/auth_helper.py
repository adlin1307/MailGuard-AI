"""
Authentication & Authorization Helper for ProbMail Backend.
Provides cryptographic token generation and verification using itsdangerous with SECRET_KEY.
Ensures backend authorization cannot be bypassed by unverified client headers.
"""
from typing import Optional, Dict, Any
from flask import request
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from config import SECRET_KEY

AUTH_SALT = "probmail-auth-session-v1"
AUTH_MAX_AGE = 7 * 24 * 3600  # 7 days

_serializer = URLSafeTimedSerializer(SECRET_KEY)


def generate_auth_token(user_id: str, email: str) -> str:
    """Generates a cryptographically signed, timestamped token for an authenticated user."""
    payload = {
        "user_id": str(user_id).strip(),
        "email": str(email).strip().lower()
    }
    return _serializer.dumps(payload, salt=AUTH_SALT)


def verify_auth_token(token: str) -> Optional[Dict[str, str]]:
    """
    Verifies the cryptographic signature and expiration of an auth token.
    Returns payload dict if valid, or None if invalid, tampered, or expired.
    """
    if not token or not isinstance(token, str):
        return None
    try:
        data = _serializer.loads(token.strip(), salt=AUTH_SALT, max_age=AUTH_MAX_AGE)
        if isinstance(data, dict) and "user_id" in data:
            return data
        return None
    except (BadSignature, SignatureExpired, Exception):
        return None


def get_authenticated_user() -> Optional[Dict[str, str]]:
    """
    Extracts and cryptographically verifies the authenticated user from the request.
    Inspects:
      1. 'Authorization: Bearer <token>' header
      2. 'X-ProbMail-Token: <token>' header
    Does NOT trust raw unauthenticated email headers (e.g. X-User-Email or query params).
    Returns dict with user_id and email if verified, or None if unauthenticated.
    """
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif request.headers.get("X-ProbMail-Token"):
        token = request.headers.get("X-ProbMail-Token").strip()

    if not token:
        token = request.args.get("token")
    if not token and request.is_json:
        data = request.get_json(silent=True) or {}
        token = data.get("token")

    if not token:
        return None

    return verify_auth_token(token)
