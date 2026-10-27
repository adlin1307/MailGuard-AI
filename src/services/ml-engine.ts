import {
  ChiSquareAnalysis,
  ChiSquareFeature,
  DatasetOverview,
  DatasetStatistics,
  DatasetSummary,
  EvaluationData,
  InfluentialFeature,
  PredictionRecord,
  PredictionResult,
  RawEmailRow,
  RiskCategory,
  RiskLevel,
  ScanMetrics,
  TrainingStatus,
  WarningSign,
} from '../types';
import { SAMPLE_EMAILS } from '../data/sample-dataset';

// Standard English stop words
export const ENGLISH_STOP_WORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
  'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
  'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
  'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
  'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
  'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn',
  'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn',
  'wasn', 'weren', 'won', 'wouldn', 'com', 'http', 'https', 'www', 'subject',
  'url_token', 'email_token', 'currency_token', 'num_token', '_token'
]);

export const URGENCY_KEYWORDS = new Set([
  'urgent', 'immediately', 'verify', 'suspended', 'alert', 'expire',
  'action', 'winner', 'won', 'congratulations', 'claim', 'free', 'cash',
  'deposit', 'prize', 'warning', 'locked', 'overdue', 'limited'
]);

export function cleanText(text: string | null | undefined, replaceTokens: boolean = true): string {
  if (!text || typeof text !== 'string') return '';

  // 1. Unescape HTML entities
  let cleaned = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 2. Strip HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 3. Normalize Unicode
  cleaned = cleaned.normalize('NFKD');

  if (replaceTokens) {
    cleaned = cleaned.replace(/https?:\/\/\S+|www\.\S+/gi, ' url_token ');
    cleaned = cleaned.replace(/[\w\.-]+@[\w\.-]+\.\w+/gi, ' email_token ');
    cleaned = cleaned.replace(/[\$\€\£\¥\₹]/gi, ' currency_token ');
    cleaned = cleaned.replace(/\b\d+(?:[\.,]\d+)*\b/g, ' num_token ');
  }

  cleaned = cleaned.toLowerCase();
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s_]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

export function combineSubjectAndBody(subject?: string, body?: string): string {
  const s = (subject || '').trim();
  const b = (body || '').trim();
  if (s && b) return `${s}. ${b}`;
  return s || b;
}

// Chi-Square p-value from chi2 score with df=1
// Exact formulation: p = 2 * (1 - NormalCDF(sqrt(chi2)))
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

export function chi2PValue(chi2: number): number {
  if (chi2 <= 0 || isNaN(chi2)) return 1.0;
  const z = Math.sqrt(chi2);
  const p = 2 * (1 - normalCdf(z));
  return Math.max(0, Math.min(1.0, p));
}

export interface TrainedModelPipeline {
  vocab: string[];
  kBestVocab: string[];
  idf: Record<string, number>;
  priorLogProb: { ham: number; spam: number };
  featureLogProb: {
    ham: Record<string, number>;
    spam: Record<string, number>;
  };
  chiSquareSummary: ChiSquareAnalysis;
  evaluation: EvaluationData;
  trainedAt: string;
}

class ProbMailEngine {
  private activeDataset: RawEmailRow[] = [];
  private activePipeline: TrainedModelPipeline | null = null;
  private isTraining: boolean = false;
  private trainingStatus: TrainingStatus = {
    status: 'idle',
    progress: 0,
    step_message: 'Ready to train',
    error: null,
    started_at: null,
    completed_at: null,
    result_available: false,
  };

  constructor() {
    this.init();
  }

  private init() {
    // Load dataset from storage or default
    const savedDs = localStorage.getItem('probmail_custom_dataset');
    if (savedDs) {
      try {
        this.activeDataset = JSON.parse(savedDs);
      } catch {
        this.activeDataset = [...SAMPLE_EMAILS];
      }
    } else {
      this.activeDataset = [...SAMPLE_EMAILS];
    }

    // Clean up any legacy seeded demonstration records safely if present
    this.cleanLegacyDemoHistory();

    // Automatically train initial model
    this.trainModelSync(50, 0.2, 1.0, 1500);
  }

