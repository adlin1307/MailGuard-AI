import React, { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
  ExternalLink,
  Copy,
  Check,
  FileDown,
  RefreshCw,
  RotateCcw,
  Scale,
  FileText,
} from 'lucide-react';

export interface StatisticalFeatureItem {
  word: string;
  polarity?: string;
  predicted_impact?: string;
  badge?: 'danger' | 'success' | 'neutral';
  impact_score?: number;
  log_odds?: number;
  chi2_score?: number;
  p_value?: number;
  p_value_formatted?: string;
  training_association?: string;
  prediction_contribution?: string;
  interpretation?: string;
  is_significant?: boolean;
  significance_status?: string;
  class_association?: string;
  description?: string;
}

export interface StatisticalWarningSign {
  title: string;
  detail: string;
  highlighted_phrase?: string;
  category?: string;
}

export interface StatisticalAnalysisViewProps {
  predictedClass: 'spam' | 'ham';
  confidencePercentage?: number;
  spamProbability?: number;
  hamProbability?: number;
  riskScore?: number;
  riskCategory?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  verdictTitle?: string;
  verdictSummary?: string;
  explanation?: string;
  influentialFeatures?: StatisticalFeatureItem[];
  warningSigns?: StatisticalWarningSign[];
  suspiciousPhrases?: string[];
  detectedLinks?: string[];
  chi2Summary?: {
    method?: string;
    k_selected?: number;
    alpha_threshold?: number;
    description?: string;
    distinction_note?: string;
  };
  recommendedPrecautions?: string[];
  uploadInfo?: {
    filename: string;
    file_type?: string;
    label?: string;
  };
  showActions?: boolean;
  onDownloadReport?: () => void;
  downloadingReport?: boolean;
  reportError?: string | null;
  onClear?: () => void;
  compactMode?: boolean;
}

const CircularRiskGauge: React.FC<{ score: number; level: 'low' | 'medium' | 'high' }> = ({ score, level }) => {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  const strokeColor =
    level === 'high' ? '#f43f5e' : level === 'medium' ? '#f59e0b' : '#10b981';
  const trackColor =
    level === 'high' ? 'rgba(244, 63, 94, 0.2)' : level === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)';
  const textColor =
    level === 'high' ? 'text-rose-400' : level === 'medium' ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={trackColor}
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={strokeColor}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className={`text-2xl font-black tracking-tight ${textColor}`}>{safeScore}</span>
        <span className="text-[10px] text-slate-400 font-mono -mt-1">/ 100</span>
      </div>
    </div>
  );
};

