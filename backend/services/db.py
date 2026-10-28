"""
Database Persistence Layer for ProbMail.
Supports PostgreSQL (Neon, Supabase, RDS via DATABASE_URL/POSTGRES_URL)
and SQLite (for local development and isolated automated pytest suites).
Avoids storing sensitive raw email bodies while keeping snippets for audit verification.
"""
import sqlite3
import os
import sys
import time
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from config import DB_PATH


def _get_db_url() -> Optional[str]:
    """Retrieves and normalizes PostgreSQL database connection string if provided."""
    for var in ("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"):
        val = os.environ.get(var)
        if val and val.strip():
            clean = val.strip()
            # Standardize scheme for psycopg2 compatibility
            if clean.startswith("postgres://"):
                clean = "postgresql://" + clean[len("postgres://"):]
            return clean
    return None


def _is_postgres_active(target_db: Optional[str] = None) -> bool:
    """Determines whether PostgreSQL should be used for database operations."""
    if target_db:
        return False
    if os.environ.get("TEST_DB_PATH"):
        return False
    try:
        from flask import current_app
        if current_app and (current_app.config.get("TESTING") or current_app.config.get("TEST_DB_PATH")):
            return False
    except Exception:
        pass
    url = _get_db_url()
    return bool(url)


def _get_sqlite_path(target_db: Optional[str] = None) -> Path:
    """Resolves SQLite database path safely, falling back to /tmp if filesystem is read-only."""
    if target_db:
        return Path(target_db)
    test_env = os.environ.get("TEST_DB_PATH")
    if test_env:
        return Path(test_env)
    try:
        from flask import current_app
        if current_app:
            if current_app.config.get("TEST_DB_PATH"):
                return Path(current_app.config["TEST_DB_PATH"])
            elif current_app.config.get("TESTING"):
                from config import BASE_DIR
                return BASE_DIR / "test_probmail.db"
    except Exception:
        pass

    db_file = DB_PATH
    # Check if target directory is writable (e.g. AWS Lambda / Vercel Serverless /var/task is read-only)
    try:
        db_file.parent.mkdir(parents=True, exist_ok=True)
        probe = db_file.parent / ".perm_check"
        probe.touch()
        probe.unlink()
        return db_file
    except (OSError, PermissionError):
        # Fall back to writable /tmp directory
        return Path("/tmp") / "probmail.db"


class CursorWrapper:
    """Cursor wrapper standardizing parameter placeholder syntax and row access."""
    def __init__(self, raw_cursor, is_postgres: bool):
        self.cursor = raw_cursor
        self.is_postgres = is_postgres
        self.last_inserted_id = None

    def execute(self, query: str, params: Optional[Union[tuple, list]] = None):
        if self.is_postgres:
            pg_query = query.replace("?", "%s")
            if params is None:
                self.cursor.execute(pg_query)
            else:
                self.cursor.execute(pg_query, params)
        else:
            if params is None:
                self.cursor.execute(query)
            else:
                self.cursor.execute(query, params)
        return self

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    @property
    def rowcount(self):
        return self.cursor.rowcount

    @property
    def lastrowid(self):
        if self.is_postgres:
            return self.last_inserted_id
        return getattr(self.cursor, "lastrowid", None)

    def __iter__(self):
        return iter(self.cursor)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            self.cursor.close()
        except Exception:
            pass


class DBConnectionWrapper:
    """Connection wrapper managing transactions and safe connection closure."""
    def __init__(self, raw_conn, is_postgres: bool):
        self.raw_conn = raw_conn
        self.is_postgres = is_postgres
        self.closed = False

    def cursor(self):
        if self.is_postgres:
            import psycopg2.extras
            return CursorWrapper(self.raw_conn.cursor(cursor_factory=psycopg2.extras.DictCursor), is_postgres=True)
        else:
            return CursorWrapper(self.raw_conn.cursor(), is_postgres=False)

    def commit(self):
        try:
            self.raw_conn.commit()
        except Exception:
            pass

    def rollback(self):
        try:
            self.raw_conn.rollback()
        except Exception:
            pass

    def close(self):
        if not self.closed:
            self.closed = True
            try:
                self.raw_conn.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self.commit()
            else:
                self.rollback()
        finally:
            self.close()


