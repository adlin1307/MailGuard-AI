import React, { useState, useEffect } from 'react';
import {
  Binary,
  GraduationCap,
  Sparkles,
  RefreshCw,
  Search,
  Sliders,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import { ChiSquareAnalysis, ChiSquareFeature } from '../types';

export const ChiSquarePage: React.FC = () => {
  const [k, setK] = useState<number>(30);
  const [data, setData] = useState<ChiSquareAnalysis | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<'all' | 'spam' | 'ham'>('all');

  const fetchChiSquare = async (selectedK: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getChiSquare(selectedK);
      if (res.is_available && res.analysis) {
        setData(res.analysis);
        setFilename(res.filename || 'Active Dataset');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to compute Chi-Square feature selection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChiSquare(k);
  }, []);

  const handleKChange = (newK: number) => {
    setK(newK);
    fetchChiSquare(newK);
  };

  const filteredFeatures = (data?.features || []).filter((f) => {
    const matchesSearch = f.feature.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterClass === 'spam') return matchesSearch && f.leaning_class === 'spam';
    if (filterClass === 'ham') return matchesSearch && f.leaning_class === 'ham';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Chi-Square (χ²) Feature Selection</h1>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-cyan-950 border border-cyan-800 text-cyan-300">
              Technical Responsibility #3
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Test of independence between vocabulary terms and email classes using non-negative TF-IDF representations.
          </p>
        </div>

        {/* Preset k buttons */}
        <div className="flex items-center space-x-2 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
          <span className="text-xs font-mono text-slate-400 px-2 flex items-center space-x-1">
            <Sliders className="w-3.5 h-3.5" />
            <span>k:</span>
          </span>
          {[15, 30, 50, 100].map((kOption) => (
            <button
              key={kOption}
              onClick={() => handleKChange(kOption)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition ${
                k === kOption
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {kOption}
            </button>
          ))}
          <button
            onClick={() => fetchChiSquare(k)}
            disabled={loading}
            className="p-1 rounded text-slate-400 hover:text-white"
            title="Recalculate"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Evaluated Vocabulary</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {data.total_vocabulary_evaluated}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Unique TF-IDF n-grams</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Selected Features (k)</span>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
              {data.selected_k}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">SelectKBest constraint</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Statistically Significant</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {data.significant_features_count}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">p-value &lt; 0.05 verified</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Significance Rate</span>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {data.significance_rate_pct}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">High discriminative power</div>
          </div>
        </div>
      )}

      {/* Critical Scientific Distinction Callout */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-cyan-900/50">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Crucial Statistical Principle: Chi-Square Score (χ²) vs. p-value
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="text-cyan-300 font-medium">Chi-Square Score:</span> Quantifies the magnitude of departure between the observed frequency of a word in a class and its expected frequency if independent.
              <br />
              <span className="text-cyan-300 font-medium">p-value:</span> Determines whether this departure is statistically significant under the null hypothesis (H₀: word occurrence is independent of email class). A high Chi-Square score does <strong className="text-white">not</strong> automatically prove statistical validity without verifying that <strong className="text-emerald-400 font-mono">p &lt; 0.05</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Feature Selection Table */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Top Ranked Features (SelectKBest chi2)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Features ordered descending by Chi-Square statistic with exact p-value interpretations.
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter word..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono w-36 sm:w-44"
              />
            </div>

            <select
              value={filterClass}
              onChange={(e: any) => setFilterClass(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none font-mono"
            >
              <option value="all">All Classes</option>
              <option value="spam">Spam Indicators</option>
              <option value="ham">Ham Indicators</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Computing feature selector scores...</span>
          </div>
        ) : filteredFeatures.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Term / Feature</th>
                  <th className="py-2.5 px-3 text-right">Chi-Square (χ²)</th>
                  <th className="py-2.5 px-3 text-right">p-value</th>
                  <th className="py-2.5 px-3">Statistical Significance</th>
                  <th className="py-2.5 px-3">Class Tendency</th>
                  <th className="py-2.5 px-3 text-right">Mean TF-IDF (Spam / Ham)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredFeatures.map((feat, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 text-slate-500">#{idx + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-white flex items-center space-x-1.5">
                      <span>{feat.feature}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-cyan-400">
                      {feat.chi2_score.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                      {feat.p_value_formatted}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                          feat.p_value < 0.001
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : feat.p_value < 0.05
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {feat.significance}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          feat.leaning_class === 'spam'
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                            : feat.leaning_class === 'ham'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {feat.tendency}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400 font-mono text-[11px]">
                      {feat.spam_mean_tfidf.toFixed(3)} / {feat.ham_mean_tfidf.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500">
            No features found matching the current search criteria.
          </div>
        )}
      </div>

      {/* University Viva & Mathematical Defense Section */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center space-x-2">
          <GraduationCap className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Feature Selection Defense: Mathematical & Pipeline Walkthrough
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <h4 className="font-bold text-cyan-400">1. Why Chi-Square over Mutual Information or PCA?</h4>
            <p className="leading-relaxed text-slate-400">
              Unlike PCA which creates dense linear combinations of words that destroy semantic interpretability in a security context, Chi-Square maintains sparse, explainable features. It explicitly tests categorical correlation with the target class without assuming a normal distribution.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <h4 className="font-bold text-cyan-400">2. Prevention of Target Data Leakage</h4>
            <p className="leading-relaxed text-slate-400">
              In ProbMail, feature selection is rigorously wrapped inside the training pipeline. <code className="text-cyan-300">SelectKBest(chi2)</code> is fitted solely on <code className="text-cyan-300">X_train</code> after a stratified train/test split. The held-out test data is never observed during feature selection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
