import React, { useState, useEffect } from 'react';
import {
  Award,
  Target,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Info,
  CheckCircle2,
  FileCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { EvaluationData } from '../types';

export const EvaluationPage: React.FC = () => {
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvaluation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEvaluation();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch evaluation metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluation();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading evaluation reports on held-out test data...</p>
      </div>
    );
  }

  if (error || !data || !data.is_trained) {
    return (
      <div className="p-8 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
        <Award className="w-10 h-10 text-amber-400 mx-auto" />
        <h3 className="text-base font-semibold text-white">No Evaluation Available</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Evaluation metrics are calculated exclusively after training the pipeline on a held-out test split. Please train the model in the Model Training module first.
        </p>
      </div>
    );
  }

  const evalRes = data.evaluation;
  const overall = evalRes?.overall;
  const cm = evalRes?.confusion_matrix;
  const perClass = evalRes?.per_class || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Model Evaluation & Metrics</h1>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-emerald-950 border border-emerald-800 text-emerald-300">
              Held-out Test Split
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Empirical validation on {evalRes?.test_samples} unseen test emails. Zero training data leakage.
          </p>
        </div>

        <button
          onClick={fetchEvaluation}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 self-start sm:self-auto transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Metrics Grid */}
      {overall && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-900/40">
            <span className="text-xs uppercase text-slate-400 font-mono">Test Accuracy</span>
            <div className="text-3xl font-bold font-mono text-cyan-400 mt-1">
              {(overall.accuracy * 100).toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Overall correct verdicts</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-900/40">
            <span className="text-xs uppercase text-slate-400 font-mono">Macro F1-Score</span>
            <div className="text-3xl font-bold font-mono text-emerald-400 mt-1">
              {(overall.macro_f1 * 100).toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Unweighted harmonic mean</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Macro Precision</span>
            <div className="text-3xl font-bold font-mono text-white mt-1">
              {(overall.macro_precision * 100).toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Exactness across classes</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Macro Recall</span>
            <div className="text-3xl font-bold font-mono text-white mt-1">
              {(overall.macro_recall * 100).toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Threat detection sensitivity</div>
          </div>
        </div>
      )}

      {/* Main Row: Confusion Matrix + Classification Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Confusion Matrix (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Confusion Matrix</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Breakdown of actual vs. predicted labels on the held-out test partition.
            </p>
          </div>

          {cm && cm.breakdown && (
            <div className="space-y-3">
              {/* 2x2 Matrix Grid */}
              <div className="grid grid-cols-2 gap-3 font-mono text-xs text-center">
                {/* True Negatives */}
                <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/80">
                  <div className="text-2xl font-bold text-emerald-400">
                    {cm.breakdown.true_negatives}
                  </div>
                  <div className="text-xs font-semibold text-emerald-300 mt-1">
                    True Negatives (TN)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Legitimate correctly identified
                  </div>
                </div>

                {/* False Positives */}
                <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/80">
                  <div className="text-2xl font-bold text-amber-400">
                    {cm.breakdown.false_positives}
                  </div>
                  <div className="text-xs font-semibold text-amber-300 mt-1">
                    False Positives (FP)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Type I Error (False Alarm)
                  </div>
                </div>

                {/* False Negatives */}
                <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/80">
                  <div className="text-2xl font-bold text-rose-400">
                    {cm.breakdown.false_negatives}
                  </div>
                  <div className="text-xs font-semibold text-rose-300 mt-1">
                    False Negatives (FN)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Type II Error (Security Risk)
                  </div>
                </div>

                {/* True Positives */}
                <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/80">
                  <div className="text-2xl font-bold text-emerald-400">
                    {cm.breakdown.true_positives}
                  </div>
                  <div className="text-xs font-semibold text-emerald-300 mt-1">
                    True Positives (TP)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Spam correctly intercepted
                  </div>
                </div>
              </div>

              {/* Cybersecurity Implications Note */}
              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs text-slate-300">
                <span className="font-semibold text-cyan-400 block font-mono">
                  Cybersecurity Tradeoff Analysis:
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  <strong>Type I (False Positive):</strong> Legitimate email sent to spam folder (causes user frustration).
                  <br />
                  <strong>Type II (False Negative):</strong> Malicious phishing lure bypasses filter to inbox (causes credential theft / ransomware breach).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Per-Class Classification Report Table (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Per-Class Classification Report</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Class-specific Precision, Recall, and F1-score computed using Scikit-Learn.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                  <th className="py-2.5 px-3">Target Class</th>
                  <th className="py-2.5 px-3 text-right">Precision</th>
                  <th className="py-2.5 px-3 text-right">Recall</th>
                  <th className="py-2.5 px-3 text-right">F1-Score</th>
                  <th className="py-2.5 px-3 text-right">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {Object.entries(perClass).map(([cls, metrics]) => (
                  <tr key={cls} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-bold uppercase text-white flex items-center space-x-1.5">
                      <span className={`w-2 h-2 rounded-full ${cls === 'spam' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span>{cls === 'spam' ? 'Spam / Phish' : 'Legitimate (Ham)'}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-cyan-400">
                      {(metrics.precision * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">
                      {(metrics.recall * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">
                      {(metrics.f1_score * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {metrics.support} samples
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Weighted Summary */}
          {overall && (
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 font-mono text-xs text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Weighted Precision:</span>
                <span className="text-slate-200">{(overall.weighted_precision * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Weighted Recall:</span>
                <span className="text-slate-200">{(overall.weighted_recall * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Weighted F1-Score:</span>
                <span className="text-slate-200 font-bold text-cyan-400">
                  {(overall.weighted_f1 * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* Evaluation Integrity Transparency */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-start space-x-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p>
              {evalRes?.notes}
              {evalRes?.reliability && ` Assessment: ${evalRes.reliability}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