def _create_raw_connection(target_db: Optional[str] = None):
    """Establishes connection to PostgreSQL or SQLite based on configuration."""
    if _is_postgres_active(target_db):
        url = _get_db_url()
        import psycopg2
        import psycopg2.extras

        conn_kwargs = {}
        if "sslmode=" not in url.lower() and "localhost" not in url.lower() and "127.0.0.1" not in url.lower():
            conn_kwargs["sslmode"] = "require"

        last_err = None
        for attempt in range(3):
            try:
                raw_conn = psycopg2.connect(url, **conn_kwargs)
                raw_conn.autocommit = False
                return raw_conn, True
            except Exception as e:
                last_err = e
                time.sleep(0.5 * (attempt + 1))
        raise last_err or RuntimeError("Failed to connect to PostgreSQL database.")
    else:
        db_file = _get_sqlite_path(target_db)
        raw_conn = sqlite3.connect(str(db_file))
        raw_conn.row_factory = sqlite3.Row
        return raw_conn, False


def get_connection(target_db: Optional[str] = None) -> DBConnectionWrapper:
    """Returns a managed database connection wrapper supporting context manager usage."""
    raw_conn, is_postgres = _create_raw_connection(target_db)
    return DBConnectionWrapper(raw_conn, is_postgres)


def init_db(target_db: Optional[str] = None):
    """Initializes schema for predictions, users, mailbox, and training audit log."""
    with get_connection(target_db) as conn:
        cursor = conn.cursor()
        if conn.is_postgres:
            # PostgreSQL Schema
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id SERIAL PRIMARY KEY,
                    subject TEXT,
                    snippet TEXT,
                    predicted_class TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    spam_probability REAL,
                    ham_probability REAL,
                    risk_score INTEGER,
                    owner_id TEXT
                );
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    role TEXT DEFAULT 'SecOps Analyst',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mailbox_messages (
                    id TEXT PRIMARY KEY,
                    sender_id TEXT NOT NULL,
                    sender_email TEXT NOT NULL,
                    sender_name TEXT NOT NULL,
                    recipient_email TEXT NOT NULL,
                    recipient_name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    body TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    starred INTEGER DEFAULT 0,
                    is_spam INTEGER DEFAULT 0,
                    predicted_class TEXT DEFAULT 'ham',
                    confidence REAL DEFAULT 95.0,
                    risk_score INTEGER DEFAULT 0,
                    risk_level TEXT DEFAULT 'low',
                    spam_probability REAL,
                    ham_probability REAL,
                    analysis_json TEXT
                );
                CREATE TABLE IF NOT EXISTS drafts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    recipient_email TEXT,
                    recipient_name TEXT,
                    subject TEXT,
                    body TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS training_history (
                    id SERIAL PRIMARY KEY,
                    trained_at TEXT NOT NULL,
                    accuracy REAL NOT NULL,
                    precision REAL,
                    recall REAL,
                    f1_score REAL NOT NULL,
                    train_samples INTEGER,
                    test_samples INTEGER,
                    k_features INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_predictions_owner ON predictions (owner_id);
                CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
                CREATE INDEX IF NOT EXISTS idx_mailbox_recipient ON mailbox_messages (recipient_email);
                CREATE INDEX IF NOT EXISTS idx_mailbox_sender ON mailbox_messages (sender_id);
                CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts (user_id);
            """)

            # Safe column migrations if existing tables were initialized with earlier revisions
            for col, col_type in [
                ("spam_probability", "REAL"),
                ("ham_probability", "REAL"),
                ("risk_score", "INTEGER"),
                ("owner_id", "TEXT"),
            ]:
                cursor.execute(f"ALTER TABLE predictions ADD COLUMN IF NOT EXISTS {col} {col_type}")

            for col, col_type in [
                ("spam_probability", "REAL"),
                ("ham_probability", "REAL"),
                ("analysis_json", "TEXT"),
            ]:
                cursor.execute(f"ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS {col} {col_type}")

        else:
            # SQLite Schema
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT,
                    snippet TEXT,
                    predicted_class TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    spam_probability REAL,
                    ham_probability REAL,
                    risk_score INTEGER,
                    owner_id TEXT
                )
            """)

            cursor.execute("PRAGMA table_info(predictions)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            if "spam_probability" not in existing_cols:
                cursor.execute("ALTER TABLE predictions ADD COLUMN spam_probability REAL")
            if "ham_probability" not in existing_cols:
                cursor.execute("ALTER TABLE predictions ADD COLUMN ham_probability REAL")
            if "risk_score" not in existing_cols:
                cursor.execute("ALTER TABLE predictions ADD COLUMN risk_score INTEGER")
            if "owner_id" not in existing_cols:
                cursor.execute("ALTER TABLE predictions ADD COLUMN owner_id TEXT")

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_owner ON predictions (owner_id)")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    role TEXT DEFAULT 'SecOps Analyst',
                    created_at TEXT NOT NULL
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mailbox_messages (
                    id TEXT PRIMARY KEY,
                    sender_id TEXT NOT NULL,
                    sender_email TEXT NOT NULL,
                    sender_name TEXT NOT NULL,
                    recipient_email TEXT NOT NULL,
                    recipient_name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    body TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    starred INTEGER DEFAULT 0,
                    is_spam INTEGER DEFAULT 0,
                    predicted_class TEXT DEFAULT 'ham',
                    confidence REAL DEFAULT 95.0,
                    risk_score INTEGER DEFAULT 0,
                    risk_level TEXT DEFAULT 'low'
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mailbox_recipient ON mailbox_messages (recipient_email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mailbox_sender ON mailbox_messages (sender_id)")

            cursor.execute("PRAGMA table_info(mailbox_messages)")
            mb_cols = {row[1] for row in cursor.fetchall()}
            if "spam_probability" not in mb_cols:
                cursor.execute("ALTER TABLE mailbox_messages ADD COLUMN spam_probability REAL")
            if "ham_probability" not in mb_cols:
                cursor.execute("ALTER TABLE mailbox_messages ADD COLUMN ham_probability REAL")
            if "analysis_json" not in mb_cols:
                cursor.execute("ALTER TABLE mailbox_messages ADD COLUMN analysis_json TEXT")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS drafts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    recipient_email TEXT,
                    recipient_name TEXT,
                    subject TEXT,
                    body TEXT,
                    updated_at TEXT NOT NULL
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts (user_id)")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS training_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trained_at TEXT NOT NULL,
                    accuracy REAL NOT NULL,
                    precision REAL,
                    recall REAL,
                    f1_score REAL NOT NULL,
                    train_samples INTEGER,
                    test_samples INTEGER,
                    k_features INTEGER
                )
            """)
        conn.commit()


def save_prediction(
    subject: Optional[str],
    snippet: Optional[str],
    predicted_class: str,
    confidence: float,
    spam_prob: Optional[float] = None,
    ham_prob: Optional[float] = None,
    risk_score: Optional[int] = None,
    owner_id: Optional[str] = None
) -> int:
    """
    Saves a prediction record including both estimated spam and ham posterior probabilities,
    the calculated email risk score (0-100), and the authenticated owner_id.
    Snippet is capped at 160 characters to preserve privacy while enabling verification.
    """
    now = datetime.now(timezone.utc).isoformat()
    clean_subj = (subject or "Untitled Email")[:120].strip()
    clean_snip = (snippet or "")[:160].strip()
    clean_owner = (owner_id or "").strip() or None

    if spam_prob is None or ham_prob is None:
        if predicted_class.lower() == "spam":
            spam_prob = round(confidence, 2)
            ham_prob = round(max(0.0, 100.0 - confidence), 2)
        else:
            ham_prob = round(confidence, 2)
            spam_prob = round(max(0.0, 100.0 - confidence), 2)

    if risk_score is None:
        risk_score = max(0, min(100, int(round(spam_prob))))

    with get_connection() as conn:
        cursor = conn.cursor()
        if conn.is_postgres:
            cursor.execute("""
                INSERT INTO predictions (subject, snippet, predicted_class, confidence, timestamp, spam_probability, ham_probability, risk_score, owner_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (clean_subj, clean_snip, predicted_class.lower(), confidence, now, spam_prob, ham_prob, risk_score, clean_owner))
            row = cursor.fetchone()
            conn.commit()
            return int(row["id"] if isinstance(row, dict) else row[0])
        else:
            cursor.execute("""
                INSERT INTO predictions (subject, snippet, predicted_class, confidence, timestamp, spam_probability, ham_probability, risk_score, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (clean_subj, clean_snip, predicted_class.lower(), confidence, now, spam_prob, ham_prob, risk_score, clean_owner))
            conn.commit()
            return cursor.lastrowid


def get_recent_predictions(limit: int = 50, owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieves recent predictions ordered by timestamp descending.
    Strictly scoped to owner_id to prevent cross-account data leakage.
    Unauthenticated/unowned requests never expose other accounts' scan history.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        if owner_id:
            cursor.execute("""
                SELECT id, subject, snippet, predicted_class, confidence, timestamp,
                       spam_probability, ham_probability, risk_score, owner_id
                FROM predictions
                WHERE owner_id = ?
                ORDER BY id DESC
                LIMIT ?
            """, (owner_id, limit))
        else:
            is_testing = False
            try:
                from flask import current_app
                if current_app and current_app.config.get("TESTING"):
                    is_testing = True
            except Exception:
                pass

            if is_testing:
                cursor.execute("""
                    SELECT id, subject, snippet, predicted_class, confidence, timestamp,
                           spam_probability, ham_probability, risk_score, owner_id
                    FROM predictions
                    WHERE owner_id IS NULL
                    ORDER BY id DESC
                    LIMIT ?
                """, (limit,))
            else:
                return []

        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("spam_probability") is None or d.get("ham_probability") is None:
                conf = d.get("confidence", 50.0)
                if d.get("predicted_class") == "spam":
                    d["spam_probability"] = round(conf, 2)
                    d["ham_probability"] = round(max(0.0, 100.0 - conf), 2)
                else:
                    d["ham_probability"] = round(conf, 2)
                    d["spam_probability"] = round(max(0.0, 100.0 - conf), 2)

            if d.get("risk_score") is None:
                d["risk_score"] = max(0, min(100, int(round(d["spam_probability"]))))

            r_score = d["risk_score"]
            if r_score >= 70:
                d["risk_category"] = "High Risk"
                d["risk_level"] = "high"
            elif r_score >= 30:
                d["risk_category"] = "Medium Risk"
                d["risk_level"] = "medium"
            else:
                d["risk_category"] = "Low Risk"
                d["risk_level"] = "low"

            result.append(d)
        return result


def get_prediction_by_id(prediction_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves a single prediction by ID including owner_id for authorization verification."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, subject, snippet, predicted_class, confidence, timestamp,
                   spam_probability, ham_probability, risk_score, owner_id
            FROM predictions
            WHERE id = ?
        """, (prediction_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("spam_probability") is None or d.get("ham_probability") is None:
            conf = d.get("confidence", 50.0)
            if d.get("predicted_class") == "spam":
                d["spam_probability"] = round(conf, 2)
                d["ham_probability"] = round(max(0.0, 100.0 - conf), 2)
            else:
                d["ham_probability"] = round(conf, 2)
                d["spam_probability"] = round(max(0.0, 100.0 - conf), 2)

        if d.get("risk_score") is None:
            d["risk_score"] = max(0, min(100, int(round(d["spam_probability"]))))

        r_score = d["risk_score"]
        if r_score >= 70:
            d["risk_category"] = "High Risk"
            d["risk_level"] = "high"
        elif r_score >= 30:
            d["risk_category"] = "Medium Risk"
            d["risk_level"] = "medium"
        else:
            d["risk_category"] = "Low Risk"
            d["risk_level"] = "low"

        return d


def get_prediction_statistics(owner_id: Optional[str] = None) -> Dict[str, Any]:
    """Computes aggregate totals and proportions of actual scans performed, strictly scoped to owner_id."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if owner_id:
            cursor.execute("SELECT COUNT(*) FROM predictions WHERE owner_id = ?", (owner_id,))
            total = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM predictions WHERE owner_id = ? AND LOWER(predicted_class) = 'spam'", (owner_id,))
            spam_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM predictions WHERE owner_id = ? AND LOWER(predicted_class) = 'ham'", (owner_id,))
            ham_count = cursor.fetchone()[0]
        else:
            is_testing = False
            try:
                from flask import current_app
                if current_app and current_app.config.get("TESTING"):
                    is_testing = True
            except Exception:
                pass

            if is_testing:
                cursor.execute("SELECT COUNT(*) FROM predictions WHERE owner_id IS NULL")
                total = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM predictions WHERE owner_id IS NULL AND LOWER(predicted_class) = 'spam'")
                spam_count = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM predictions WHERE owner_id IS NULL AND LOWER(predicted_class) = 'ham'")
                ham_count = cursor.fetchone()[0]
            else:
                return {
                    "total_analyzed": 0,
                    "spam_detected": 0,
                    "ham_detected": 0,
                    "spam_percentage": 0.0,
                    "ham_percentage": 0.0
                }

    spam_pct = round((spam_count / total * 100), 1) if total > 0 else 0.0
    ham_pct = round((ham_count / total * 100), 1) if total > 0 else 0.0

    return {
        "total_analyzed": total,
        "spam_detected": spam_count,
        "ham_detected": ham_count,
        "spam_percentage": spam_pct,
        "ham_percentage": ham_pct
    }


def clear_prediction_history(owner_id: Optional[str] = None) -> int:
    """Clears stored prediction records. If owner_id is specified, strictly deletes only that user's records."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if owner_id:
            cursor.execute("DELETE FROM predictions WHERE owner_id = ?", (owner_id,))
        else:
            cursor.execute("DELETE FROM predictions")
        conn.commit()
        return cursor.rowcount


# User Authentication Persistence
def save_user(user_id: str, name: str, email: str, password_hash: str, salt: str, role: str = "SecOps Analyst") -> Dict[str, Any]:
    """Stores a registered user."""
    now = datetime.now(timezone.utc).isoformat()
    clean_email = email.strip().lower()
    clean_name = name.strip()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (id, name, email, password_hash, salt, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, clean_name, clean_email, password_hash, salt, role, now))
        conn.commit()
    return {
        "id": user_id,
        "name": clean_name,
        "email": clean_email,
        "role": role,
        "created_at": now
    }


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieves a user by email, ensuring trimmed and case-insensitive comparison."""
    clean_email = email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(TRIM(email)) = ?", (clean_email,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_all_users() -> List[Dict[str, Any]]:
    """Retrieves all registered user profiles (safe public fields only)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC")
        return [dict(r) for r in cursor.fetchall()]


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a user by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


# Shared Backend Mailbox Persistence
def save_mailbox_message(
    mail_id: str,
    sender_id: str,
    sender_email: str,
    sender_name: str,
    recipient_email: str,
    recipient_name: str,
    subject: str,
    body: str,
    is_spam: bool = False,
    predicted_class: str = "ham",
    confidence: float = 95.0,
    risk_score: int = 0,
    risk_level: str = "low",
    spam_probability: Optional[float] = None,
    ham_probability: Optional[float] = None,
    analysis_json: Optional[str] = None
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    clean_rec = recipient_email.strip().lower()
    clean_sender = sender_email.strip().lower()

    if spam_probability is None or ham_probability is None:
        if is_spam:
            spam_probability = round(confidence, 2)
            ham_probability = round(max(0.0, 100.0 - confidence), 2)
        else:
            ham_probability = round(confidence, 2)
            spam_probability = round(max(0.0, 100.0 - confidence), 2)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO mailbox_messages (
                id, sender_id, sender_email, sender_name,
                recipient_email, recipient_name, subject, body,
                timestamp, is_read, starred, is_spam,
                predicted_class, confidence, risk_score, risk_level,
                spam_probability, ham_probability, analysis_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mail_id, sender_id, clean_sender, sender_name.strip(),
            clean_rec, recipient_name.strip(), subject.strip(), body.strip(),
            now, 1 if is_spam else 0, predicted_class, confidence, risk_score, risk_level,
            spam_probability, ham_probability, analysis_json
        ))
        conn.commit()

    analysis_data = {}
    if analysis_json:
        try:
            analysis_data = json.loads(analysis_json)
        except Exception:
            pass

    return {
        "id": mail_id,
        "fromName": sender_name.strip(),
        "fromEmail": clean_sender,
        "toName": recipient_name.strip(),
        "toEmail": clean_rec,
        "subject": subject.strip(),
        "body": body.strip(),
        "timestamp": now,
        "isRead": False,
        "starred": False,
        "isSpam": is_spam,
        "predictedClass": predicted_class,
        "confidence": confidence,
        "spamProbability": spam_probability,
        "hamProbability": ham_probability,
        "riskScore": risk_score,
        "riskLevel": risk_level,
        "topIndicators": analysis_data.get("top_indicators", []),
        "flagReasons": analysis_data.get("warning_signs", []),
        "explanation": analysis_data.get("explanation", ""),
        "suspiciousPhrases": analysis_data.get("suspicious_phrases", []),
        "detectedLinks": analysis_data.get("detected_links", []),
        "chi2Summary": analysis_data.get("chi2_summary"),
        "recommendedPrecautions": analysis_data.get("recommended_precautions", []),
    }


def update_mailbox_analysis_json(mail_id: str, analysis_json: str) -> bool:
    """Updates the analysis_json payload of a mailbox message safely without altering email metadata."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE mailbox_messages
            SET analysis_json = ?
            WHERE id = ?
        """, (analysis_json, mail_id))
        conn.commit()
        return cursor.rowcount > 0


def _format_mailbox_row(r: Any) -> Dict[str, Any]:
    keys = set(r.keys())
    analysis_data = {}
    if "analysis_json" in keys and r["analysis_json"]:
        try:
            analysis_data = json.loads(r["analysis_json"])
        except Exception:
            pass

    top_indicators = analysis_data.get("top_indicators", [])
    chi2_summary = analysis_data.get("chi2_summary")

    needs_enrichment = (
        not chi2_summary or
        (top_indicators and any(
            isinstance(ind, dict) and ind.get("chi2Score") is None and ind.get("chi2_score") is None
            for ind in top_indicators
        ))
    )
    if needs_enrichment and (r["subject"] or r["body"]):
        try:
            from ml.predict import generate_mailbox_analysis_payload
            enriched = generate_mailbox_analysis_payload(r["subject"] or "", r["body"] or "")
            if enriched and enriched.get("top_indicators"):
                analysis_data = enriched
                try:
                    update_mailbox_analysis_json(r["id"], json.dumps(enriched))
                except Exception:
                    pass
        except Exception:
            pass

    conf = float(r["confidence"])
    is_spam = bool(r["is_spam"])
    if "spam_probability" in keys and r["spam_probability"] is not None:
        spam_prob = float(r["spam_probability"])
    else:
        spam_prob = round(conf if is_spam else max(0.0, 100.0 - conf), 1)

    if "ham_probability" in keys and r["ham_probability"] is not None:
        ham_prob = float(r["ham_probability"])
    else:
        ham_prob = round(max(0.0, 100.0 - spam_prob), 1)

    return {
        "id": r["id"],
        "fromName": r["sender_name"],
        "fromEmail": r["sender_email"],
        "toName": r["recipient_name"],
        "toEmail": r["recipient_email"],
        "subject": r["subject"],
        "body": r["body"],
        "timestamp": r["timestamp"],
        "isRead": bool(r["is_read"]),
        "starred": bool(r["starred"]),
        "isSpam": is_spam,
        "predictedClass": r["predicted_class"],
        "confidence": conf,
        "spamProbability": spam_prob,
        "hamProbability": ham_prob,
        "riskScore": int(r["risk_score"]),
        "riskLevel": r["risk_level"],
        "topIndicators": analysis_data.get("top_indicators", []),
        "flagReasons": analysis_data.get("warning_signs", []),
        "explanation": analysis_data.get("explanation", ""),
        "suspiciousPhrases": analysis_data.get("suspicious_phrases", []),
        "detectedLinks": analysis_data.get("detected_links", []),
        "chi2Summary": analysis_data.get("chi2_summary"),
        "recommendedPrecautions": analysis_data.get("recommended_precautions", []),
    }


def toggle_message_spam(mail_id: str, user_email: str) -> bool:
    """Toggles is_spam flag for moving messages between Inbox and Spam folders."""
    clean_email = user_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE mailbox_messages
            SET is_spam = CASE WHEN is_spam = 1 THEN 0 ELSE 1 END,
                predicted_class = CASE WHEN is_spam = 1 THEN 'ham' ELSE 'spam' END
            WHERE id = ? AND (recipient_email = ? OR sender_email = ?)
        """, (mail_id, clean_email, clean_email))
        conn.commit()
        return cursor.rowcount > 0


def get_inbox_messages(recipient_email: str) -> List[Dict[str, Any]]:
    clean_rec = recipient_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM mailbox_messages
            WHERE recipient_email = ? AND is_spam = 0
            ORDER BY timestamp DESC
        """, (clean_rec,))
        return [_format_mailbox_row(r) for r in cursor.fetchall()]


def get_spam_messages(recipient_email: str) -> List[Dict[str, Any]]:
    clean_rec = recipient_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM mailbox_messages
            WHERE recipient_email = ? AND is_spam = 1
            ORDER BY timestamp DESC
        """, (clean_rec,))
        return [_format_mailbox_row(r) for r in cursor.fetchall()]


def get_sent_messages(sender_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM mailbox_messages
            WHERE sender_id = ?
            ORDER BY timestamp DESC
        """, (sender_id,))
        return [_format_mailbox_row(r) for r in cursor.fetchall()]


