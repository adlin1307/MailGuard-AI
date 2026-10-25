# ProbMail — Intelligent Spam & Ham Email Security Platform

ProbMail is a modern, high-performance cybersecurity web application built with **React 18 / Vite / TypeScript / Tailwind CSS** for probabilistic email classification, threat detection, and explainable AI.

It features a mathematically grounded **Multinomial Naive Bayes** classification engine coupled with **Pearson's Chi-Square ($\chi^2$) Feature Selection**, rigorous stratified evaluation, exploratory data analysis (EDA), and zero-dependency PDF security scan report generation.

---

## Key Features

1. **Email Security Scanner**:
   - Real-time text analysis or `.eml`/`.txt` file upload.
   - Circular animated Risk Score Gauge ($0–100$).
   - Exact Bayesian posterior probabilities: $P(\text{Spam} \mid \text{Words})$ vs. $P(\text{Ham} \mid \text{Words})$.
   - Grounded warning sign detection (Urgent Action Pressure, Credential Phishing, Financial Incentive Claims).
   - Chi-Square feature contribution breakdown with log-odds impact badges.
   - Actionable cybersecurity precautions tailored to the evaluated risk tier.
   - **1-Click PDF Security Scan Report Generation & Download**.

2. **Security Dashboard & KPIs**:
   - Live platform metrics: total emails scanned, spam detected, ham detected, and percentage breakdown.
   - Scanner status indicator.
   - 3-step threat analysis workflow overview.
   - Recent scanned emails table with quick inspection links.

3. **Scan History & Audit Log**:
   - Persistent audit log of all scanned emails.
   - Real-time search by subject line or content snippet.
   - Filter by All, Spam, or Ham.
   - Detailed modal preview with risk score and posterior probability bars.
   - Direct PDF export per audit record.
   - Log erasure with safety confirmation.

4. **Dataset Management & Hygiene**:
   - Ingestion of custom CSV datasets and preloaded benchmark dataset.
   - Interactive column remapping (`text_column`, `label_column`, `subject_column`).
   - Automated hygiene audit: duplicate detection, missing value stripping, and label normalization.
   - Tabular dataset preview with column breakdown.

5. **Exploratory Data Analysis (EDA) & Statistics**:
   - Descriptive length distributions: Mean, Median, Standard Deviation ($\sigma$), Min, and Max for character counts and word counts.
   - Empirical class imbalance analysis and stratified sampling justification.
   - Top 15 frequent terms per class with stopword filtering.
   - Behavioral email signatures: uppercase percentage, hyperlink presence, currency presence, and urgency keyword frequency.
   - Interactive length comparison and class distribution charts using Recharts.

6. **Chi-Square ($\chi^2$) Feature Selection**:
   - Non-negative TF-IDF matrix with $n$-grams (1, 2).
   - Statistical test of independence against the target class ($df = 1$).
   - Exact $p$-value computation and significance certification ($p < 0.05$).
   - Interactive $k$-best selector ($k = 15, 30, 50, 100$).
   - Class tendency classification (Spam Indicator vs. Ham Indicator).

7. **Model Training & Hyperparameter Tuning**:
   - Configurable $k$-best features slider, stratified train/test split ratio (80/20, 75/25, 70/30), and Laplace smoothing ($\alpha$).
   - Real-time training progress tracking and animated status updates.
   - Active model metadata display.

8. **Model Evaluation & Confusion Matrix**:
   - Held-out test set validation with zero data leakage.
   - Comprehensive metrics: Accuracy, Macro/Weighted Precision, Recall, and F1-Scores.
   - $2 \times 2$ Confusion Matrix with True Negatives, False Positives (Type I), False Negatives (Type II), and True Positives.
   - Cybersecurity trade-off analysis explaining false alarm vs. breach risk.

---

## Technology Stack

- **Framework**: React 18
- **Build Tool**: Vite 6
- **Language**: TypeScript (Strict type safety)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Reports**: Native Client-Side PDF 1.4 Generation Engine

---

## Development & Build Commands

```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev

# Build production bundle with TypeScript type-checking
npm run build

# Preview production build on port 3000
npm run preview
```

---

## License
MIT License.
