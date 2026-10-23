"""
Statistical Analysis Module for ProbMail.
Technical Responsibility #2: Class distribution, imbalance, length metrics,
frequency analysis, characteristic indicators, and viva insights.
"""
import re
from collections import Counter
from typing import Dict, Any, List
import pandas as pd
import numpy as np

# Standard English stop words to filter out for frequency analysis
ENGLISH_STOP_WORDS = {
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've",
    "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
    'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', "it's", 'its', 'itself',
    'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom',
    'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a',
    'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at',
    'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on',
    'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    's', 't', 'can', 'will', 'just', 'don', "don't", 'should', "should've", 'now', 'd',
    'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't",
    'didn', "didn't", 'doesn', "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven',
    "haven't", 'isn', "isn't", 'ma', 'mightn', "mightn't", 'mustn', "mustn't", 'needn',
    "needn't", 'shan', "shan't", 'shouldn', "shouldn't", 'wasn', "wasn't", 'weren',
    "weren't", 'won', "won't", 'wouldn', "wouldn't", 'com', 'http', 'https', 'www', 'subject',
    'url_token', 'email_token', 'currency_token', 'num_token'
}

URGENCY_KEYWORDS = {
    'urgent', 'immediately', 'verify', 'suspended', 'alert', 'expire',
    'action', 'winner', 'won', 'congratulations', 'claim', 'free', 'cash',
    'deposit', 'prize', 'warning', 'locked', 'overdue', 'limited'
}


def calculate_descriptive_stats(series: pd.Series) -> Dict[str, float]:
    """Calculates mean, median, min, max, and std deviation safely."""
    if series.empty:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0, "std": 0.0}
    return {
        "mean": round(float(series.mean()), 2),
        "median": round(float(series.median()), 2),
        "min": round(float(series.min()), 2),
        "max": round(float(series.max()), 2),
        "std": round(float(series.std(ddof=1) if len(series) > 1 else 0.0), 2)
    }


def extract_top_words(texts: List[str], top_n: int = 15) -> List[Dict[str, Any]]:
    """Extracts top non-stopword tokens and their raw frequencies."""
    counter: Counter = Counter()
    for text in texts:
        if not isinstance(text, str):
            continue
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
        meaningful_words = [w for w in words if w not in ENGLISH_STOP_WORDS]
        counter.update(meaningful_words)

    total_words = sum(counter.values()) or 1
    return [
        {
            "word": word,
            "count": count,
            "frequency": round((count / total_words) * 100, 2)
        }
        for word, count in counter.most_common(top_n)
    ]