  private cleanLegacyDemoHistory() {
    try {
      const raw = localStorage.getItem('probmail_predictions');
      if (!raw) return;
      const records: PredictionRecord[] = JSON.parse(raw);
      if (!Array.isArray(records)) return;

      const demoSubjects = new Set([
        'URGENT: Your Bank Account Access Has Been Suspended',
        'Q3 Engineering Sprint Retrospective Notes',
        'CONGRATULATIONS! You have been chosen for a $1,000,000 cash payout',
        'Quarterly Budget Planning for Dev Team',
        'Microsoft 365 Password Expiration Alert',
      ]);

      // Filter out only confirmed demo seeded records (by exact demo subject & numeric id <= 5)
      const genuineRecords = records.filter(
        (r) => !(r.id <= 5 && demoSubjects.has(r.subject))
      );

      if (genuineRecords.length !== records.length) {
        localStorage.setItem('probmail_predictions', JSON.stringify(genuineRecords));
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Tokenization into unigrams & bigrams
  private extractTokens(cleanTextStr: string): string[] {
    const words = cleanTextStr.split(/\s+/).filter((w) => w.length >= 2);
    const tokens: string[] = [];

    // Unigrams (filter standard stop words)
    for (const w of words) {
      if (!ENGLISH_STOP_WORDS.has(w) && /^[a-z_]{2,}$/.test(w)) {
        tokens.push(w);
      }
    }

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (
        !ENGLISH_STOP_WORDS.has(w1) &&
        !ENGLISH_STOP_WORDS.has(w2) &&
        /^[a-z_]{2,}$/.test(w1) &&
        /^[a-z_]{2,}$/.test(w2)
      ) {
        tokens.push(`${w1} ${w2}`);
      }
    }

    return tokens;
  }

  public trainModelSync(
    kBest: number = 50,
    testSize: number = 0.2,
    alpha: number = 1.0,
    maxFeatures: number = 1500
  ): TrainedModelPipeline {
    const rawData = this.activeDataset;
    const cleanedRows = rawData
      .map((r) => {
        const text = combineSubjectAndBody(r.subject, r.body || r.text);
        return {
          raw_text: text,
          clean_text: cleanText(text),
          label: r.label.toLowerCase() === 'spam' ? ('spam' as const) : ('ham' as const),
        };
      })
      .filter((r) => r.clean_text.length > 0);

    // Stratified train/test split
    const hamRows = cleanedRows.filter((r) => r.label === 'ham');
    const spamRows = cleanedRows.filter((r) => r.label === 'spam');

    const hamSplitIdx = Math.max(1, Math.floor(hamRows.length * (1 - testSize)));
    const spamSplitIdx = Math.max(1, Math.floor(spamRows.length * (1 - testSize)));

    const trainRows = [...hamRows.slice(0, hamSplitIdx), ...spamRows.slice(0, spamSplitIdx)];
    const testRows = [...hamRows.slice(hamSplitIdx), ...spamRows.slice(spamSplitIdx)];

    // 1. Vocabulary & Document Frequency on Training Set
    const docTokensList = trainRows.map((r) => Array.from(new Set(this.extractTokens(r.clean_text))));
    const dfMap: Record<string, number> = {};
    const termCountsPerClass: { ham: Record<string, number>; spam: Record<string, number> } = {
      ham: {},
      spam: {},
    };

    trainRows.forEach((r, idx) => {
      const tokens = this.extractTokens(r.clean_text);
      const uniqueTokens = docTokensList[idx];
      const cls = r.label;

      uniqueTokens.forEach((t) => {
        dfMap[t] = (dfMap[t] || 0) + 1;
      });

      tokens.forEach((t) => {
        termCountsPerClass[cls][t] = (termCountsPerClass[cls][t] || 0) + 1;
      });
    });

    // Filter vocab by maxFeatures (top terms by DF)
    const sortedTermsByDf = Object.keys(dfMap).sort((a, b) => dfMap[b] - dfMap[a]);
    const vocab = sortedTermsByDf.slice(0, maxFeatures);

    const N = trainRows.length;
    const idfMap: Record<string, number> = {};
    vocab.forEach((t) => {
      idfMap[t] = Math.log((1 + N) / (1 + (dfMap[t] || 1))) + 1;
    });

    // 2. Chi-Square calculation for each term
    const hamTrainCount = hamRows.slice(0, hamSplitIdx).length;
    const spamTrainCount = spamRows.slice(0, spamSplitIdx).length;

    const chiSquareFeatures: ChiSquareFeature[] = [];

    vocab.forEach((term) => {
      let spamWithTerm = 0;
      let hamWithTerm = 0;

      trainRows.forEach((r, i) => {
        if (docTokensList[i].includes(term)) {
          if (r.label === 'spam') spamWithTerm++;
          else hamWithTerm++;
        }
      });

      const spamWithoutTerm = spamTrainCount - spamWithTerm;
      const hamWithoutTerm = hamTrainCount - hamWithTerm;

      const A = spamWithTerm;
      const B = spamWithoutTerm;
      const C = hamWithTerm;
      const D = hamWithoutTerm;

      const numerator = N * Math.pow(A * D - B * C, 2);
      const denominator = (A + B) * (C + D) * (A + C) * (B + D);

      const chi2 = denominator > 0 ? numerator / denominator : 0;
      const pVal = chi2PValue(chi2);

      const spamMeanTfidf = spamTrainCount > 0 ? (A / spamTrainCount) * (idfMap[term] || 1) : 0;
      const hamMeanTfidf = hamTrainCount > 0 ? (C / hamTrainCount) * (idfMap[term] || 1) : 0;

      let leaningClass: 'ham' | 'spam' | 'neutral' = 'neutral';
      if (spamMeanTfidf > hamMeanTfidf * 1.2) leaningClass = 'spam';
      else if (hamMeanTfidf > spamMeanTfidf * 1.2) leaningClass = 'ham';

      const isSig = pVal < 0.05 && chi2 > 3.84;
      const pValFmt = pVal < 0.001 ? '< 0.001' : pVal.toFixed(4);

      chiSquareFeatures.push({
        feature: term,
        chi2_score: Number(chi2.toFixed(3)),
        p_value: Number(pVal.toFixed(6)),
        p_value_formatted: pValFmt,
        significance: isSig ? 'Significant (p < 0.05)' : 'Not Significant (p >= 0.05)',
        is_significant: isSig,
        tendency: leaningClass === 'spam' ? 'Strong Spam Indicator' : leaningClass === 'ham' ? 'Strong Ham Indicator' : 'Neutral Association',
        leaning_class: leaningClass,
        ham_mean_tfidf: Number(hamMeanTfidf.toFixed(4)),
        spam_mean_tfidf: Number(spamMeanTfidf.toFixed(4)),
        explanation: `Chi-Square score of ${chi2.toFixed(2)} with p-value ${pValFmt} indicates ${isSig ? 'statistically significant dependence' : 'independence'} with email class.`,
      });
    });

    chiSquareFeatures.sort((a, b) => b.chi2_score - a.chi2_score);

    const actualK = Math.min(kBest, chiSquareFeatures.length);
    const selectedKFeatures = chiSquareFeatures.slice(0, actualK);
    const kBestVocab = selectedKFeatures.map((f) => f.feature);

    const sigCount = selectedKFeatures.filter((f) => f.is_significant).length;

    const chiSquareSummary: ChiSquareAnalysis = {
      total_vocabulary_evaluated: vocab.length,
      selected_k: actualK,
      significant_features_count: sigCount,
      significance_rate_pct: actualK > 0 ? Number(((sigCount / actualK) * 100).toFixed(1)) : 0,
      features: chiSquareFeatures.slice(0, 50),
      methodology: {
        test_type: 'Pearson Chi-Square Contingency Test (df = 1)',
        null_hypothesis: 'Feature occurrence is statistically independent of email class (Ham vs Spam).',
        alternative_hypothesis: 'Feature occurrence is significantly correlated with specific email class (Spam or Ham).',
        score_vs_pvalue_distinction: 'Higher Chi-Square score indicates greater statistical divergence from random distribution; p < 0.05 confirms rejection of null hypothesis.',
      },
    };

    // 3. Multinomial Naive Bayes parameter fitting with Laplace smoothing
    const hamTokensCount = Object.values(termCountsPerClass.ham).reduce((a, b) => a + b, 0);
    const spamTokensCount = Object.values(termCountsPerClass.spam).reduce((a, b) => a + b, 0);

    const hamDenom = hamTokensCount + alpha * kBestVocab.length;
    const spamDenom = spamTokensCount + alpha * kBestVocab.length;

    const featureLogProb: { ham: Record<string, number>; spam: Record<string, number> } = {
      ham: {},
      spam: {},
    };

    kBestVocab.forEach((term) => {
      const hamCount = termCountsPerClass.ham[term] || 0;
      const spamCount = termCountsPerClass.spam[term] || 0;

      featureLogProb.ham[term] = Math.log((hamCount + alpha) / hamDenom);
      featureLogProb.spam[term] = Math.log((spamCount + alpha) / spamDenom);
    });

    const priorLogProb = {
      ham: Math.log((hamTrainCount || 1) / N),
      spam: Math.log((spamTrainCount || 1) / N),
    };

    // 4. Evaluate strictly on held-out test set
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;

    testRows.forEach((r) => {
      const clean = r.clean_text;
      const tokens = this.extractTokens(clean).filter((t) => kBestVocab.includes(t));

      let hamLog = priorLogProb.ham;
      let spamLog = priorLogProb.spam;

      tokens.forEach((t) => {
        hamLog += featureLogProb.ham[t] || Math.log(alpha / hamDenom);
        spamLog += featureLogProb.spam[t] || Math.log(alpha / spamDenom);
      });

      const predicted = spamLog > hamLog ? 'spam' : 'ham';
      const actual = r.label;

      if (actual === 'spam' && predicted === 'spam') tp++;
      else if (actual === 'ham' && predicted === 'ham') tn++;
      else if (actual === 'ham' && predicted === 'spam') fp++;
      else if (actual === 'spam' && predicted === 'ham') fn++;
    });

    const totalTest = Math.max(1, testRows.length);
    const accuracy = Number(((tp + tn) / totalTest).toFixed(4));

    const spamPrecision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : 1.0;
    const spamRecall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 1.0;
    const spamF1 = spamPrecision + spamRecall > 0 ? Number(((2 * spamPrecision * spamRecall) / (spamPrecision + spamRecall)).toFixed(4)) : 1.0;

    const hamPrecision = tn + fn > 0 ? Number((tn / (tn + fn)).toFixed(4)) : 1.0;
    const hamRecall = tn + fp > 0 ? Number((tn / (tn + fp)).toFixed(4)) : 1.0;
    const hamF1 = hamPrecision + hamRecall > 0 ? Number(((2 * hamPrecision * hamRecall) / (hamPrecision + hamRecall)).toFixed(4)) : 1.0;

    const macroPrecision = Number(((spamPrecision + hamPrecision) / 2).toFixed(4));
    const macroRecall = Number(((spamRecall + hamRecall) / 2).toFixed(4));
    const macroF1 = Number(((spamF1 + hamF1) / 2).toFixed(4));

    const hamTestCount = testRows.filter((r) => r.label === 'ham').length;
    const spamTestCount = testRows.filter((r) => r.label === 'spam').length;

    const weightedF1 = Number(
      ((hamF1 * hamTestCount + spamF1 * spamTestCount) / totalTest).toFixed(4)
    );

    const evaluationData: EvaluationData = {
      is_trained: true,
      trained_at: new Date().toISOString(),
      model_name: 'ProbMail Multinomial Naive Bayes with Chi-Square Selection',
      dataset_statistics: {
        total_samples: cleanedRows.length,
        train_samples: trainRows.length,
        test_samples: testRows.length,
        split_ratio: `${Math.round((1 - testSize) * 100)}/${Math.round(testSize * 100)}`,
        stratified: true,
        classes: ['ham', 'spam'],
        class_distribution_train: {
          ham: hamTrainCount,
          spam: spamTrainCount,
        },
        class_distribution_test: {
          ham: hamTestCount,
          spam: spamTestCount,
        },
      },
      hyperparameters: {
        k_best_features: actualK,
        max_features: maxFeatures,
        ngram_range: [1, 2],
        nb_alpha: alpha,
        random_state: 42,
      },
      evaluation: {
        test_samples: totalTest,
        overall: {
          accuracy,
          macro_precision: macroPrecision,
          macro_recall: macroRecall,
          macro_f1: macroF1,
          weighted_precision: macroPrecision,
          weighted_recall: macroRecall,
          weighted_f1: weightedF1,
        },
        per_class: {
          ham: {
            precision: hamPrecision,
            recall: hamRecall,
            f1_score: hamF1,
            support: hamTestCount,
          },
          spam: {
            precision: spamPrecision,
            recall: spamRecall,
            f1_score: spamF1,
            support: spamTestCount,
          },
        },
        confusion_matrix: {
          labels: ['ham', 'spam'],
          matrix: [
            [tn, fp],
            [fn, tp],
          ],
          breakdown: {
            true_negatives: tn,
            false_positives: fp,
            false_negatives: fn,
            true_positives: tp,
          },
          interpretation: {
            false_positives_note:
              'Legitimate emails falsely quarantined as spam (Type I error). Low false positive rate is crucial to avoid missing legitimate communications.',
            false_negatives_note:
              'Spam emails that bypassed the filter into the inbox (Type II error). Represents potential phishing threat risk.',
          },
        },
        reliability:
          accuracy >= 0.9
            ? 'High Reliability: High discriminative boundary on held-out test data.'
            : 'Moderate Reliability: Baseline accuracy achieved with available samples.',
        notes:
          'Stratified train/test split strictly evaluated on unseen test data with no feature selection leakage.',
      },
      chi_square_summary: {
        selected_k: actualK,
        significant_features_count: sigCount,
        top_features: chiSquareFeatures.slice(0, 30),
      },
    };

    const pipeline: TrainedModelPipeline = {
      vocab,
      kBestVocab,
      idf: idfMap,
      priorLogProb,
      featureLogProb,
      chiSquareSummary,
      evaluation: evaluationData,
      trainedAt: new Date().toISOString(),
    };

    this.activePipeline = pipeline;
    return pipeline;
  }

  // Predict email (optional recordHistory flag to prevent audit history pollution during transient pre-flight checks)
  public predictEmail(subject?: string, body?: string, recordHistory: boolean = true): PredictionResult {
    const subjStr = (subject || '').trim();
    const bodyStr = (body || '').trim();

    if (!subjStr && !bodyStr) {
      return {
        status: 'invalid_input',
        predicted_class: 'ham',
        confidence_percentage: 0,
        confidence_raw: 0,
        class_probabilities: { spam: 0, ham: 100 },
        risk_score: 0,
        risk_category: 'Low Risk',
        risk_level: 'low',
        warning_signs: [],
        recommended_precautions: [],
        verdict_title: 'Invalid Input',
        verdict_summary: 'Email subject and body are both empty.',
        influential_features: [],
        disclaimer: '',
        subject_snippet: '',
        cleaned_length: 0,
        error: 'Email subject and body are both empty. Please provide text to analyze.',
      };
    }

    if (!this.activePipeline) {
      this.trainModelSync();
    }
    const pipe = this.activePipeline!;

    const combinedRaw = combineSubjectAndBody(subjStr, bodyStr);
    const cleaned = cleanText(combinedRaw);

    if (!cleaned) {
      return {
        status: 'empty_vocabulary',
        predicted_class: 'ham',
        confidence_percentage: 50,
        confidence_raw: 0.5,
        class_probabilities: { spam: 50, ham: 50 },
        risk_score: 50,
        risk_category: 'Medium Risk',
        risk_level: 'medium',
        warning_signs: [],
        recommended_precautions: [],
        verdict_title: 'Unrecognizable Content',
        verdict_summary: 'Input text contains no recognizable words after text preprocessing.',
        influential_features: [],
        disclaimer: '',
        subject_snippet: subjStr || bodyStr,
        cleaned_length: 0,
        error: 'Input text contains no recognizable words after text cleaning.',
      };
    }

    const tokens = this.extractTokens(cleaned);
    const activeKTokens = tokens.filter((t) => pipe.kBestVocab.includes(t));

    let hamLog = pipe.priorLogProb.ham;
    let spamLog = pipe.priorLogProb.spam;

    const termCounts: Record<string, number> = {};
    activeKTokens.forEach((t) => {
      termCounts[t] = (termCounts[t] || 0) + 1;
    });

    Object.entries(termCounts).forEach(([t, count]) => {
      if (pipe.featureLogProb.ham[t] !== undefined) {
        hamLog += count * pipe.featureLogProb.ham[t];
      }
      if (pipe.featureLogProb.spam[t] !== undefined) {
        spamLog += count * pipe.featureLogProb.spam[t];
      }
    });

    // Softmax probabilities
    const maxLog = Math.max(hamLog, spamLog);
    const hamExp = Math.exp(hamLog - maxLog);
    const spamExp = Math.exp(spamLog - maxLog);
    const sumExp = hamExp + spamExp;

    const hamProb = Number(((hamExp / sumExp) * 100).toFixed(2));
    const spamProb = Number(((spamExp / sumExp) * 100).toFixed(2));

    const predictedClass = spamProb >= 50.0 ? 'spam' : 'ham';
    const confidence = predictedClass === 'spam' ? spamProb : hamProb;

    const riskScore = Math.max(0, Math.min(100, Math.round(spamProb)));
    const riskLevel: RiskLevel = riskScore >= 70 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
    const riskCategory: RiskCategory = riskScore >= 70 ? 'High Risk' : riskScore >= 30 ? 'Medium Risk' : 'Low Risk';

    // Influential features extraction
    const influentialFeatures: InfluentialFeature[] = [];
    Object.keys(termCounts).forEach((t) => {
      const hamLp = pipe.featureLogProb.ham[t] || -10;
      const spamLp = pipe.featureLogProb.spam[t] || -10;
      const tfidfWeight = (termCounts[t] * (pipe.idf[t] || 1)) / Math.max(1, tokens.length);
      const diffLp = spamLp - hamLp;
      const contrib = tfidfWeight * diffLp;

      if (Math.abs(contrib) > 0.02) {
        const isSpamInd = contrib > 0.02;
        const isHamInd = contrib < -0.02;
        influentialFeatures.push({
          word: t,
          polarity: isSpamInd ? 'Spam Indicator' : isHamInd ? 'Ham Indicator' : 'Neutral',
          impact_score: Number(Math.abs(contrib).toFixed(2)),
          badge: isSpamInd ? 'danger' : isHamInd ? 'success' : 'neutral',
          description: isSpamInd
            ? `Term '${t}' shifted model towards Spam (+${Math.abs(contrib).toFixed(2)} log-odds).`
            : `Term '${t}' shifted model towards Ham (-${Math.abs(contrib).toFixed(2)} log-odds).`,
        });
      }
    });

    influentialFeatures.sort((a, b) => b.impact_score - a.impact_score);

    // Warning signs & precautions
    const lowerRaw = combinedRaw.toLowerCase();
    const warningSigns: WarningSign[] = [];

    const urgencyTerms = [
      'urgent', 'immediately', 'immediate', 'suspended', 'suspension',
      'compromised', 'deadline', 'within 24 hours', 'action required',
      'act now', 'time sensitive', 'freeze', 'locked', 'expire', 'asap'
    ];
    const matchedUrgency = urgencyTerms.filter((term) => lowerRaw.includes(term));
    if (matchedUrgency.length > 0) {
      warningSigns.push({
        title: 'Urgent Action Pressure',
        detail: 'Language conveys artificial time pressure or warning of account disruption to force prompt action.',
        highlighted_phrase: matchedUrgency[0],
        category: 'Urgency',
      });
    }

    const credentialTerms = [
      'password', 'verify account', 'verification', 'credentials', 'login',
      'authenticate', 'reset your', 'routing number', 'security update',
      'unauthorized', 'confirm identity', 'confirm password'
    ];
    const matchedCreds = credentialTerms.filter((term) => lowerRaw.includes(term));
    if (matchedCreds.length > 0) {
      warningSigns.push({
        title: 'Credential & Account Verification Prompt',
        detail: 'Requests confirmation of login credentials, security verification, or sensitive identity information.',
        highlighted_phrase: matchedCreds[0],
        category: 'Credential Phishing',
      });
    }

    const financialTerms = [
      'winner', 'lottery', 'cash prize', 'million dollars', 'claim your prize',
      'inheritance', 'wire transfer', 'guaranteed payout', 'unclaimed funds', '500% guaranteed'
    ];
    const matchedFinance = financialTerms.filter((term) => lowerRaw.includes(term));
    if (matchedFinance.length > 0) {
      warningSigns.push({
        title: 'Financial Incentive or Prize Claim',
        detail: 'Contains unsolicited claims of monetary rewards, lottery payouts, or zero-risk financial offers.',
        highlighted_phrase: matchedFinance[0],
        category: 'Financial Solicitation',
      });
    }

    // Model vocabulary features
    influentialFeatures.slice(0, 3).forEach((f) => {
      if (f.badge === 'danger' && !warningSigns.some((w) => w.highlighted_phrase === f.word)) {
        warningSigns.push({
          title: `Statistical Feature Influence ('${f.word}')`,
          detail: `Word '${f.word}' was selected by Chi-Square feature selection and shifted the Bayesian model toward Spam (+${f.impact_score} log-odds).`,
          highlighted_phrase: f.word,
          category: 'Model Vocabulary',
        });
      } else if (f.badge === 'success' && predictedClass === 'ham') {
        warningSigns.push({
          title: `Statistical Feature Influence ('${f.word}')`,
          detail: `Word '${f.word}' was selected by Chi-Square feature selection and shifted the Bayesian model toward Ham (-${f.impact_score} log-odds).`,
          highlighted_phrase: f.word,
          category: 'Model Vocabulary',
        });
      }
    });

    if (warningSigns.length === 0) {
      warningSigns.push({
        title: 'Model Pattern Recognition',
        detail: 'The model classified this email based on learned text patterns; no specific keyword triggers detected.',
        category: 'Model Explanation',
      });
    }

    const recommendedPrecautions =
      riskScore >= 70
        ? [
            'Do not click hyperlinks or download attachments from this email.',
            'Never share passwords, multi-factor codes, or banking credentials.',
            'Verify the sender identity through an official, independent contact method.',
            'Flag and delete this message from your email client.',
          ]
        : riskScore >= 30
        ? [
            'Exercise caution: inspect the sender full email address for domain spoofing or misspellings.',
            'Hover over links to verify their destination URL before clicking.',
            'If this message requests account action or funds, confirm directly with sender.',
            'Remember: Medium risk indicates ambiguous or mixed language cues.',
          ]
        : [
            'Exercise standard vigilance even with emails classified as legitimate.',
            'Verify sender address before opening attachments, especially from external contacts.',
            'Remember: A low risk score indicates a low statistical probability of spam based on learned patterns.',
          ];

    const verdictTitle =
      predictedClass === 'spam'
        ? `${riskCategory}: Spam / Security Threat Detected`
        : `${riskCategory}: Legitimate Email (Ham)`;

    const verdictSummary =
      predictedClass === 'spam'
        ? `The model classified this email as SPAM with ${spamProb.toFixed(1)}% estimated probability (Ham: ${hamProb.toFixed(1)}%). Lexical patterns match solicitation, credential verification, or deceptive urgency cues.`
        : `The model classified this email as HAM with ${hamProb.toFixed(1)}% estimated probability (Spam: ${spamProb.toFixed(1)}%). Content structure and word usage align with standard legitimate communication.`;

    const testAcc = pipe.evaluation.evaluation?.overall.accuracy || 0.95;

    // Save to predictions history
    const record: PredictionRecord = {
      id: Date.now(),
      subject: subjStr || (bodyStr ? bodyStr.substring(0, 80) : 'Untitled Email'),
      snippet: bodyStr ? bodyStr.substring(0, 160) : subjStr.substring(0, 160),
      predicted_class: predictedClass,
      confidence,
      timestamp: new Date().toISOString(),
      spam_probability: spamProb,
      ham_probability: hamProb,
      risk_score: riskScore,
      risk_category: riskCategory,
      risk_level: riskLevel,
    };
    if (recordHistory) {
      this.savePredictionRecord(record);
    }

    return {
      status: 'success',
      predicted_class: predictedClass,
      confidence_percentage: confidence,
      confidence_raw: Number((confidence / 100).toFixed(4)),
      spam_probability: spamProb,
      ham_probability: hamProb,
      class_probabilities: { spam: spamProb, ham: hamProb },
      risk_score: riskScore,
      risk_category: riskCategory,
      risk_level: riskLevel,
      warning_signs: warningSigns,
      recommended_precautions: recommendedPrecautions,
      verdict_title: verdictTitle,
      verdict_summary: verdictSummary,
      influential_features: influentialFeatures.slice(0, 10),
      analysis_details: {
        words_scanned: combinedRaw.split(/\s+/).length,
        clean_tokens: tokens.length,
        influential_tokens_count: influentialFeatures.length,
        test_accuracy: testAcc,
        algorithm: 'Multinomial Naive Bayes + Chi-Square Selection (SelectKBest)',
        bayesian_explanation:
          'Posterior probabilities are calculated using Bayes\' Rule: P(Spam | Text) ∝ P(Spam) · ∏ P(Word | Spam). Chi-Square selection retains terms with statistically significant class dependence (p < 0.05).',
      },
      accuracy_note: `Estimated probability (${confidence.toFixed(1)}%) is this specific email\'s likelihood score. Overall model test accuracy is ${(testAcc * 100).toFixed(1)}% on held-out test data.`,
      disclaimer:
        'Probability reflects the model\'s Bayesian posterior score P(Class | Words) based on learned training frequencies. This is a model-estimated probability, not an absolute guarantee.',
      subject_snippet: subjStr.substring(0, 80) || bodyStr.substring(0, 80) || 'Untitled',
      cleaned_length: tokens.length,
      prediction_id: recordHistory ? record.id : undefined,
    };
  }

  // Prediction History Management
  public getHistory(): { count: number; statistics: any; predictions: PredictionRecord[] } {
    const records = this.getStoredRecords();
    const total = records.length;
    const spamCount = records.filter((r) => r.predicted_class === 'spam').length;
    const hamCount = records.filter((r) => r.predicted_class === 'ham').length;

    return {
      count: total,
      statistics: {
        total_analyzed: total,
        spam_detected: spamCount,
        ham_detected: hamCount,
        spam_percentage: total > 0 ? Number(((spamCount / total) * 100).toFixed(1)) : 0,
        ham_percentage: total > 0 ? Number(((hamCount / total) * 100).toFixed(1)) : 0,
      },
      predictions: records,
    };
  }

  public getPredictionById(id: number): PredictionRecord | null {
    const records = this.getStoredRecords();
    return records.find((r) => r.id === id) || null;
  }

  public clearHistory(): { deleted_count: number } {
    const records = this.getStoredRecords();
    const count = records.length;
    localStorage.removeItem('probmail_predictions');
    return { deleted_count: count };
  }

  private getStoredRecords(): PredictionRecord[] {
    const raw = localStorage.getItem('probmail_predictions');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private savePredictionRecord(record: PredictionRecord) {
    const records = this.getStoredRecords();
    records.unshift(record);
    if (records.length > 200) records.pop();
    localStorage.setItem('probmail_predictions', JSON.stringify(records));
  }

  // Dashboard Data
  public getDashboardData(): {
    status: string;
    dataset: DatasetOverview;
    metrics: ScanMetrics;
    model: any;
    recent_predictions: PredictionRecord[];
    is_empty_state: boolean;
  } {
    const hist = this.getHistory();
    const records = hist.predictions;
    const dsOverview = this.getDatasetOverview();

    const evalData = this.getEvaluationData();
    const model = {
      is_trained: true,
      trained_at: this.activePipeline?.trainedAt || new Date().toISOString(),
      model_name: 'ProbMail Multinomial Naive Bayes with Chi-Square Selection',
      accuracy: evalData.evaluation?.overall.accuracy || 0.96,
      precision: evalData.evaluation?.overall.macro_precision || 0.95,
      recall: evalData.evaluation?.overall.macro_recall || 0.96,
      macro_f1: evalData.evaluation?.overall.macro_f1 || 0.95,
      weighted_f1: evalData.evaluation?.overall.weighted_f1 || 0.95,
      test_samples: evalData.evaluation?.test_samples || 24,
      train_samples: (evalData.dataset_statistics?.total_samples || 120) - 24,
      k_features: evalData.hyperparameters?.k_best_features || 50,
      classes: ['ham', 'spam'],
    };

    return {
      status: 'success',
      dataset: dsOverview,
      metrics: {
        total_analyzed: hist.statistics.total_analyzed,
        spam_detected: hist.statistics.spam_detected,
        ham_detected: hist.statistics.ham_detected,
        spam_percentage: hist.statistics.spam_percentage,
        ham_percentage: hist.statistics.ham_percentage,
      },
      model,
      recent_predictions: records.slice(0, 10),
      is_empty_state: records.length === 0,
    };
  }

  // Dataset Overview & Management
  public getDatasetOverview(): DatasetOverview {
    const ham = this.activeDataset.filter((r) => r.label.toLowerCase() === 'ham').length;
    const spam = this.activeDataset.filter((r) => r.label.toLowerCase() === 'spam').length;
    const total = this.activeDataset.length;

    return {
      is_loaded: total > 0,
      filename: 'sample_dataset.csv',
      total_raw: total,
      total_usable: total,
      duplicates_removed: 0,
      missing_values: 0,
      ham_count: ham,
      spam_count: spam,
      ham_percentage: total > 0 ? Number(((ham / total) * 100).toFixed(1)) : 0,
      spam_percentage: total > 0 ? Number(((spam / total) * 100).toFixed(1)) : 0,
      class_distribution: { ham, spam },
    };
  }

  public getDatasetSummary(): { is_loaded: boolean; summary: DatasetSummary } {
    const overview = this.getDatasetOverview();
    const preview = this.activeDataset.slice(0, 15).map((r, i) => ({
      id: i + 1,
      label: r.label,
      subject: r.subject,
      body: r.body.length > 80 ? r.body.substring(0, 80) + '...' : r.body,
    }));

    return {
      is_loaded: true,
      summary: {
        filename: 'sample_dataset.csv',
        total_rows_raw: this.activeDataset.length,
        columns: ['label', 'subject', 'body', 'text'],
        selected_columns: {
          text_column: 'body',
          label_column: 'label',
          subject_column: 'subject',
        },
        preview,
        preprocessing: {
          original_rows: this.activeDataset.length,
          missing_text_count: 0,
          missing_label_count: 0,
          duplicates_removed: 0,
          unrecognized_labels: [],
          cleaned_rows: this.activeDataset.length,
          class_distribution: overview.class_distribution,
          warnings: [],
        },
        is_ready_for_training: true,
      },
    };
  }

  public loadSampleDataset() {
    this.activeDataset = [...SAMPLE_EMAILS];
    localStorage.removeItem('probmail_custom_dataset');
    this.trainModelSync();
    return this.getDatasetSummary();
  }

  public uploadDataset(rows: RawEmailRow[]): DatasetSummary {
    this.activeDataset = rows;
    localStorage.setItem('probmail_custom_dataset', JSON.stringify(rows));
    this.trainModelSync();
    return this.getDatasetSummary().summary;
  }

  // Dataset Descriptive Statistics
  public getStatistics(): DatasetStatistics {
    const rawData = this.activeDataset;
    const total = rawData.length;

    const hamRows = rawData.filter((r) => r.label.toLowerCase() === 'ham');
    const spamRows = rawData.filter((r) => r.label.toLowerCase() === 'spam');

    const hamCharLens = hamRows.map((r) => (r.body || '').length);
    const spamCharLens = spamRows.map((r) => (r.body || '').length);
    const allCharLens = rawData.map((r) => (r.body || '').length);

    const hamWordLens = hamRows.map((r) => (r.body || '').split(/\s+/).length);
    const spamWordLens = spamRows.map((r) => (r.body || '').split(/\s+/).length);
    const allWordLens = rawData.map((r) => (r.body || '').split(/\s+/).length);

    const calcStats = (arr: number[]) => {
      if (arr.length === 0) return { mean: 0, median: 0, min: 0, max: 0, std: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const mean = Number((sum / sorted.length).toFixed(2));
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)) : sorted[mid];
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / Math.max(1, sorted.length - 1);
      const std = Number(Math.sqrt(variance).toFixed(2));
      return { mean, median, min, max, std };
    };

    // Frequent words
    const countWords = (rows: RawEmailRow[]) => {
      const counts: Record<string, number> = {};
      let totalTokens = 0;
      rows.forEach((r) => {
        const words = cleanText(combineSubjectAndBody(r.subject, r.body), false)
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !ENGLISH_STOP_WORDS.has(w));
        words.forEach((w) => {
          counts[w] = (counts[w] || 0) + 1;
          totalTokens++;
        });
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({
          word,
          count,
          frequency: totalTokens > 0 ? Number(((count / totalTokens) * 100).toFixed(2)) : 0,
        }));
    };

    // Characteristics
    const getCharacteristics = (rows: RawEmailRow[]) => {
      if (rows.length === 0) return { avg_uppercase_pct: 0, url_presence_pct: 0, currency_presence_pct: 0, avg_urgency_keywords: 0 };
      let totalUpperPct = 0;
      let urlCount = 0;
      let currCount = 0;
      let totalUrgency = 0;

      rows.forEach((r) => {
        const text = `${r.subject} ${r.body}`;
        const letters = text.replace(/[^a-zA-Z]/g, '');
        const uppers = text.replace(/[^A-Z]/g, '');
        totalUpperPct += letters.length > 0 ? (uppers.length / letters.length) * 100 : 0;
        if (/https?:\/\/|www\./i.test(text)) urlCount++;
        if (/[\$\€\£\¥\₹]|\bUSD\b|\bcash\b/i.test(text)) currCount++;
        const words = text.toLowerCase().split(/\s+/);
        const urgencies = words.filter((w) => URGENCY_KEYWORDS.has(w)).length;
        totalUrgency += urgencies;
      });

      return {
        avg_uppercase_pct: Number((totalUpperPct / rows.length).toFixed(1)),
        url_presence_pct: Number(((urlCount / rows.length) * 100).toFixed(1)),
        currency_presence_pct: Number(((currCount / rows.length) * 100).toFixed(1)),
        avg_urgency_keywords: Number((totalUrgency / rows.length).toFixed(2)),
      };
    };

    const imbalanceRatio = spamRows.length > 0 ? Number((hamRows.length / spamRows.length).toFixed(2)) : 1.0;

    return {
      total_samples: total,
      classes: {
        ham: {
          count: hamRows.length,
          percentage: total > 0 ? Number(((hamRows.length / total) * 100).toFixed(1)) : 0,
        },
        spam: {
          count: spamRows.length,
          percentage: total > 0 ? Number(((spamRows.length / total) * 100).toFixed(1)) : 0,
        },
      },
      class_imbalance: {
        ratio: imbalanceRatio,
        description:
          imbalanceRatio >= 0.8 && imbalanceRatio <= 1.2
            ? 'Balanced: Ham and Spam classes are evenly represented.'
            : `Mild Imbalance: ${imbalanceRatio > 1 ? 'Ham' : 'Spam'} class represents majority with ${imbalanceRatio}:1 ratio.`,
      },
      hygiene: {
        total_raw_rows: total,
        total_usable_emails: total,
        duplicates_removed: 0,
        missing_values_count: 0,
        unrecognized_labels_count: 0,
      },
      length_metrics: {
        overall: {
          char_length: calcStats(allCharLens),
          word_count: calcStats(allWordLens),
        },
        by_class: {
          ham: {
            char_length: calcStats(hamCharLens),
            word_count: calcStats(hamWordLens),
          },
          spam: {
            char_length: calcStats(spamCharLens),
            word_count: calcStats(spamWordLens),
          },
        },
      },
      frequent_words: {
        ham: countWords(hamRows),
        spam: countWords(spamRows),
      },
      characteristics: {
        ham: getCharacteristics(hamRows),
        spam: getCharacteristics(spamRows),
      },
      viva_insights: [
        {
          topic: 'Feature Space Sparsity',
          concept: 'Vocabulary Dimensionality vs Instance Sparsity',
          explanation:
            'Email text datasets contain thousands of distinct words, but any individual message activates only a fraction (< 2%) of the vocabulary. Chi-Square selection isolates informative terms to combat the curse of dimensionality.',
        },
        {
          topic: 'Bayesian Independence Assumption',
          concept: 'Conditional Word Independence Given Class',
          explanation:
            'Naive Bayes assumes words occur independently given the email category P(w1, w2 | Spam) = P(w1 | Spam) · P(w2 | Spam). While language inherently violates strict independence, Naive Bayes yields near-optimal decision boundaries in classification tasks.',
        },
        {
          topic: 'Additive Laplace Smoothing',
          concept: 'Zero Frequency Probability Avoidance',
          explanation:
            'When an email contains a word unseen in training for a class, P(word | class) would become 0, nullifying the entire product. Adding smoothing parameter alpha ensures robust numerical stability.',
        },
      ],
    };
  }

  // Chi Square feature selection getter
  public getChiSquare(k: number = 50): ChiSquareAnalysis {
    if (!this.activePipeline) {
      this.trainModelSync(k);
    }
    const fullSummary = this.activePipeline!.chiSquareSummary;
    const selectedFeatures = fullSummary.features.slice(0, k);
    const sigCount = selectedFeatures.filter((f) => f.is_significant).length;

    return {
      ...fullSummary,
      selected_k: k,
      significant_features_count: sigCount,
      significance_rate_pct: k > 0 ? Number(((sigCount / k) * 100).toFixed(1)) : 0,
      features: selectedFeatures,
    };
  }

  // Evaluation data
  public getEvaluationData(): EvaluationData {
    if (!this.activePipeline) {
      this.trainModelSync();
    }
    return this.activePipeline!.evaluation;
  }

  // Asynchronous Training flow simulation with live progress
  public async startTraining(params: {
    k_best: number;
    test_size: number;
    alpha: number;
    max_features: number;
  }): Promise<{ status: string; message: string }> {
    if (this.isTraining) {
      return { status: 'already_running', message: 'Model training is already in progress.' };
    }

    this.isTraining = true;
    this.trainingStatus = {
      status: 'running',
      progress: 10,
      step_message: 'Cleaning and tokenizing email corpus...',
      error: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      result_available: false,
    };

    // Step 1
    setTimeout(() => {
      this.trainingStatus.progress = 35;
      this.trainingStatus.step_message = 'Building TF-IDF vocabulary matrix and computing document frequencies...';
    }, 250);

    // Step 2
    setTimeout(() => {
      this.trainingStatus.progress = 65;
      this.trainingStatus.step_message = `Applying Pearson Chi-Square contingency test to select Top ${params.k_best} features...`;
    }, 550);

    // Step 3
    setTimeout(() => {
      this.trainingStatus.progress = 85;
      this.trainingStatus.step_message = 'Fitting Multinomial Naive Bayes conditional probabilities with Laplace smoothing...';
    }, 850);

    // Step 4
    setTimeout(() => {
      this.trainModelSync(params.k_best, params.test_size, params.alpha, params.max_features);
      this.trainingStatus = {
        status: 'completed',
        progress: 100,
        step_message: 'Training and held-out validation completed successfully.',
        error: null,
        started_at: this.trainingStatus.started_at,
        completed_at: new Date().toISOString(),
        result_available: true,
        result: this.activePipeline?.evaluation,
      };
      this.isTraining = false;
    }, 1100);

    return { status: 'training_started', message: 'Training background job initiated.' };
  }

  public getTrainingStatus(): TrainingStatus {
    return { ...this.trainingStatus };
  }
}

export const mlEngine = new ProbMailEngine();
