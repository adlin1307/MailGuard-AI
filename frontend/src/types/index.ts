export type EmailClass = 'ham' | 'spam';

export interface ScanMetrics {
  total_analyzed: number;
  spam_detected: number;
  ham_detected: number;
  spam_percentage: number;
  ham_percentage: number;
}

export interface ModelInfo {
  is_trained: boolean;
  trained_at: string | null;
  model_name: string | null;
  accuracy: number | null;
  precision?: number | null;
  recall?: number | null;
  macro_f1: number | null;
  weighted_f1?: number | null;
  spam_precision?: number | null;
  spam_recall?: number | null;
  spam_f1?: number | null;
  test_samples: number;
  train_samples: number;
  k_features: number | null;
  classes: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high';
export type RiskCategory = 'Low Risk' | 'Medium Risk' | 'High Risk';

export interface WarningSign {
  title: string;
  detail: string;
  highlighted_phrase?: string;
  category?: string;
}

export interface PredictionRecord {
  id: number;
  subject: string;
  snippet: string;
  predicted_class: EmailClass;
  confidence: number;
  timestamp: string;
  spam_probability?: number;
  ham_probability?: number;
  risk_score?: number;
  risk_category?: RiskCategory;
  risk_level?: RiskLevel;
}

export interface DatasetOverview {
  is_loaded: boolean;
  filename: string | null;
  total_raw: number;
  total_usable: number;
  duplicates_removed: number;
  missing_values: number;
  ham_count: number;
  spam_count: number;
  ham_percentage: number;
  spam_percentage: number;
  class_distribution: Record<string, number>;
}

export interface DashboardData {
  status: string;
  dataset?: DatasetOverview;
  metrics: ScanMetrics;
  model: ModelInfo;
  recent_predictions: PredictionRecord[];
  is_empty_state: boolean;
}

export interface InfluentialFeature {
  word: string;
  polarity: string;
  impact_score: number;
  badge: 'danger' | 'success' | 'neutral';
  description: string;
}

export interface PredictionResult {
  status: string;
  predicted_class: EmailClass;
  confidence_percentage: number;
  confidence_raw: number;
  spam_probability?: number;
  ham_probability?: number;
  class_probabilities: Record<string, number>;
  risk_score: number;
  risk_category: RiskCategory;
  risk_level: RiskLevel;
  warning_signs: WarningSign[];
  recommended_precautions: string[];
  verdict_title: string;
  verdict_summary: string;
  influential_features: InfluentialFeature[];
  analysis_details?: {
    words_scanned?: number;
    clean_tokens?: number;
    influential_tokens_count?: number;
    test_accuracy?: number | null;
    algorithm?: string;
    bayesian_explanation?: string;
  };
  accuracy_note?: string;
  disclaimer: string;
  subject_snippet: string;
  cleaned_length: number;
  prediction_id?: number;
  error?: string;
}

export interface PreprocessingSummary {
  original_rows: number;
  missing_text_count: number;
  missing_label_count: number;
  duplicates_removed: number;
  unrecognized_labels: string[];
  cleaned_rows: number;
  class_distribution: Record<string, number>;
  warnings: string[];
}

export interface DatasetSummary {
  filename: string;
  total_rows_raw: number;
  columns: string[];
  selected_columns: {
    text_column: string;
    label_column: string;
    subject_column: string | null;
  };
  preview: Record<string, any>[];
  preprocessing: PreprocessingSummary;
  is_ready_for_training: boolean;
}

export interface DescriptiveStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
}

export interface FrequentWord {
  word: string;
  count: number;
  frequency: number;
}

export interface EmailCharacteristics {
  avg_uppercase_pct: number;
  url_presence_pct: number;
  currency_presence_pct: number;
  avg_urgency_keywords: number;
}

export interface VivaInsight {
  topic: string;
  concept: string;
  explanation: string;
}

export interface DatasetStatistics {
  total_samples: number;
  classes: Record<string, { count: number; percentage: number }>;
  class_imbalance: {
    ratio: number;
    description: string;
  };
  hygiene?: {
    total_raw_rows: number;
    total_usable_emails: number;
    duplicates_removed: number;
    missing_values_count: number;
    unrecognized_labels_count: number;
  };
  co5_definitions?: Record<string, string>;
  length_metrics: {
    overall: {
      char_length: DescriptiveStats;
      word_count: DescriptiveStats;
    };
    by_class: Record<string, {
      char_length: DescriptiveStats;
      word_count: DescriptiveStats;
    }>;
  };
  frequent_words: {
    ham: FrequentWord[];
    spam: FrequentWord[];
  };
  characteristics: Record<string, EmailCharacteristics>;
  viva_insights: VivaInsight[];
}

export interface ChiSquareFeature {
  feature: string;
  chi2_score: number;
  p_value: number;
  p_value_formatted: string;
  significance: string;
  is_significant: boolean;
  tendency: string;
  leaning_class: 'ham' | 'spam' | 'neutral';
  ham_mean_tfidf: number;
  spam_mean_tfidf: number;
  explanation: string;
}

export interface ChiSquareAnalysis {
  total_vocabulary_evaluated: number;
  selected_k: number;
  significant_features_count: number;
  significance_rate_pct: number;
  features: ChiSquareFeature[];
  methodology: {
    test_type: string;
    null_hypothesis: string;
    alternative_hypothesis: string;
    score_vs_pvalue_distinction: string;
  };
}

export interface TrainingStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  step_message: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_available: boolean;
  result?: any;
}

export interface PerClassMetrics {
  precision: number;
  recall: number;
  f1_score: number;
  support: number;
}

export interface EvaluationData {
  is_trained: boolean;
  trained_at?: string;
  model_name?: string;
  dataset_statistics?: {
    total_samples: number;
    train_samples: number;
    test_samples: number;
    split_ratio: string;
    stratified: boolean;
    classes: string[];
    class_distribution_train: Record<string, number>;
    class_distribution_test: Record<string, number>;
  };
  hyperparameters?: {
    k_best_features: number;
    max_features: number;
    ngram_range: [number, number];
    nb_alpha: number;
    random_state: number;
  };
  evaluation?: {
    test_samples: number;
    overall: {
      accuracy: number;
      macro_precision: number;
      macro_recall: number;
      macro_f1: number;
      weighted_precision: number;
      weighted_recall: number;
      weighted_f1: number;
    };
    per_class: Record<string, PerClassMetrics>;
    confusion_matrix: {
      labels: string[];
      matrix: number[][];
      breakdown: {
        true_negatives: number;
        false_positives: number;
        false_negatives: number;
        true_positives: number;
      };
      interpretation: {
        false_positives_note: string;
        false_negatives_note: string;
      };
    };
    reliability: string;
    notes: string;
  };
  chi_square_summary?: {
    selected_k: number;
    significant_features_count: number;
    top_features: ChiSquareFeature[];
  };
  message?: string;
}
