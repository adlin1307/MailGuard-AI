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
    if predicted_class == "spam":
        verdict_title = f"{risk_category}: Spam / Security Threat Detected"
        verdict_summary = (
            f"The model classified this email as SPAM with {spam_prob:.1f}% estimated probability "
            f"(Ham: {ham_prob:.1f}%). Lexical patterns match solicitation, credential verification, "
            f"or deceptive urgency cues learned from the training data."
        )
    else:
        verdict_title = f"{risk_category}: Legitimate Email (Ham)"
        verdict_summary = (
            f"The model classified this email as HAM with {ham_prob:.1f}% estimated probability "
            f"(Spam: {spam_prob:.1f}%). Content structure and word usage align with standard "
            f"interpersonal, administrative, or workplace communication."
        )

    disclaimer = (
        "Probability reflects the model's Bayesian posterior score P(Class | Words) based on learned "
        "training frequencies. This is a model-estimated probability, not an absolute guarantee that "
        "an email is safe."
    )

    accuracy_note = (
        f"Distinction: Estimated probability ({confidence * 100:.1f}%) is this specific email's likelihood score. "
        + (f"Overall model test accuracy is {test_accuracy * 100:.1f}% on held-out test data." if test_accuracy else "")
    )

    analysis_details = {
        "words_scanned": len(combined_raw.split()),
        "clean_tokens": len(cleaned.split()),
        "influential_tokens_count": len(influential_features),
        "test_accuracy": test_accuracy,
        "algorithm": "Multinomial Naive Bayes + Chi-Square Selection (SelectKBest)",
        "bayesian_explanation": (
            "Posterior probabilities are calculated using Bayes' Rule: P(Spam | Text) ∝ P(Spam) · ∏ P(Word | Spam). "
            "Chi-Square feature selection retains only terms with statistically significant class dependence (p < 0.05)."
        )
    }

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
    """
    try:
        tfidf = pipeline.named_steps["tfidf"]
        chi2 = pipeline.named_steps["chi2"]
        nb = pipeline.named_steps["nb"]

        # All vocabulary features and Chi-square selected mask
        feature_names = np.array(tfidf.get_feature_names_out())
        selected_mask = chi2.get_support()
        selected_feature_names = feature_names[selected_mask]

        # Vectorize current text with fitted tfidf and chi2 selector
        vec = tfidf.transform([cleaned_text])
        sel_vec = chi2.transform(vec)
        row = sel_vec.toarray()[0]

        # Non-zero entries correspond to active features in this email
        active_indices = np.where(row > 0)[0]
        if len(active_indices) == 0:
            return []

        classes = list(nb.classes_)
        ham_idx = classes.index("ham") if "ham" in classes else 0
        spam_idx = classes.index("spam") if "spam" in classes else (1 if len(classes) > 1 else 0)
        feature_log_prob = nb.feature_log_prob_

        influential = []
        for idx in active_indices:
            feat_name = str(selected_feature_names[idx])
            if not is_valid_explanatory_feature(feat_name):
                continue

            tfidf_weight = float(row[idx])
            spam_lp = float(feature_log_prob[spam_idx, idx])
            ham_lp = float(feature_log_prob[ham_idx, idx])

            # Difference in log-likelihood (spam vs ham)
            diff_lp = spam_lp - ham_lp
            # Local feature contribution = TF-IDF weight * log-likelihood ratio
            contrib = tfidf_weight * diff_lp

            if contrib > 0.05:
                polarity = "Spam Indicator"
                badge = "danger"
                desc = (
                    f"Term '{feat_name}' contributed +{abs(contrib):.2f} to the model's Bayesian spam log-odds "
                    f"based on training frequencies. (Statistical correlation, not proof of malicious intent.)"
                )
            elif contrib < -0.05:
                polarity = "Ham Indicator"
                badge = "success"
                desc = (
                    f"Term '{feat_name}' shifted the model toward Ham by -{abs(contrib):.2f} in log-odds "
                    f"based on training frequencies. (Statistical association, does not guarantee message safety.)"
                )
            else:
                polarity = "Neutral"
                badge = "neutral"
                desc = f"Term '{feat_name}' had minimal directional influence on this email's classification."

            influential.append({
                "word": feat_name,
                "polarity": polarity,
                "impact_score": round(abs(contrib), 2),
                "log_odds_contrib": round(contrib, 4),
                "badge": badge,
                "description": desc
            })

        # Sort by magnitude of feature contribution
        influential.sort(key=lambda x: x["impact_score"], reverse=True)
        return influential[:max_words]

    except Exception:
        return []


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
