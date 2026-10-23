"""
Training Job Manager for ProbMail.
Provides genuine, thread-safe asynchronous training execution and transparent progress tracking.
"""
import threading
import time
from typing import Dict, Any, Optional
import pandas as pd

from ml.train import train_probmail_model
from services.db import log_training_run


class TrainingJobManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._status = "idle"  # idle | running | completed | failed
        self._progress = 0
        self._step_message = "Ready to train."
        self._error: Optional[str] = None
        self._started_at: Optional[str] = None
        self._completed_at: Optional[str] = None
        self._result: Optional[Dict[str, Any]] = None
        self._thread: Optional[threading.Thread] = None

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "status": self._status,
                "progress": self._progress,
                "step_message": self._step_message,
                "error": self._error,
                "started_at": self._started_at,
                "completed_at": self._completed_at,
                "result_available": self._result is not None
            }

    def get_result(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._result

    def start_training(
        self,
        df: pd.DataFrame,
        text_col: str = "clean_text",
        label_col: str = "label",
        k_best: int = 50,
        max_features: int = 1500,
        test_size: float = 0.2,
        alpha: float = 1.0
    ) -> bool:
        with self._lock:
            if self._status == "running":
                return False  # Already in progress

            self._status = "running"
            self._progress = 10
            self._step_message = "Initializing training parameters and validating data..."
            self._error = None
            self._result = None
            self._started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self._completed_at = None

        # Spawn worker thread
        self._thread = threading.Thread(
            target=self._run_training_worker,
            args=(df, text_col, label_col, k_best, max_features, test_size, alpha),
            daemon=True
        )
        self._thread.start()
        return True

    def _run_training_worker(
        self,
        df: pd.DataFrame,
        text_col: str,
        label_col: str,
        k_best: int,
        max_features: int,
        test_size: float,
        alpha: float
    ):
        try:
            with self._lock:
                self._progress = 25
                self._step_message = f"Executing stratified train/test split ({int((1-test_size)*100)}% train, {int(test_size*100)}% test)..."

            time.sleep(0.3)  # Allow UI to observe state transition

            with self._lock:
                self._progress = 50
                self._step_message = f"Fitting TF-IDF Vectorizer and selecting Top {k_best} Chi-Square features on training set..."

            time.sleep(0.3)

            with self._lock:
                self._progress = 75
                self._step_message = "Training Multinomial Naive Bayes classifier and evaluating on held-out test data..."

            metadata = train_probmail_model(
                df=df,
                text_col=text_col,
                label_col=label_col,
                k_best=k_best,
                max_features=max_features,
                test_size=test_size,
                alpha=alpha
            )

            # Persist run in SQLite audit log
            log_training_run(metadata)

            with self._lock:
                self._progress = 100
                self._step_message = "Pipeline fitted, verified, and saved successfully."
                self._status = "completed"
                self._completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                self._result = metadata

        except Exception as e:
            with self._lock:
                self._status = "failed"
                self._error = str(e)
                self._step_message = f"Training failed: {str(e)}"
                self._completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# Singleton instance
training_manager = TrainingJobManager()