def compute_dataset_statistics(df: pd.DataFrame, text_col: str = "clean_text", label_col: str = "label") -> Dict[str, Any]:
    """
    Computes rigorous statistical analysis across legitimate (Ham) and Spam classes.
    Includes data distribution, lengths, characteristic lexical patterns, and viva notes.
    """
    if df.empty or label_col not in df.columns or text_col not in df.columns:
        return {
            "total_samples": 0,
            "classes": {},
            "class_imbalance": {"ratio": 1.0, "description": "No data available"},
            "length_metrics": {},
            "frequent_words": {"ham": [], "spam": []},
            "characteristics": {},
            "viva_insights": []
        }

    total_samples = len(df)
    labels = df[label_col].astype(str).str.lower()
    
    # Class counts and percentages
    label_counts = labels.value_counts().to_dict()
    classes_summary = {}
    for lbl, count in label_counts.items():
        pct = round((count / total_samples) * 100, 2)
        classes_summary[lbl] = {
            "count": int(count),
            "percentage": pct
        }

    # Class imbalance calculation
    counts_list = list(label_counts.values())
    if len(counts_list) >= 2:
        maj = max(counts_list)
        min_c = min(counts_list) if min(counts_list) > 0 else 1
        imbalance_ratio = round(maj / min_c, 2)
        if imbalance_ratio <= 1.5:
            imbalance_desc = "Balanced (Near 1:1 distribution)"
        elif imbalance_ratio <= 3.0:
            imbalance_desc = f"Moderate Imbalance (~{imbalance_ratio}:1 ratio)"
        else:
            imbalance_desc = f"Severe Imbalance (~{imbalance_ratio}:1 ratio)"
    else:
        imbalance_ratio = 1.0
        imbalance_desc = "Single class present in dataset"

    # Character & Word Lengths
    char_lengths = df[text_col].astype(str).str.len()
    word_counts = df[text_col].astype(str).str.split().str.len()

    df_stats = df.copy()
    df_stats["char_len"] = char_lengths
    df_stats["word_count"] = word_counts

    length_metrics = {
        "overall": {
            "char_length": calculate_descriptive_stats(char_lengths),
            "word_count": calculate_descriptive_stats(word_counts)
        },
        "by_class": {}
    }

    for lbl in label_counts.keys():
        subset = df_stats[df_stats[label_col].astype(str).str.lower() == lbl]
        length_metrics["by_class"][lbl] = {
            "char_length": calculate_descriptive_stats(subset["char_len"]),
            "word_count": calculate_descriptive_stats(subset["word_count"])
        }

    # Frequent Words by class
    frequent_words = {}
    for lbl in ["ham", "spam"]:
        subset_texts = df_stats[df_stats[label_col].astype(str).str.lower() == lbl][text_col].dropna().tolist()
        frequent_words[lbl] = extract_top_words(subset_texts, top_n=15)

    # Email Characteristics Analysis
    raw_col = "raw_text" if "raw_text" in df.columns else text_col
    raw_series = df[raw_col].astype(str)

    # Check uppercase ratio in raw text
    def uppercase_ratio(s: str) -> float:
        alphas = [c for c in s if c.isalpha()]
        if not alphas:
            return 0.0
        return sum(1 for c in alphas if c.isupper()) / len(alphas)

    # Check urgency keywords
    def urgency_count(s: str) -> int:
        words = set(re.findall(r'\b\w+\b', s.lower()))
        return len(words.intersection(URGENCY_KEYWORDS))

    df_chars = pd.DataFrame()
    df_chars["label"] = labels
    df_chars["upper_ratio"] = raw_series.apply(uppercase_ratio)
    df_chars["has_url"] = raw_series.str.contains(r'https?://|www\.', case=False, regex=True).astype(int)
    df_chars["has_currency"] = raw_series.str.contains(r'[\$\€\£\¥\₹]|dollar|cash|money', case=False, regex=True).astype(int)
    df_chars["urgency_words"] = raw_series.apply(urgency_count)

    characteristics = {}
    for lbl in ["ham", "spam"]:
        sub = df_chars[df_chars["label"] == lbl]
        if not sub.empty:
            characteristics[lbl] = {
                "avg_uppercase_pct": round(float(sub["upper_ratio"].mean()) * 100, 2),
                "url_presence_pct": round(float(sub["has_url"].mean()) * 100, 2),
                "currency_presence_pct": round(float(sub["has_currency"].mean()) * 100, 2),
                "avg_urgency_keywords": round(float(sub["urgency_words"].mean()), 2)
            }
        else:
            characteristics[lbl] = {
                "avg_uppercase_pct": 0.0,
                "url_presence_pct": 0.0,
                "currency_presence_pct": 0.0,
                "avg_urgency_keywords": 0.0
            }

    # Viva Insights for University/Technical Defense
    viva_insights = [
        {
            "topic": "Class Imbalance & Evaluation Metric Selection",
            "concept": "Why Accuracy is insufficient on imbalanced datasets",
            "explanation": f"The dataset exhibits a {imbalance_ratio}:1 class ratio. In imbalanced scenarios, a trivial classifier that always predicts the majority class would achieve high raw accuracy while completely failing to detect security threats. Stratified splitting, Precision, Recall, and F1-score are mathematically necessary."
        },
        {
            "topic": "Text Length Signatures",
            "concept": "Structural differences between legitimate work emails and phishing/spam lures",
            "explanation": "Legitimate business and personal emails typically exhibit higher variability in sentence length and contextual detail, whereas spam solicitations often favor concise, high-urgency call-to-action triggers or repetitive keyword stuffing."
        },
        {
            "topic": "Lexical Discriminability",
            "concept": "Vocabulary divergence between Ham and Spam",
            "explanation": "The frequent word distributions highlight clear domain separation: Ham documents center around operational and interpersonal dialogue ('meeting', 'project', 'team', 'attached'), whereas Spam centers on urgency, financial rewards, and account verification threats ('urgent', 'account', 'verify', 'winner', 'claim')."
        }
    ]

    return {
        "total_samples": total_samples,
        "classes": classes_summary,
        "class_imbalance": {
            "ratio": imbalance_ratio,
            "description": imbalance_desc
        },
        "length_metrics": length_metrics,
        "frequent_words": frequent_words,
        "characteristics": characteristics,
        "viva_insights": viva_insights
    }
