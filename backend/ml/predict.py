"""
Email Prediction and Inference Module for ProbMail.
Performs real-time text preprocessing, pipeline inference, posterior probability computation,
and influential feature extraction for explainable email security verdicts.
"""
from typing import Dict, Any, Optional, List, Tuple
import numpy as np
from ml.preprocessing import clean_text, combine_subject_and_body
from ml.train import load_trained_pipeline, ensure_trained_model


def predict_email(
    subject: Optional[str],
    body: Optional[str],
    pipeline: Optional[Any] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Analyzes an email to classify it as Ham or Spam.
    Returns predicted class, confidence score, estimated posterior probabilities for both classes,
    influential tokens, and explainable analysis.
    """
    # 1. Input Validation
    subj_str = (subject or "").strip()
    body_str = (body or "").strip()

    if not subj_str and not body_str:
        return {
            "error": "Email subject and body are both empty. Please provide an email subject or message to analyze.",
            "status": "invalid_input"
        }

    combined_raw = combine_subject_and_body(subj_str, body_str).strip()

    # 2. Pipeline Retrieval (with automatic training if needed)
    if pipeline is None:
        pipeline, metadata = load_trained_pipeline()

    if pipeline is None:
        # Attempt automatic background preparation
        metadata = ensure_trained_model()
        if metadata:
            pipeline, metadata = load_trained_pipeline()

    if pipeline is None:
        print("[ProbMail Inference Error] Pipeline could not be loaded or trained. Check dataset and model directory.")
        return {
            "error": "Email analysis is temporarily unavailable.",
            "status": "unavailable"
        }

    # 3. Clean Text using standardized preprocessing
    cleaned = clean_text(combined_raw)
    if not cleaned:
        return {
            "error": "Input text contains no recognizable alphanumeric words after text preprocessing.",
            "status": "empty_vocabulary"
        }

    # 4. Pipeline Inference
    classes = list(pipeline.classes_)
    probabilities = pipeline.predict_proba([cleaned])[0]
    predicted_idx = int(np.argmax(probabilities))
    predicted_class = str(classes[predicted_idx]).lower()
    confidence = float(probabilities[predicted_idx])

    # Class probability dictionary (percentages)
    prob_dict = {
        str(cls).lower(): round(float(prob) * 100, 2)
        for cls, prob in zip(classes, probabilities)
    }

    spam_prob = prob_dict.get("spam", 0.0)
    ham_prob = prob_dict.get("ham", 0.0)

    # 5. Risk Score Computation (0-100 directly mapped from model-estimated Spam probability)
    risk_score = max(0, min(100, int(round(spam_prob))))
    if risk_score >= 70:
        risk_category = "High Risk"
        risk_level = "high"
    elif risk_score >= 30:
        risk_category = "Medium Risk"
        risk_level = "medium"
    else:
        risk_category = "Low Risk"
        risk_level = "low"

    # 6. Extract Influential Selected Features for this specific email
    influential_features = extract_influential_words(
        cleaned_text=cleaned,
        pipeline=pipeline,
        predicted_class=predicted_class
    )

    # 7. Grounded Warning Signs & Security Precautions Analysis
    warning_signs, recommended_precautions = analyze_flag_reasons(
        raw_text=combined_raw,
        cleaned_text=cleaned,
        predicted_class=predicted_class,
        influential_features=influential_features,
        risk_score=risk_score
    )

    # 8. Retrieve test accuracy from metadata to clearly distinguish accuracy from probability
    test_accuracy = None
    if metadata and "evaluation" in metadata:
        test_accuracy = metadata.get("evaluation", {}).get("overall", {}).get("accuracy")

    # 9. Generate Contextual Verdict Explanation
    # 9. Generate Contextual Verdict Explanation (Clean, concise, and grounded)
    if predicted_class == "spam":
        verdict_title = f"{risk_category}: Spam Detected"
        verdict_summary = (
            f"Classified as SPAM with {spam_prob:.1f}% estimated probability. "
            f"Content contains solicitation, credential verification, or urgency cues."
        )
    else:
        verdict_title = f"{risk_category}: Legitimate Email (Ham)"
        verdict_summary = (
            f"Classified as HAM with {ham_prob:.1f}% estimated probability. "
            f"Content structure aligns with standard interpersonal or workplace communication."
        )

    disclaimer = (
        "Probability reflects the model's Bayesian posterior score P(Class | Words). "
        "A Ham classification indicates low estimated risk, not an absolute guarantee of safety."
    )

    chi2_step = pipeline.named_steps.get("chi2") if pipeline and hasattr(pipeline, "named_steps") else None
    chi2_summary = {
        "method": "SelectKBest(score_func=chi2)",
        "k_selected": int(chi2_step.k) if chi2_step and hasattr(chi2_step, "k") else None,
        "alpha_threshold": 0.05,
        "description": "Chi-Square (χ²) evaluates statistical dependence between words and Spam/Ham labels during model training (significance threshold α = 0.05, p < 0.05).",
        "distinction_note": "Training-time χ² p-values reflect vocabulary feature importance across the dataset, distinct from this email's Bayesian posterior classification probabilities."
    }

    analysis_details = {
        "words_scanned": len(combined_raw.split()),
        "clean_tokens": len(cleaned.split()),
        "influential_tokens_count": len(influential_features),
        "test_accuracy": test_accuracy,
        "algorithm": "Multinomial Naive Bayes + Chi-Square Selection (SelectKBest)",
        "chi2_summary": chi2_summary
    }

    accuracy_note = (
        f"Overall model test accuracy is {test_accuracy * 100:.1f}% on held-out test data."
        if test_accuracy else ""
    )

    return {
        "status": "success",
        "predicted_class": predicted_class,
        "confidence_percentage": round(confidence * 100, 2),
        "confidence_raw": round(confidence, 4),
        "spam_probability": spam_prob,
        "ham_probability": ham_prob,
        "class_probabilities": prob_dict,
        "risk_score": risk_score,
        "risk_category": risk_category,
        "risk_level": risk_level,
        "warning_signs": warning_signs,
        "recommended_precautions": recommended_precautions,
        "verdict_title": verdict_title,
        "verdict_summary": verdict_summary,
        "influential_features": influential_features,
        "analysis_details": analysis_details,
        "chi2_summary": chi2_summary,
        "accuracy_note": accuracy_note,
        "disclaimer": disclaimer,
        "subject_snippet": subj_str[:80] if subj_str else (body_str[:80] if body_str else "Untitled"),
        "cleaned_length": len(cleaned.split())
    }


INTERNAL_TOKEN_SUBSTRINGS = {"num_token", "url_token", "email_token", "currency_token", "_token", "token"}


def is_valid_explanatory_feature(term: str) -> bool:
    """
    Filters out internal preprocessing tokens, placeholders, and meaningless artifacts.
    Guarantees no internal token such as 'num_token' or 'url_token' leaks into user-facing output.
    """
    if not term or not isinstance(term, str):
        return False
    term_lower = term.strip().lower()
    for sub in INTERNAL_TOKEN_SUBSTRINGS:
        if sub in term_lower:
            return False
    # Must contain at least 2 alphabetic characters
    alpha_chars = [c for c in term_lower if c.isalpha()]
    if len(alpha_chars) < 2:
        return False
    return True


def get_feature_statistics(feature_term: str, pipeline: Any = None) -> Dict[str, Any]:
    """
    Returns verified training-set Chi-Square statistic, p-value, significance status,
    class association, and selection status for a feature term from the fitted statistical selector.
    Distinguishes 'Not in selected features' from 'Unavailable'.
    Never invents or hardcodes statistics.
    """
    if pipeline is None:
        pipeline, _ = load_trained_pipeline()

    if not pipeline or not hasattr(pipeline, "named_steps"):
        return {
            "word": feature_term,
            "token": feature_term,
            "in_vocabulary": False,
            "in_selected": False,
            "selection_status": "Unavailable",
            "selectionStatus": "Unavailable",
            "chi2_score": None,
            "chi2Score": None,
            "p_value": None,
            "pValue": None,
            "p_value_formatted": "Unavailable",
            "pValueFormatted": "Unavailable",
            "significance_status": "Unavailable",
            "significanceStatus": "Unavailable",
            "is_significant": False,
            "isSignificant": False,
            "class_association": "Unavailable",
            "classAssociation": "Unavailable",
            "training_association": "Chi-Square statistics unavailable",
            "trainingAssociation": "Chi-Square statistics unavailable"
        }

    try:
        tfidf = pipeline.named_steps["tfidf"]
        chi2 = pipeline.named_steps["chi2"]
        nb = pipeline.named_steps["nb"]

        term = str(feature_term).strip().lower()
        if term not in tfidf.vocabulary_:
            return {
                "word": feature_term,
                "token": feature_term,
                "in_vocabulary": False,
                "in_selected": False,
                "selection_status": "Unavailable",
                "selectionStatus": "Unavailable",
                "chi2_score": None,
                "chi2Score": None,
                "p_value": None,
                "pValue": None,
                "p_value_formatted": "Unavailable",
                "pValueFormatted": "Unavailable",
                "significance_status": "Unavailable",
                "significanceStatus": "Unavailable",
                "is_significant": False,
                "isSignificant": False,
                "class_association": "Unavailable",
                "classAssociation": "Unavailable",
                "training_association": "Chi-Square statistics unavailable",
                "trainingAssociation": "Chi-Square statistics unavailable"
            }

        idx = int(tfidf.vocabulary_[term])
        raw_score = chi2.scores_[idx] if hasattr(chi2, "scores_") and chi2.scores_ is not None else None
        raw_pval = chi2.pvalues_[idx] if hasattr(chi2, "pvalues_") and chi2.pvalues_ is not None else None

        chi2_val = round(float(raw_score), 2) if raw_score is not None and not np.isnan(raw_score) else None

        if raw_pval is not None and not np.isnan(raw_pval):
            pval_num = float(raw_pval)
            if pval_num < 0.001:
                pval = float(f"{pval_num:.2e}")
                pval_fmt = "p < 0.001"
                sig_status = "Highly Significant"
                is_sig = True
            elif pval_num < 0.05:
                pval = round(pval_num, 4)
                pval_fmt = f"p = {pval_num:.4f}"
                sig_status = "Statistically Significant"
                is_sig = True
            else:
                pval = round(pval_num, 4)
                pval_fmt = f"p = {pval_num:.4f}"
                sig_status = "Not Statistically Significant"
                is_sig = False
        else:
            pval = None
            pval_fmt = "Unavailable"
            sig_status = "Unavailable"
            is_sig = False

        support = chi2.get_support()
        is_selected = bool(support[idx])

        if is_selected:
            selection_status = "Selected Feature"
            selected_indices = list(np.where(support)[0])
            sel_idx = selected_indices.index(idx)
            classes = list(nb.classes_)
            ham_idx = classes.index("ham") if "ham" in classes else 0
            spam_idx = classes.index("spam") if "spam" in classes else (1 if len(classes) > 1 else 0)
            spam_lp = float(nb.feature_log_prob_[spam_idx, sel_idx])
            ham_lp = float(nb.feature_log_prob_[ham_idx, sel_idx])
            diff_lp = spam_lp - ham_lp
            if diff_lp > 0.02:
                class_assoc = "Spam-associated"
            elif diff_lp < -0.02:
                class_assoc = "Ham-associated"
            else:
                class_assoc = "Neutral / Shared"
        else:
            selection_status = "Not in selected features"
            class_assoc = "Unavailable"

        training_assoc = (
            f"χ² = {chi2_val:.2f}, {pval_fmt} ({sig_status})"
            if (chi2_val is not None and pval is not None)
            else "Chi-Square statistics unavailable"
        )

        return {
            "word": feature_term,
            "token": feature_term,
            "in_vocabulary": True,
            "in_selected": is_selected,
            "selection_status": selection_status,
            "selectionStatus": selection_status,
            "chi2_score": chi2_val,
            "chi2Score": chi2_val,
            "p_value": pval,
            "pValue": pval,
            "p_value_formatted": pval_fmt,
            "pValueFormatted": pval_fmt,
            "significance_status": sig_status,
            "significanceStatus": sig_status,
            "is_significant": is_sig,
            "isSignificant": is_sig,
            "class_association": class_assoc,
            "classAssociation": class_assoc,
            "training_association": training_assoc,
            "trainingAssociation": training_assoc
        }
    except Exception:
        return {
            "word": feature_term,
            "token": feature_term,
            "in_vocabulary": False,
            "in_selected": False,
            "selection_status": "Unavailable",
            "selectionStatus": "Unavailable",
            "chi2_score": None,
            "chi2Score": None,
            "p_value": None,
            "pValue": None,
            "p_value_formatted": "Unavailable",
            "pValueFormatted": "Unavailable",
            "significance_status": "Unavailable",
            "significanceStatus": "Unavailable",
            "is_significant": False,
            "isSignificant": False,
            "class_association": "Unavailable",
            "classAssociation": "Unavailable",
            "training_association": "Chi-Square statistics unavailable",
            "trainingAssociation": "Chi-Square statistics unavailable"
        }


def extract_influential_words(
    cleaned_text: str,
    pipeline: Any,
    predicted_class: str,
    max_words: int = 10
) -> List[Dict[str, Any]]:
    """
    Computes local feature contributions for tokens present in this specific email
    using the fitted TF-IDF weights and Multinomial Naive Bayes log-likelihood differences.
    Filters out internal preprocessing placeholders and meaningless artifacts.
    Includes both camelCase and snake_case properties for total client compatibility.
    """
    try:
        tfidf = pipeline.named_steps["tfidf"]
        chi2 = pipeline.named_steps["chi2"]
        nb = pipeline.named_steps["nb"]

        # All vocabulary features and Chi-square selected mask
        feature_names = np.array(tfidf.get_feature_names_out())
        selected_mask = chi2.get_support()
        selected_feature_names = feature_names[selected_mask]
        selected_chi2_scores = chi2.scores_[selected_mask] if hasattr(chi2, "scores_") and chi2.scores_ is not None else None
        selected_chi2_pvalues = chi2.pvalues_[selected_mask] if hasattr(chi2, "pvalues_") and chi2.pvalues_ is not None else None

        # Vectorize current text with fitted tfidf and chi2 selector
        vec = tfidf.transform([cleaned_text])
        sel_vec = chi2.transform(vec)
        row = sel_vec.toarray()[0]
        full_row = vec.toarray()[0]

        # Non-zero entries correspond to active features in this email
        active_indices = np.where(row > 0)[0]

        classes = list(nb.classes_)
        ham_idx = classes.index("ham") if "ham" in classes else 0
        spam_idx = classes.index("spam") if "spam" in classes else (1 if len(classes) > 1 else 0)
        feature_log_prob = nb.feature_log_prob_

        influential = []
        seen_words = set()

        for idx in active_indices:
            feat_name = str(selected_feature_names[idx])
            if not is_valid_explanatory_feature(feat_name):
                continue
            seen_words.add(feat_name)

            tfidf_weight = float(row[idx])
            spam_lp = float(feature_log_prob[spam_idx, idx])
            ham_lp = float(feature_log_prob[ham_idx, idx])

            # Difference in log-likelihood (spam vs ham)
            diff_lp = spam_lp - ham_lp
            # Local feature contribution = TF-IDF weight * log-likelihood ratio
            contrib = tfidf_weight * diff_lp

            chi2_val = round(float(selected_chi2_scores[idx]), 2) if selected_chi2_scores is not None and not np.isnan(selected_chi2_scores[idx]) else None
            if selected_chi2_pvalues is not None and not np.isnan(selected_chi2_pvalues[idx]):
                raw_pval = float(selected_chi2_pvalues[idx])
                if raw_pval < 0.001:
                    pval = float(f"{raw_pval:.2e}")
                    pval_fmt = "p < 0.001"
                    sig_status = "Highly Significant"
                    is_sig = True
                elif raw_pval < 0.05:
                    pval = round(raw_pval, 4)
                    pval_fmt = f"p = {raw_pval:.4f}"
                    sig_status = "Statistically Significant"
                    is_sig = True
                else:
                    pval = round(raw_pval, 4)
                    pval_fmt = f"p = {raw_pval:.4f}"
                    sig_status = "Not Statistically Significant"
                    is_sig = False
            else:
                pval = None
                pval_fmt = "Unavailable"
                sig_status = "Unavailable"
                is_sig = False

            if pval is None:
                class_assoc = "Unavailable"
            elif diff_lp > 0.02:
                class_assoc = "Spam-associated"
            elif diff_lp < -0.02:
                class_assoc = "Ham-associated"
            else:
                class_assoc = "Neutral / Shared"

            if contrib > 0.02:
                polarity = "Spam Indicator"
                predicted_impact = "spam"
                badge = "danger"
                pred_contrib = f"+{abs(contrib):.2f} log-odds (favors Spam)"
                desc = (
                    f"Term '{feat_name}' contributed +{abs(contrib):.2f} to the model's Bayesian spam log-odds. "
                    f"(Statistical correlation from training frequencies.)"
                )
                interp = (
                    f"{class_assoc} in training data ({pval_fmt}). "
                    f"Shifts current prediction toward Spam by +{abs(contrib):.2f} log-odds."
                )
            elif contrib < -0.02:
                polarity = "Ham Indicator"
                predicted_impact = "ham"
                badge = "success"
                pred_contrib = f"-{abs(contrib):.2f} log-odds (favors Ham)"
                desc = (
                    f"Term '{feat_name}' shifted the model toward Ham by -{abs(contrib):.2f} in log-odds. "
                    f"(Statistical correlation from training frequencies.)"
                )
                interp = (
                    f"{class_assoc} in training data ({pval_fmt}). "
                    f"Shifts current prediction toward Ham by -{abs(contrib):.2f} log-odds."
                )
            else:
                polarity = "Neutral"
                predicted_impact = "neutral"
                badge = "neutral"
                pred_contrib = "0.00 log-odds (neutral contribution)"
                desc = f"Term '{feat_name}' had minimal directional influence on this email's classification."
                interp = f"Retained in model vocabulary ({pval_fmt}), with neutral directional impact on this email."

            if chi2_val is not None and pval is not None:
                training_assoc = f"χ² = {chi2_val:.2f}, {pval_fmt} ({sig_status})"
            else:
                training_assoc = "Chi-Square statistics unavailable"

            feat_item = {
                "word": feat_name,
                "token": feat_name,
                "polarity": polarity,
                "predicted_impact": predicted_impact,
                "impact": predicted_impact,
                "impact_score": round(abs(contrib), 2),
                "log_odds_contrib": round(contrib, 4),
                "log_odds": round(contrib, 4),
                "logOdds": round(abs(contrib), 2),
                "badge": badge,
                "description": desc,
                "chi2_score": chi2_val,
                "chi2Score": chi2_val,
                "p_value": pval,
                "pValue": pval,
                "p_value_formatted": pval_fmt,
                "pValueFormatted": pval_fmt,
                "is_significant": is_sig,
                "isSignificant": is_sig,
                "significance_status": sig_status,
                "significanceStatus": sig_status,
                "class_association": class_assoc,
                "classAssociation": class_assoc,
                "selection_status": "Selected Feature",
                "selectionStatus": "Selected Feature",
                "training_association": training_assoc,
                "trainingAssociation": training_assoc,
                "prediction_contribution": pred_contrib,
                "predictionContribution": pred_contrib,
                "interpretation": interp
            }

            influential.append(feat_item)

        # Sort by magnitude of feature contribution
        influential.sort(key=lambda x: x["impact_score"], reverse=True)

        # Check for any active candidate vocabulary words not in the top-50 selected features
        if len(influential) < max_words:
            all_active_indices = np.where(full_row > 0)[0]
            for full_idx in all_active_indices:
                if len(influential) >= max_words:
                    break
                candidate_word = str(feature_names[full_idx])
                if candidate_word in seen_words or not is_valid_explanatory_feature(candidate_word):
                    continue
                seen_words.add(candidate_word)

                cand_stat = get_feature_statistics(candidate_word, pipeline=pipeline)
                cand_item = {
                    "word": candidate_word,
                    "token": candidate_word,
                    "polarity": "Neutral",
                    "predicted_impact": "neutral",
                    "impact": "neutral",
                    "impact_score": 0.0,
                    "log_odds_contrib": 0.0,
                    "log_odds": 0.0,
                    "logOdds": 0.0,
                    "badge": "neutral",
                    "description": f"Term '{candidate_word}' was evaluated during training, but was not in the top-50 Chi-Square selector cutoff.",
                    "chi2_score": cand_stat.get("chi2_score"),
                    "chi2Score": cand_stat.get("chi2_score"),
                    "p_value": cand_stat.get("p_value"),
                    "pValue": cand_stat.get("p_value"),
                    "p_value_formatted": cand_stat.get("p_value_formatted", "Unavailable"),
                    "pValueFormatted": cand_stat.get("p_value_formatted", "Unavailable"),
                    "is_significant": cand_stat.get("is_significant", False),
                    "isSignificant": cand_stat.get("is_significant", False),
                    "significance_status": cand_stat.get("significance_status", "Unavailable"),
                    "significanceStatus": cand_stat.get("significance_status", "Unavailable"),
                    "class_association": cand_stat.get("class_association", "Unavailable"),
                    "classAssociation": cand_stat.get("class_association", "Unavailable"),
                    "selection_status": "Not in selected features",
                    "selectionStatus": "Not in selected features",
                    "training_association": cand_stat.get("training_association", "Chi-Square statistics unavailable"),
                    "trainingAssociation": cand_stat.get("training_association", "Chi-Square statistics unavailable"),
                    "prediction_contribution": "0.00 log-odds (not in selected features)",
                    "predictionContribution": "0.00 log-odds (not in selected features)",
                    "interpretation": f"Evaluated during training ({cand_stat.get('p_value_formatted')}), but not among the top-50 features selected for prediction."
                }
                influential.append(cand_item)

        return influential[:max_words]

    except Exception:
        return []


def generate_mailbox_analysis_payload(subject: str, body: str) -> Dict[str, Any]:
    """
    Shared backend analysis generator for mailbox messages (both newly sent and saved messages).
    Executes real inference on the message without recording scan history,
    returning a rich analysis payload with complete Chi-Square statistics,
    p-values, log-odds contributions, security indicators, and recommendations.
    """
    pred = predict_email(subject=subject, body=body)
    if not isinstance(pred, dict) or pred.get("status") != "success":
        return {}

    influential_features = pred.get("influential_features", [])
    top_indicators = [
        {
            "token": f.get("word", ""),
            "word": f.get("word", ""),
            "logOdds": round(abs(float(f.get("log_odds", f.get("impact_score", 1.0))))),
            "log_odds": round(float(f.get("log_odds", 1.0)), 4),
            "log_odds_contrib": round(float(f.get("log_odds_contrib", 1.0)), 4),
            "impact": f.get("predicted_impact", "spam" if f.get("badge") == "danger" else "ham"),
            "predicted_impact": f.get("predicted_impact", "spam" if f.get("badge") == "danger" else "ham"),
            "badge": f.get("badge", "neutral"),
            "polarity": f.get("polarity", ""),
            "chi2Score": f.get("chi2_score"),
            "chi2_score": f.get("chi2_score"),
            "pValue": f.get("p_value"),
            "p_value": f.get("p_value"),
            "pValueFormatted": f.get("p_value_formatted"),
            "p_value_formatted": f.get("p_value_formatted"),
            "isSignificant": f.get("is_significant", False),
            "is_significant": f.get("is_significant", False),
            "significanceStatus": f.get("significance_status", "Unavailable"),
            "significance_status": f.get("significance_status", "Unavailable"),
            "classAssociation": f.get("class_association", "Unavailable"),
            "class_association": f.get("class_association", "Unavailable"),
            "selectionStatus": f.get("selection_status", "Selected Feature"),
            "selection_status": f.get("selection_status", "Selected Feature"),
            "trainingAssociation": f.get("training_association", ""),
            "training_association": f.get("training_association", ""),
            "predictionContribution": f.get("prediction_contribution", ""),
            "prediction_contribution": f.get("prediction_contribution", ""),
            "interpretation": f.get("interpretation", ""),
            "description": f.get("description", "")
        }
        for f in influential_features
        if f.get("word")
    ]

    warning_signs = pred.get("warning_signs", [])
    suspicious_phrases = [
        ws.get("highlighted_phrase")
        for ws in warning_signs
        if isinstance(ws, dict) and ws.get("highlighted_phrase")
    ]
    detected_links = pred.get("detected_links", [])
    if not detected_links:
        import re
        combined_raw = f"{subject}\n{body}"
        detected_links = re.findall(r'https?://[^\s<>"]+|www\.[^\s<>"]+', combined_raw)

    return {
        "verdict": "SPAM" if pred.get("predicted_class") == "spam" else "HAM",
        "verdict_title": pred.get("verdict_title", ""),
        "explanation": pred.get("verdict_summary", ""),
        "top_indicators": top_indicators,
        "warning_signs": warning_signs,
        "suspicious_phrases": suspicious_phrases,
        "detected_links": detected_links,
        "chi2_summary": pred.get("chi2_summary"),
        "recommended_precautions": pred.get("recommended_precautions", []),
        "accuracy_note": pred.get("accuracy_note", ""),
        "disclaimer": pred.get("disclaimer", "")
    }


def analyze_flag_reasons(
    raw_text: str,
    cleaned_text: str,
    predicted_class: str,
    influential_features: List[Dict[str, Any]],
    risk_score: int
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Identifies grounded warning signs and relevant security recommendations.
    Connects explanations directly to the fitted Naive Bayes / Chi-square model.
    Eliminates internal tokens and avoids false safety claims.
    """
    lower_raw = raw_text.lower()
    warning_signs: List[Dict[str, Any]] = []

    # Filter out any internal tokens from influential features just to be doubly sure
    valid_features = [
        f for f in influential_features
        if is_valid_explanatory_feature(f.get("word", ""))
    ]

    is_spam = (predicted_class == "spam") or (risk_score >= 50)

    if is_spam:
        # 1. Obvious Phishing Tactics in raw text (Urgency, Credential Harvest, Financial Claims)
        urgency_terms = [
            "urgent", "immediately", "immediate", "suspended", "suspension",
            "compromised", "deadline", "within 24 hours", "action required",
            "act now", "time sensitive", "freeze", "locked", "expire", "asap"
        ]
        matched_urgency = [term for term in urgency_terms if term in lower_raw]
        if matched_urgency:
            warning_signs.append({
                "title": "Urgent Action Pressure",
                "detail": "Language conveys artificial time pressure or warning of account disruption to force prompt action.",
                "highlighted_phrase": matched_urgency[0],
                "category": "Urgency"
            })

        credential_terms = [
            "password", "verify account", "verification", "credentials", "login",
            "authenticate", "reset your", "routing number", "security update",
            "unauthorized", "confirm identity", "confirm password"
        ]
        matched_creds = [term for term in credential_terms if term in lower_raw]
        if matched_creds:
            warning_signs.append({
                "title": "Credential & Account Verification Prompt",
                "detail": "Requests confirmation of login credentials, security verification, or sensitive identity information.",
                "highlighted_phrase": matched_creds[0],
                "category": "Credential Phishing"
            })

        financial_terms = [
            "winner", "lottery", "cash prize", "million dollars", "claim your prize",
            "inheritance", "wire transfer", "guaranteed payout", "unclaimed funds"
        ]
        matched_finance = [term for term in financial_terms if term in lower_raw]
        if matched_finance:
            warning_signs.append({
                "title": "Financial Incentive or Prize Claim",
                "detail": "Contains unsolicited claims of monetary rewards, lottery payouts, or zero-risk financial offers.",
                "highlighted_phrase": matched_finance[0],
                "category": "Financial Solicitation"
            })

        # 2. Model Feature Influences (Spam Indicators)
        spam_tokens = [f for f in valid_features if f.get("badge") == "danger"]
        for st in spam_tokens[:3]:
            word = st["word"]
            if not any(word in ws.get("highlighted_phrase", "") for ws in warning_signs):
                warning_signs.append({
                    "title": f"Statistical Feature Influence ('{word}')",
                    "detail": (
                        f"Word '{word}' was selected by Chi-Square feature selection and shifted the Bayesian model "
                        f"toward Spam (Log-odds impact: +{st['impact_score']}). Note: Feature frequency reflects "
                        f"training patterns, not definitive proof of malicious intent."
                    ),
                    "highlighted_phrase": word,
                    "category": "Model Vocabulary"
                })
                if len(warning_signs) >= 4:
                    break

    else:
        # Ham / Legitimate classification:
        # Ground explanations STRICTLY in the fitted model features.
        # DO NOT claim that absence of keywords proves safety.
        # DO NOT claim that words like 'attached' automatically mean legitimate dialogue.
        ham_tokens = [f for f in valid_features if f.get("badge") == "success"]
        for ht in ham_tokens[:3]:
            word = ht["word"]
            if not any(word in ws.get("highlighted_phrase", "") for ws in warning_signs):
                warning_signs.append({
                    "title": f"Statistical Feature Influence ('{word}')",
                    "detail": (
                        f"Word '{word}' was selected by Chi-Square feature selection and shifted the Bayesian model "
                        f"toward Ham (Log-odds impact: -{ht['impact_score']}). Note: Statistical association reflects "
                        f"training frequencies and does not guarantee message safety."
                    ),
                    "highlighted_phrase": word,
                    "category": "Model Vocabulary"
                })
                if len(warning_signs) >= 3:
                    break

    # 3. Honest fallback if no reliable feature-level explanation can be made
    if not warning_signs:
        warning_signs.append({
            "title": "Model Pattern Recognition",
            "detail": "The model classified this email based on learned text patterns; no reliable feature-level explanation is available.",
            "highlighted_phrase": "",
            "category": "Model Explanation"
        })

    # Recommended Precautions based on Risk Score
    if risk_score >= 70:
        precautions = [
            "Do not click hyperlinks or download attachments from this email.",
            "Never share passwords, multi-factor codes, or banking credentials.",
            "Verify the sender's identity through an official, independent contact method.",
            "Flag and delete this message from your email client."
        ]
    elif risk_score >= 30:
        precautions = [
            "Exercise caution: inspect the sender's full email address for domain spoofing or misspellings.",
            "Hover over links to verify their destination URL before clicking.",
            "If this message requests account action or funds, confirm directly with the sender via phone or official channels.",
            "Remember: Medium risk indicates ambiguous or mixed language cues."
        ]
    else:
        precautions = [
            "Exercise standard vigilance even with emails classified as legitimate.",
            "Verify sender address before opening attachments, especially from external contacts.",
            "Remember: A low risk score indicates a low statistical probability of spam based on learned patterns, not an absolute guarantee of safety."
        ]

    return warning_signs, precautions
