"""
Chi-Square Feature Selection Module for ProbMail.
Technical Responsibility #3: TF-IDF vectorization, SelectKBest with chi2,
p-value statistical significance testing, class association analysis, and viva defense theory.
"""
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.feature_selection import SelectKBest, chi2


def fit_chi_square_selector(
    X_train: List[str],
    y_train: List[str],
    k: int = 50,
    max_features: int = 1500,
    ngram_range: Tuple[int, int] = (1, 2)
) -> Tuple[TfidfVectorizer, SelectKBest, Dict[str, Any]]:
    """
    Fits a non-negative TF-IDF Vectorizer and SelectKBest(chi2) exclusively on training data
    to strictly prevent data leakage.
    Returns:
      vectorizer: Fitted TfidfVectorizer
      selector: Fitted SelectKBest
      feature_analysis: Rich analysis of top features with scores, p-values, and interpretations
    """
    if not X_train or not y_train:
        raise ValueError("X_train and y_train cannot be empty for feature selection.")

    # 1. Non-negative TF-IDF Representation
    # Chi-Square requires non-negative values. Standard TF-IDF satisfies this condition.
    vectorizer = TfidfVectorizer(
        max_features=max_features,
        ngram_range=ngram_range,
        stop_words="english",
        sublinear_tf=True,
        min_df=1,
        norm="l2"
    )

    X_train_vec = vectorizer.fit_transform(X_train)
    total_vocab_size = len(vectorizer.vocabulary_)

    if total_vocab_size == 0:
        raise ValueError("Vocabulary is empty after vectorization. Ensure training texts have valid words.")

    # Guard against k exceeding total vocabulary size
    actual_k = min(k, total_vocab_size)

    # 2. Fit Chi-Square Feature Selector
    selector = SelectKBest(score_func=chi2, k=actual_k)
    selector.fit(X_train_vec, y_train)

    # 3. Analyze Feature Scores and Significance
    analysis = analyze_selected_features(
        vectorizer=vectorizer,
        selector=selector,
        X_train_vec=X_train_vec,
        y_train=y_train,
        top_n=actual_k
    )

    return vectorizer, selector, analysis


def analyze_selected_features(
    vectorizer: TfidfVectorizer,
    selector: SelectKBest,
    X_train_vec: Any,
    y_train: List[str],
    top_n: int = 50
) -> Dict[str, Any]:
    """
    Extracts Chi-Square scores, p-values, statistical significance levels,
    and class tendencies (Spam vs Ham association) for selected features.
    """
    feature_names = np.array(vectorizer.get_feature_names_out())
    scores = selector.scores_
    p_values = selector.pvalues_

    # Handle cases where scores or p_values contain NaNs or Infs
    scores = np.nan_to_num(scores, nan=0.0, posinf=0.0, neginf=0.0)
    p_values = np.nan_to_num(p_values, nan=1.0, posinf=1.0, neginf=1.0)

    # Compute class associations using mean TF-IDF per class
    y_arr = np.array(y_train)
    ham_mask = (y_arr == 'ham')
    spam_mask = (y_arr == 'spam')

    # Convert sparse matrix to array for subset indexing if feasible
    # For large datasets we use sparse slicing
    ham_means = np.asarray(X_train_vec[ham_mask].mean(axis=0)).flatten() if np.any(ham_mask) else np.zeros(len(feature_names))
    spam_means = np.asarray(X_train_vec[spam_mask].mean(axis=0)).flatten() if np.any(spam_mask) else np.zeros(len(feature_names))

    # Rank features by Chi-Square score descending
    sorted_indices = np.argsort(scores)[::-1]
    
    features_list: List[Dict[str, Any]] = []
    
    for idx in sorted_indices[:top_n]:
        word = str(feature_names[idx])
        score = float(scores[idx])
        pval = float(p_values[idx])
        
        # Determine class association based on mean presence
        h_val = float(ham_means[idx])
        s_val = float(spam_means[idx])
        
        if s_val > h_val * 1.2:
            tendency = "Spam Indicator"
            leaning_class = "spam"
        elif h_val > s_val * 1.2:
            tendency = "Ham Indicator"
            leaning_class = "ham"
        else:
            tendency = "Neutral / Shared"
            leaning_class = "neutral"

        # Statistical significance classification
        if pval < 0.001:
            significance = "p < 0.001 (Highly Significant)"
            is_sig = True
        elif pval < 0.01:
            significance = "p < 0.01 (Strongly Significant)"
            is_sig = True
        elif pval < 0.05:
            significance = "p < 0.05 (Statistically Significant)"
            is_sig = True
        else:
            significance = f"p = {pval:.4f} (Not Statistically Significant)"
            is_sig = False

        features_list.append({
            "feature": word,
            "chi2_score": round(score, 4),
            "p_value": pval,
            "p_value_formatted": f"{pval:.2e}" if pval < 0.0001 else f"{pval:.4f}",
            "significance": significance,
            "is_significant": is_sig,
            "tendency": tendency,
            "leaning_class": leaning_class,
            "ham_mean_tfidf": round(h_val, 4),
            "spam_mean_tfidf": round(s_val, 4),
            "explanation": f"'{word}' shows strong statistical dependence with {tendency.lower()} (Chi-Square: {score:.2f}, p-value: {pval:.2e})."
        })

    significant_count = sum(1 for f in features_list if f["is_significant"])

    return {
        "total_vocabulary_evaluated": len(feature_names),
        "selected_k": len(features_list),
        "significant_features_count": significant_count,
        "significance_rate_pct": round((significant_count / len(features_list) * 100), 2) if features_list else 0.0,
        "features": features_list,
        "methodology": {
            "test_type": "Pearson's Chi-Square Test of Independence (chi2)",
            "null_hypothesis": "H₀: Term occurrence and email class label (Ham vs Spam) are independent.",
            "alternative_hypothesis": "H₁: Term occurrence and email class label are dependent.",
            "score_vs_pvalue_distinction": "The Chi-Square score quantifies the divergence between observed term frequencies and expected frequencies under independence. The p-value indicates the exact probability of observing this divergence purely by chance. A feature is only statistically valid when p < 0.05."
        }
    }