export const StatisticalAnalysisView: React.FC<StatisticalAnalysisViewProps> = ({
  predictedClass,
  confidencePercentage,
  spamProbability,
  hamProbability,
  riskScore,
  riskCategory,
  riskLevel,
  verdictTitle,
  verdictSummary,
  explanation,
  influentialFeatures = [],
  warningSigns = [],
  suspiciousPhrases = [],
  detectedLinks = [],
  chi2Summary,
  recommendedPrecautions = [],
  uploadInfo,
  showActions = false,
  onDownloadReport,
  downloadingReport = false,
  reportError,
  onClear,
  compactMode = false,
}) => {
  const [copied, setCopied] = useState(false);

  // Derive normalized probabilities consistently summing to 100%
  const derivedSpamProb =
    spamProbability !== undefined
      ? Number(spamProbability.toFixed(1))
      : predictedClass === 'spam'
      ? Number((confidencePercentage ?? 95).toFixed(1))
      : Number((100 - (confidencePercentage ?? 95)).toFixed(1));

  const derivedHamProb =
    hamProbability !== undefined
      ? Number(hamProbability.toFixed(1))
      : Number((100 - derivedSpamProb).toFixed(1));

  // Risk score is derived directly and consistently from Spam probability
  const safeRiskScore =
    riskScore !== undefined
      ? Math.max(0, Math.min(100, Math.round(riskScore)))
      : Math.max(0, Math.min(100, Math.round(derivedSpamProb)));

  const safeRiskLevel: 'low' | 'medium' | 'high' =
    riskLevel ?? (safeRiskScore >= 70 ? 'high' : safeRiskScore >= 30 ? 'medium' : 'low');

  const safeRiskCategory =
    riskCategory ??
    (safeRiskLevel === 'high' ? 'High Risk' : safeRiskLevel === 'medium' ? 'Medium Risk' : 'Low Risk');

  const confidenceDisplay =
    confidencePercentage !== undefined
      ? confidencePercentage.toFixed(1)
      : (predictedClass === 'spam' ? derivedSpamProb : derivedHamProb).toFixed(1);

  // Short, plain-English summary of prediction
  const plainEnglishSummary =
    verdictSummary ||
    explanation ||
    (predictedClass === 'spam'
      ? `Classified as SPAM with ${derivedSpamProb}% estimated probability. Content patterns align with solicitation, credential verification, or urgency cues.`
      : `Classified as HAM with ${derivedHamProb}% estimated probability. Content structure aligns with standard interpersonal or workplace communication.`);

  const handleCopyVerdict = () => {
    const text = `ProbMail Security Audit: ${predictedClass.toUpperCase()} (${safeRiskCategory} - Score: ${safeRiskScore}/100)
Spam Probability: ${derivedSpamProb}% | Ham Probability: ${derivedHamProb}%
Reason: ${plainEnglishSummary}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const alphaThreshold = chi2Summary?.alpha_threshold ?? 0.05;

  // Single concise safety recommendation tailored to risk level
  const conciseRecommendation =
    recommendedPrecautions && recommendedPrecautions.length > 0
      ? recommendedPrecautions[0]
      : safeRiskScore >= 70
      ? 'Do not click hyperlinks, open attachments, or disclose credentials. Verify the sender identity through an independent channel.'
      : safeRiskScore >= 30
      ? "Inspect the sender's full email address domain and hover over links to verify destinations before taking action."
      : 'Exercise standard vigilance: verify sender identity if unexpected requests for sensitive actions or payments arise.';

  return (
    <div className={`space-y-4 text-slate-200 ${compactMode ? 'text-xs' : 'text-sm'}`}>
      {/* Verdict Header / Source Info Bar */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            ML Security Analysis
          </span>
          {uploadInfo ? (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-700/80">
              <FileText className="w-3 h-3 text-cyan-400" />
              <span>
                {uploadInfo.label || 'File Upload'}: {uploadInfo.filename}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800/80 text-slate-400 border border-slate-700">
              Direct Text Evaluation
            </span>
          )}
        </div>
        <button
          onClick={handleCopyVerdict}
          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 transition"
          title="Copy verdict to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy Verdict'}</span>
        </button>
      </div>

      {/* 1. VERDICT */}
      <div
        className={`p-4 rounded-xl border flex items-center space-x-4 ${
          predictedClass === 'spam'
            ? 'bg-rose-950/40 border-rose-700/80 text-rose-300'
            : 'bg-emerald-950/40 border-emerald-700/80 text-emerald-300'
        }`}
      >
        <div
          className={`p-3 rounded-lg border shrink-0 ${
            predictedClass === 'spam'
              ? 'bg-rose-900/40 border-rose-600 text-rose-400'
              : 'bg-emerald-900/40 border-emerald-600 text-emerald-400'
          }`}
        >
          {predictedClass === 'spam' ? (
            <ShieldAlert className="w-8 h-8" />
          ) : (
            <ShieldCheck className="w-8 h-8" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono uppercase tracking-wider opacity-80">
            Classification Verdict
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight truncate">
            {predictedClass === 'spam' ? 'SPAM / SUSPICIOUS' : 'HAM / LEGITIMATE'}
          </div>
          <p className="text-xs mt-1 text-slate-300 font-sans leading-relaxed">
            {plainEnglishSummary}
          </p>
          <div className="text-[11px] mt-1 font-mono text-slate-400">
            Model Confidence: <span className="font-bold text-slate-200">{confidenceDisplay}%</span>
          </div>
        </div>
      </div>

      {/* 2. MODEL PROBABILITY */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Model Probability</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            Sum: 100.0%
          </span>
        </div>
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-emerald-400 font-semibold flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>Ham: {derivedHamProb}%</span>
          </span>
          <span className="text-rose-400 font-semibold flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
            <span>Spam: {derivedSpamProb}%</span>
          </span>
        </div>
        <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${derivedHamProb}%` }}
            title={`Ham: ${derivedHamProb}%`}
          />
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${derivedSpamProb}%` }}
            title={`Spam: ${derivedSpamProb}%`}
          />
        </div>
        <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
          The classifier calculates Spam and Ham probabilities using Bayes' Rule across all present words based on training frequencies. Probabilities reflect model likelihood, not test accuracy or an absolute safety guarantee.
        </p>
      </div>

      {/* 3. RISK SCORE */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>Email Risk Score</span>
          </span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
              safeRiskLevel === 'high'
                ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                : safeRiskLevel === 'medium'
                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
            }`}
          >
            {safeRiskCategory}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
          <CircularRiskGauge score={safeRiskScore} level={safeRiskLevel} />
          <div className="space-y-1.5 text-xs text-slate-300 flex-1 w-full">
            <div className="text-xs text-slate-400">Risk Tier Thresholds:</div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
              <div
                className={`p-1.5 rounded border text-center ${
                  safeRiskLevel === 'low'
                    ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300 font-bold'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500'
                }`}
              >
                0–29 Low
              </div>
              <div
                className={`p-1.5 rounded border text-center ${
                  safeRiskLevel === 'medium'
                    ? 'border-amber-700 bg-amber-950/40 text-amber-300 font-bold'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500'
                }`}
              >
                30–69 Med
              </div>
              <div
                className={`p-1.5 rounded border text-center ${
                  safeRiskLevel === 'high'
                    ? 'border-rose-700 bg-rose-950/40 text-rose-300 font-bold'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500'
                }`}
              >
                70–100 High
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight pt-1">
              Risk score ({safeRiskScore}/100) directly reflects the model's estimated Spam probability ({derivedSpamProb}%).
            </p>
          </div>
        </div>
      </div>

      {/* 4. WHY THIS RESULT? (INFLUENTIAL WORDS) */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Why this result?
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Model-Derived Influential Words
          </span>
        </div>

        {influentialFeatures && influentialFeatures.length > 0 ? (
          <div className="space-y-2.5">
            {influentialFeatures.slice(0, 5).map((feat, idx) => {
              const isSpam =
                feat.predicted_impact === 'spam' ||
                feat.badge === 'danger' ||
                (feat.polarity || '').toLowerCase().includes('spam');
              const isHam =
                feat.predicted_impact === 'ham' ||
                feat.badge === 'success' ||
                (feat.polarity || '').toLowerCase().includes('ham');

              const pValFmt =
                feat.p_value_formatted ??
                (feat.p_value !== undefined && !isNaN(feat.p_value)
                  ? feat.p_value < 0.001
                    ? 'p < 0.001'
                    : `p = ${feat.p_value.toFixed(4)}`
                  : 'Unavailable');

              const chi2Stat =
                feat.chi2_score !== undefined && !isNaN(feat.chi2_score)
                  ? `χ² = ${feat.chi2_score.toFixed(2)}`
                  : 'Unavailable';

              const sigStatus =
                feat.significance_status ??
                (feat.p_value === undefined || isNaN(feat.p_value)
                  ? 'Unavailable'
                  : feat.p_value < 0.001
                  ? 'Highly Significant'
                  : feat.p_value < alphaThreshold
                  ? 'Statistically Significant'
                  : 'Not Statistically Significant');

              const classAssoc =
                feat.class_association ??
                (feat.p_value === undefined || isNaN(feat.p_value)
                  ? 'Unavailable'
                  : isSpam
                  ? 'Spam-associated'
                  : isHam
                  ? 'Ham-associated'
                  : 'Neutral / Shared');

              const predContrib =
                feat.prediction_contribution ??
                (feat.log_odds !== undefined
                  ? `${feat.log_odds > 0 ? '+' : ''}${feat.log_odds.toFixed(2)} log-odds (${isSpam ? 'favors Spam' : isHam ? 'favors Ham' : 'neutral'})`
                  : 'Model contribution calculated');

              const trainingAssoc =
                feat.training_association ??
                (chi2Stat !== 'Unavailable' && pValFmt !== 'Unavailable'
                  ? `${chi2Stat}, ${pValFmt} (${sigStatus})`
                  : 'Chi-Square statistics unavailable');

              const interp =
                feat.interpretation ??
                (isSpam
                  ? `${classAssoc} in training data (${pValFmt}). Shifts current prediction toward Spam by ${predContrib}.`
                  : isHam
                  ? `${classAssoc} in training data (${pValFmt}). Shifts current prediction toward Ham by ${predContrib}.`
                  : `Retained in model vocabulary (${pValFmt}), with neutral directional impact on this email.`);

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border bg-slate-900/90 space-y-1.5 transition ${
                    isSpam
                      ? 'border-rose-900/60 hover:border-rose-700/80'
                      : isHam
                      ? 'border-emerald-900/60 hover:border-emerald-700/80'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        "{feat.word}"
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isSpam
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : isHam
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {isSpam ? 'Favors Spam' : isHam ? 'Favors Ham' : 'Neutral Word'}
                      </span>
                    </div>
                    {feat.log_odds !== undefined && (
                      <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                        {feat.log_odds > 0 ? `+${feat.log_odds.toFixed(2)}` : feat.log_odds.toFixed(2)} log-odds
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-300 font-sans">
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                      <div className="text-[10px] uppercase font-mono text-slate-400 font-semibold">
                        Prediction Contribution:
                      </div>
                      <div className="font-mono text-slate-200 mt-0.5">{predContrib}</div>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                      <div className="text-[10px] uppercase font-mono text-slate-400 font-semibold">
                        Training Association:
                      </div>
                      <div className="font-mono text-cyan-300 mt-0.5">{trainingAssoc}</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 leading-relaxed font-sans pt-0.5">
                    <strong className="text-slate-400">Interpretation:</strong> {interp}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1">
            <div className="font-medium text-slate-300">No high-impact vocabulary tokens isolated for this message.</div>
            <p className="text-[11px] text-slate-400">
              Verdict is determined by baseline class priors and overall message structure; no individual token shifted the Bayesian log-odds significantly.
            </p>
          </div>
        )}
      </div>

      {/* 5. CHI-SQUARE FEATURE STATISTICS */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center space-x-1.5">
            <Scale className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Chi-Square Feature Statistics
            </h3>
          </div>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
            <span>Verified Threshold: α = {alphaThreshold}</span>
          </span>
        </div>

        {influentialFeatures && influentialFeatures.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                  <th className="py-2 px-2.5">Feature Term</th>
                  <th className="py-2 px-2.5">χ² Statistic</th>
                  <th className="py-2 px-2.5">Training p-value</th>
                  <th className="py-2 px-2.5">Significance Status</th>
                  <th className="py-2 px-2.5">Class Association</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {influentialFeatures.slice(0, 5).map((f, i) => {
                  const hasStats = f.chi2_score !== undefined && !isNaN(f.chi2_score) && f.p_value !== undefined && !isNaN(f.p_value);
                  const isSpam =
                    f.predicted_impact === 'spam' ||
                    f.badge === 'danger' ||
                    (f.polarity || '').toLowerCase().includes('spam');
                  const isHam =
                    f.predicted_impact === 'ham' ||
                    f.badge === 'success' ||
                    (f.polarity || '').toLowerCase().includes('ham');

                  const pValText = hasStats
                    ? f.p_value_formatted ?? (f.p_value! < 0.001 ? 'p < 0.001' : `p = ${f.p_value!.toFixed(4)}`)
                    : 'Unavailable';

                  const sigStatus = hasStats
                    ? f.significance_status ?? (f.p_value! < 0.001 ? 'Highly Significant' : f.p_value! < alphaThreshold ? 'Statistically Significant' : 'Not Statistically Significant')
                    : 'Unavailable';

                  const classAssoc = hasStats
                    ? f.class_association ?? (isSpam ? 'Spam-associated' : isHam ? 'Ham-associated' : 'Neutral / Shared')
                    : 'Unavailable';

                  const isHighlySig = sigStatus === 'Highly Significant';
                  const isSig = sigStatus === 'Statistically Significant' || isHighlySig;

                  return (
                    <tr key={i} className="hover:bg-slate-900/50 transition">
                      <td className="py-2 px-2.5 font-bold text-white">"{f.word}"</td>
                      <td className="py-2 px-2.5 text-slate-300">
                        {hasStats ? f.chi2_score!.toFixed(2) : 'Unavailable'}
                      </td>
                      <td className="py-2 px-2.5 text-cyan-300">{pValText}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isHighlySig
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : isSig
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                              : sigStatus === 'Unavailable'
                              ? 'bg-slate-800 text-slate-500 border border-slate-700'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {sigStatus}
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <span
                          className={
                            classAssoc === 'Spam-associated'
                              ? 'text-rose-400 font-semibold'
                              : classAssoc === 'Ham-associated'
                              ? 'text-emerald-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {classAssoc}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
            Chi-Square statistics are unavailable for this email because no trained vocabulary features were present in the message text.
          </div>
        )}

        {/* Statistical Explanation Callout */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 font-sans space-y-1">
          <div className="font-semibold text-slate-300 flex items-center space-x-1">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Statistical Evidence Explanation</span>
          </div>
          <p className="leading-relaxed text-slate-400">
            Chi-Square tests whether a word is associated with Spam or Ham in the training data. Its p-value measures the statistical evidence against independence. It does not represent the probability that this individual email is Spam.
          </p>
        </div>
      </div>

      {/* 6. SECURITY INDICATORS (SHOWN SEPARATELY) */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Security Indicators</span>
          </span>
          <span className="text-[10px] text-slate-400 font-normal">
            Heuristic Threat Cues (Evaluated Separately from Model Weights)
          </span>
        </div>

        {((warningSigns && warningSigns.length > 0) ||
          (suspiciousPhrases && suspiciousPhrases.length > 0) ||
          (detectedLinks && detectedLinks.length > 0)) ? (
          <div className="space-y-2.5">
            {/* Suspicious Phrases */}
            {suspiciousPhrases && suspiciousPhrases.length > 0 && (
              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 space-y-1">
                <div className="text-[10px] font-mono text-rose-300 font-semibold">
                  Detected Suspicious Cues:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suspiciousPhrases.map((phrase, idx) => (
                    <span
                      key={idx}
                      className="bg-rose-900/40 border border-rose-800 text-rose-200 px-2 py-0.5 rounded text-[11px] font-mono"
                    >
                      "{phrase}"
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Warning Signs */}
            {warningSigns && warningSigns.length > 0 && (
              <div className="space-y-1.5">
                {warningSigns.map((ws, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{ws.title}</span>
                      {ws.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {ws.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">{ws.detail}</p>
                    {ws.highlighted_phrase && (
                      <div className="text-[10px] text-cyan-300 font-mono pt-0.5">
                        Matched cue: <span className="bg-slate-800 px-1 py-0.5 rounded">"{ws.highlighted_phrase}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Detected Hyperlinks */}
            {detectedLinks && detectedLinks.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40 space-y-1.5">
                <div className="text-[11px] font-bold font-mono text-amber-300 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Detected Hyperlinks ({detectedLinks.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans font-normal">
                    Inspect destination before opening
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedLinks.map((link, idx) => (
                    <span
                      key={idx}
                      className="bg-slate-900 px-2 py-0.5 rounded border border-amber-900/50 text-amber-300 font-mono text-[11px] break-all select-all"
                    >
                      {link}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-500 font-sans leading-tight">
              Security indicators highlight contextual patterns (e.g. urgency cues, credential verification, links). They serve as security warning signs, not statistical proof of malicious intent.
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
            No contextual security triggers (suspicious phrases, credential harvesting cues, or unusual links) detected in this email.
          </div>
        )}
      </div>

      {/* 7. SAFETY RECOMMENDATION */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
        <div className="flex items-center space-x-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Safety Recommendation
          </h3>
        </div>
        <div className="flex items-start space-x-2 text-xs text-slate-300 font-sans">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{conciseRecommendation}</span>
        </div>
      </div>

      {/* 8. ACTIONS (FOR SCANNER) */}
      {showActions && (
        <div className="space-y-2 pt-1">
          {reportError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{reportError}</span>
            </div>
          )}

          {onDownloadReport && (
            <button
              type="button"
              onClick={onDownloadReport}
              disabled={downloadingReport}
              className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-950/50 transition disabled:opacity-50"
            >
              {downloadingReport ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating Report PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  <span>Download Scan Report (PDF)</span>
                </>
              )}
            </button>
          )}

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center justify-center space-x-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Scan Another Email</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