def mark_message_read(mail_id: str, recipient_email: str) -> bool:
    clean_rec = recipient_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE mailbox_messages SET is_read = 1
            WHERE id = ? AND recipient_email = ?
        """, (mail_id, clean_rec))
        conn.commit()
        return cursor.rowcount > 0


def toggle_message_star(mail_id: str, user_email: str) -> bool:
    clean_email = user_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE mailbox_messages
            SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END
            WHERE id = ? AND (recipient_email = ? OR sender_email = ?)
        """, (mail_id, clean_email, clean_email))
        conn.commit()
        return cursor.rowcount > 0


def delete_mailbox_message(mail_id: str, user_email: str) -> bool:
    clean_email = user_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM mailbox_messages
            WHERE id = ? AND (recipient_email = ? OR sender_email = ?)
        """, (mail_id, clean_email, clean_email))
        conn.commit()
        return cursor.rowcount > 0


def save_draft(
    draft_id: str,
    user_id: str,
    recipient_email: str,
    recipient_name: str,
    subject: str,
    body: str
) -> Dict[str, Any]:
    """Saves or updates a draft for the authenticated user without creating sent/received records."""
    now_ts = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        if conn.is_postgres:
            cursor.execute("""
                INSERT INTO drafts (id, user_id, recipient_email, recipient_name, subject, body, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                    recipient_email = EXCLUDED.recipient_email,
                    recipient_name = EXCLUDED.recipient_name,
                    subject = EXCLUDED.subject,
                    body = EXCLUDED.body,
                    updated_at = EXCLUDED.updated_at
                WHERE drafts.user_id = EXCLUDED.user_id
            """, (draft_id, user_id, recipient_email, recipient_name, subject, body, now_ts))
        else:
            cursor.execute("""
                INSERT INTO drafts (id, user_id, recipient_email, recipient_name, subject, body, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    recipient_email = excluded.recipient_email,
                    recipient_name = excluded.recipient_name,
                    subject = excluded.subject,
                    body = excluded.body,
                    updated_at = excluded.updated_at
                WHERE drafts.user_id = excluded.user_id
            """, (draft_id, user_id, recipient_email, recipient_name, subject, body, now_ts))
        conn.commit()
    return {
        "id": draft_id,
        "userId": user_id,
        "recipientEmail": recipient_email,
        "recipientName": recipient_name,
        "subject": subject,
        "body": body,
        "updatedAt": now_ts
    }


def get_user_drafts(user_id: str) -> List[Dict[str, Any]]:
    """Retrieves all drafts belonging exclusively to the authenticated user."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, recipient_email, recipient_name, subject, body, updated_at
            FROM drafts
            WHERE user_id = ?
            ORDER BY updated_at DESC
        """, (user_id,))
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "userId": r["user_id"],
                "recipientEmail": r["recipient_email"] or "",
                "recipientName": r["recipient_name"] or "",
                "subject": r["subject"] or "",
                "body": r["body"] or "",
                "updatedAt": r["updated_at"]
            }
            for r in rows
        ]


def get_draft(draft_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a single draft, strictly enforcing user ownership."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, recipient_email, recipient_name, subject, body, updated_at
            FROM drafts
            WHERE id = ? AND user_id = ?
        """, (draft_id, user_id))
        r = cursor.fetchone()
        if not r:
            return None
        return {
            "id": r["id"],
            "userId": r["user_id"],
            "recipientEmail": r["recipient_email"] or "",
            "recipientName": r["recipient_name"] or "",
            "subject": r["subject"] or "",
            "body": r["body"] or "",
            "updatedAt": r["updated_at"]
        }


def delete_draft(draft_id: str, user_id: str) -> bool:
    """Deletes a draft owned by the authenticated user."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM drafts WHERE id = ? AND user_id = ?", (draft_id, user_id))
        conn.commit()
        return cursor.rowcount > 0


def get_user_sent_recipients(sender_id: str, sender_email: str) -> List[Dict[str, str]]:
    """
    Returns distinct recipients to whom the logged-in user has previously sent emails.
    Excludes the user themselves and deduplicates by lowercase recipient email.
    """
    clean_sender_email = sender_email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT recipient_email, recipient_name
            FROM mailbox_messages
            WHERE sender_id = ? AND LOWER(recipient_email) != ?
            ORDER BY timestamp DESC
        """, (sender_id, clean_sender_email))
        rows = cursor.fetchall()
        seen = set()
        recipients = []
        for r in rows:
            em = (r["recipient_email"] or "").strip().lower()
            if em and em not in seen:
                seen.add(em)
                name = (r["recipient_name"] or "").strip() or em.split("@")[0]
                recipients.append({"email": em, "name": name})
        return recipients


def log_training_run(metadata: Dict[str, Any]):
    """Logs a completed training session and its evaluation metrics."""
    eval_data = metadata.get("evaluation", {}).get("overall", {})
    ds_stats = metadata.get("dataset_statistics", {})
    hp = metadata.get("hyperparameters", {})

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO training_history (
                trained_at, accuracy, precision, recall, f1_score,
                train_samples, test_samples, k_features
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            metadata.get("trained_at", datetime.now(timezone.utc).isoformat()),
            eval_data.get("accuracy", 0.0),
            eval_data.get("weighted_precision", 0.0),
            eval_data.get("weighted_recall", 0.0),
            eval_data.get("weighted_f1", 0.0),
            ds_stats.get("train_samples", 0),
            ds_stats.get("test_samples", 0),
            hp.get("k_best_features", 50)
        ))
        conn.commit()
