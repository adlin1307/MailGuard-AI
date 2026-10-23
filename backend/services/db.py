"""
Database Persistence Layer for ProbMail.
Uses SQLite for storing prediction audit logs and model evaluation runs securely.
Avoids storing sensitive raw email bodies while keeping snippets for audit verification.
"""
import sqlite3
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from config import DB_PATH


def get_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with dict row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes tables for predictions history and training audit log, applying migrations safely."""
    with get_connection() as conn:
        cursor = conn.cursor()
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
                risk_score INTEGER
            )
        """)

        # Safely migrate existing tables if columns are missing
        cursor.execute("PRAGMA table_info(predictions)")
        existing_cols = {row[1] for row in cursor.fetchall()}
        if "spam_probability" not in existing_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN spam_probability REAL")
        if "ham_probability" not in existing_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN ham_probability REAL")
        if "risk_score" not in existing_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN risk_score INTEGER")

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
    risk_score: Optional[int] = None
) -> int:
    """
    Saves a prediction record including both estimated spam and ham posterior probabilities,
    and the calculated email risk score (0-100).
    Snippet is capped at 160 characters to preserve privacy while enabling verification.
    """
    now = datetime.now(timezone.utc).isoformat()
    clean_subj = (subject or "Untitled Email")[:120].strip()
    clean_snip = (snippet or "")[:160].strip()

    # Fallback probability deduction if not supplied explicitly
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
        cursor.execute("""
            INSERT INTO predictions (subject, snippet, predicted_class, confidence, timestamp, spam_probability, ham_probability, risk_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (clean_subj, clean_snip, predicted_class.lower(), confidence, now, spam_prob, ham_prob, risk_score))
        conn.commit()
        return cursor.lastrowid


def get_recent_predictions(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves the most recent predictions ordered by timestamp descending."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, subject, snippet, predicted_class, confidence, timestamp,
                   spam_probability, ham_probability, risk_score
            FROM predictions
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # Ensure probabilities are populated
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
    """Retrieves a single prediction by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, subject, snippet, predicted_class, confidence, timestamp,
                   spam_probability, ham_probability, risk_score
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


def get_prediction_statistics() -> Dict[str, Any]:
    """Computes aggregate totals and proportions of actual scans performed."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM predictions")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM predictions WHERE LOWER(predicted_class) = 'spam'")
        spam_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM predictions WHERE LOWER(predicted_class) = 'ham'")
        ham_count = cursor.fetchone()[0]

    spam_pct = round((spam_count / total * 100), 1) if total > 0 else 0.0
    ham_pct = round((ham_count / total * 100), 1) if total > 0 else 0.0

    return {
        "total_analyzed": total,
        "spam_detected": spam_count,
        "ham_detected": ham_count,
        "spam_percentage": spam_pct,
        "ham_percentage": ham_pct
    }


def clear_prediction_history() -> int:
    """Clears all stored prediction records upon user request."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM predictions")
        conn.commit()
        return cursor.rowcount


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
