"""
Model Evaluation Module for ProbMail.
Evaluates the trained pipeline on the held-out test set with honest metrics,
per-class precision/recall/F1, confusion matrix, positive-class designation,
and clear student explanations for college viva presentation.
"""
from typing import Dict, Any, List
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)


def evaluate_pipeline(
    pipeline: Any,
    X_test: List[str],
    y_test: List[str],
    classes: List[str] = None
) -> Dict[str, Any]:
    """
    Evaluates a trained pipeline strictly on held-out test data.
    Computes overall accuracy, macro/weighted precision, recall, f1,
    per-class breakdown, and standard 2x2 confusion matrix with Spam as positive class.
    """
    if len(X_test) == 0 or len(y_test) == 0:
        return {
            "error": "Held-out test set is empty. Cannot perform evaluation.",
            "test_samples": 0
        }

    if classes is None:
        classes = ["ham", "spam"]

    # Ensure consistent order: ['ham', 'spam']
    if "ham" in classes and "spam" in classes:
        classes = ["ham", "spam"]

    # Generate predictions on unseen test data
    y_pred = pipeline.predict(X_test)

    # Calculate metrics
    accuracy = float(accuracy_score(y_test, y_pred))

    # Macro and Weighted metrics
    macro_precision = float(precision_score(y_test, y_pred, average="macro", zero_division=0))
    macro_recall = float(recall_score(y_test, y_pred, average="macro", zero_division=0))
    macro_f1 = float(f1_score(y_test, y_pred, average="macro", zero_division=0))

    weighted_precision = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
    weighted_recall = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
    weighted_f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))

    # Per-class metrics
    class_report_dict = classification_report(
        y_test,
        y_pred,
        labels=classes,
        output_dict=True,
        zero_division=0
    )

    per_class = {}
    for cls in classes:
        if cls in class_report_dict:
            per_class[cls] = {
                "precision": round(float(class_report_dict[cls]["precision"]), 4),
                "recall": round(float(class_report_dict[cls]["recall"]), 4),
                "f1_score": round(float(class_report_dict[cls]["f1-score"]), 4),
                "support": int(class_report_dict[cls]["support"])
            }

    # Confusion Matrix
    cm = confusion_matrix(y_test, y_pred, labels=classes)

    # Structure for binary confusion matrix:
    # classes: ['ham', 'spam']
    # Positive class for spam filter: 'spam'
    # cm[0,0] = True Negatives (Ham correctly identified as Ham)
    # cm[0,1] = False Positives (Ham incorrectly flagged as Spam - Type I Error)
    # cm[1,0] = False Negatives (Spam missed as Ham - Type II Error / Security Risk)
    # cm[1,1] = True Positives (Spam correctly caught as Spam)
    tn = int(cm[0, 0]) if cm.shape == (2, 2) else 0
    fp = int(cm[0, 1]) if cm.shape == (2, 2) else 0
    fn = int(cm[1, 0]) if cm.shape == (2, 2) else 0
    tp = int(cm[1, 1]) if cm.shape == (2, 2) else 0

    confusion_matrix_data = {
        "labels": classes,
        "positive_class": "spam",
        "negative_class": "ham",
        "matrix": cm.tolist(),
        "breakdown": {
            "true_negatives": tn,
            "false_positives": fp,
            "false_negatives": fn,
            "true_positives": tp
        },
        "interpretation": {
            "true_positives_note": f"{tp} spam emails correctly detected and blocked.",
            "true_negatives_note": f"{tn} legitimate emails correctly delivered.",
            "false_positives_note": f"{fp} legitimate emails incorrectly flagged as spam (Type I False Alarm).",
            "false_negatives_note": f"{fn} spam emails missed and bypassed the filter (Type II Security Risk)."
        }
    }

    reliability_assessment = "Reliable (evaluated on held-out test split)"
    if len(X_test) < 20:
        reliability_assessment = "Small test sample size (N < 20). Metrics may have high variance across splits."

    metric_explanations = {
        "accuracy": "Overall ratio of correct predictions across both classes: (TP + TN) / Total.",
        "precision": "Accuracy of spam alerts: Of all emails flagged as spam, what proportion were actually spam: TP / (TP + FP).",
        "recall": "Spam catch rate (Sensitivity): Of all actual spam emails, what proportion did the model catch: TP / (TP + FN).",
        "f1_score": "Harmonic mean of Precision and Recall, balancing false alarms against missed threats: 2 * (P * R) / (P + R).",
        "positive_class_designation": "In ProbMail's security model, 'Spam' is designated as the positive class (the condition being detected), while 'Ham' is the negative class."
    }

    # Spam-specific positive class metrics
    spam_metrics = per_class.get("spam", {})

    return {
        "test_samples": len(X_test),
        "positive_class": "spam",
        "negative_class": "ham",
        "spam_detection": {
            "precision": spam_metrics.get("precision", 0.0),
            "recall": spam_metrics.get("recall", 0.0),
            "f1_score": spam_metrics.get("f1_score", 0.0),
            "support": spam_metrics.get("support", 0)
        },
        "overall": {
            "accuracy": round(accuracy, 4),
            "macro_precision": round(macro_precision, 4),
            "macro_recall": round(macro_recall, 4),
            "macro_f1": round(macro_f1, 4),
            "weighted_precision": round(weighted_precision, 4),
            "weighted_recall": round(weighted_recall, 4),
            "weighted_f1": round(weighted_f1, 4)
        },
        "per_class": per_class,
        "confusion_matrix": confusion_matrix_data,
        "metric_explanations": metric_explanations,
        "reliability": reliability_assessment,
        "notes": "All reported metrics are measured exclusively on the held-out test split, ensuring no data leakage from training or feature selection."
    }
