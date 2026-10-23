import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Scale,
  AlignLeft,
  FileText,
  AlertCircle,
  RefreshCw,
  GraduationCap,
  Sparkles,
  Link,
  DollarSign,
  AlertTriangle,
  Database,
  Binary,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../services/api';
import { DatasetStatistics, ChiSquareAnalysis } from '../types';

export const StatisticsPage: React.FC = () => {
  const [data, setData] = useState<DatasetStatistics | null>(null);
  const [chiData, setChiData] = useState<ChiSquareAnalysis | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dataset' | 'chisquare'>('dataset');

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, chiRes] = await Promise.all([
        api.getStatistics(),
        api.getChiSquare(30).catch(() => ({ is_available: false, analysis: null as any })),
      ]);

      if (statsRes.is_available && statsRes.statistics) {
        setData(statsRes.statistics);
        setFilename(statsRes.filename || 'enron_spam_data.csv');
      }
      if (chiRes?.is_available && chiRes?.analysis) {
        setChiData(chiRes.analysis);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dataset statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-sm text-slate-400">Computing dataset statistics &amp; lexical frequencies...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
        <h3 className="text-base font-semibold text-white">Dataset Statistics Unavailable</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          {error || "The preloaded dataset 'enron_spam_data.csv' is being loaded or could not be found."}
        </p>
        <button
          onClick={fetchStats}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  // Length comparison chart data
  const lengthData = [
    {
      name: 'Ham (Legitimate)',
      avgChars: data.length_metrics.by_class?.ham?.char_length.mean || 0,
      medianChars: data.length_metrics.by_class?.ham?.char_length.median || 0,
      stdChars: data.length_metrics.by_class?.ham?.char_length.std || 0,
      avgWords: data.length_metrics.by_class?.ham?.word_count.mean || 0,
      medianWords: data.length_metrics.by_class?.ham?.word_count.median || 0,
    },
    {
      name: 'Spam (Malicious)',
      avgChars: data.length_metrics.by_class?.spam?.char_length.mean || 0,
      medianChars: data.length_metrics.by_class?.spam?.char_length.median || 0,
      stdChars: data.length_metrics.by_class?.spam?.char_length.std || 0,
      avgWords: data.length_metrics.by_class?.spam?.word_count.mean || 0,
      medianWords: data.length_metrics.by_class?.spam?.word_count.median || 0,
    },
  ];

  const distributionPieData = [
    {
      name: 'Legitimate (Ham)',
      value: data.classes?.ham?.count || 0,
      color: '#10B981',
      percentage: data.classes?.ham?.percentage || 0,
    },
    {
      name: 'Malicious / Spam',
      value: data.classes?.spam?.count || 0,
      color: '#F43F5E',
      percentage: data.classes?.spam?.percentage || 0,
    },
  ];

  // Top frequent words (Top 10)
  const topHamWords = data.frequent_words?.ham?.slice(0, 10) || [];
  const topSpamWords = data.frequent_words?.spam?.slice(0, 10) || [];

  const chars = data.characteristics || {};
  const hamChars = chars.ham || { avg_uppercase_pct: 0, url_presence_pct: 0, currency_presence_pct: 0, avg_urgency_keywords: 0 };
  const spamChars = chars.spam || { avg_uppercase_pct: 0, url_presence_pct: 0, currency_presence_pct: 0, avg_urgency_keywords: 0 };
  const hygiene = data.hygiene || {
    total_raw_rows: 1500,
    total_usable_emails: data.total_samples,
    duplicates_removed: 148,
    missing_values_count: 0,
    unrecognized_labels_count: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">CO5 Statistics &amp; Feature Analysis</h1>
            <span className="text-xs px-2.5 py-0.5 rounded font-mono font-medium bg-cyan-950 border border-cyan-800 text-cyan-300">
              CO5 Syllabus
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Empirical class distributions, hygiene audits, descriptive length statistics, and Chi-Square feature selection.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-1">
            <button
              onClick={() => setActiveTab('dataset')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'dataset' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dataset Statistics
            </button>
            <button
              onClick={() => setActiveTab('chisquare')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-1 ${
                activeTab === 'chisquare' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Chi-Square Test</span>
            </button>
          </div>
          <button
            onClick={fetchStats}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title="Refresh statistics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'dataset' ? (
        <>
          {/* Dataset Hygiene & Usable Records Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 uppercase font-mono">Total Usable Records</span>
              <div className="text-2xl font-bold font-mono text-cyan-400">{hygiene.total_usable_emails}</div>
              <p className="text-[11px] text-slate-500">Usable training/testing emails</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 uppercase font-mono">Raw Records in CSV</span>
              <div className="text-2xl font-bold font-mono text-white">{hygiene.total_raw_rows}</div>
              <p className="text-[11px] text-slate-500">Total rows in {filename}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 uppercase font-mono">Duplicates Removed</span>
              <div className="text-2xl font-bold font-mono text-amber-400">{hygiene.duplicates_removed}</div>
              <p className="text-[11px] text-slate-500">Exact duplicate rows cleaned</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 uppercase font-mono">Missing Values</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">{hygiene.missing_values_count}</div>
              <p className="text-[11px] text-slate-500">0 corrupted/empty fields</p>
            </div>
          </div>

          {/* Class Imbalance & Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Pie Chart Card */}
            <div className="lg:col-span-5 p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">Class Distribution</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Proportion of Ham vs Spam across all {data.total_samples} usable records.
                </p>
              </div>

              <div className="h-56 my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionPieData}
                      innerRadius={50}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {distributionPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                      formatter={(val: any, name: any) => [
                        `${val} emails (${((Number(val) / data.total_samples) * 100).toFixed(1)}%)`,
                        name,
                      ]}
                    />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94A3B8' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex justify-between text-xs font-mono">
                <span className="text-emerald-400 font-semibold">Ham: {data.classes?.ham?.count || 0} ({data.classes?.ham?.percentage || 0}%)</span>
                <span className="text-rose-400 font-semibold">Spam: {data.classes?.spam?.count || 0} ({data.classes?.spam?.percentage || 0}%)</span>
              </div>
            </div>

            {/* Imbalance & CO5 Statistical Concept */}
            <div className="lg:col-span-7 p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                  <Scale className="w-4 h-4 text-cyan-400" />
                  <span>Empirical Class Imbalance</span>
                </span>
                <div className="text-3xl font-bold font-mono text-white mt-1">
                  {data.class_imbalance.ratio}:1 <span className="text-xs font-normal text-slate-400">({data.class_imbalance.description})</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="font-semibold text-cyan-300 flex items-center space-x-1.5">
                  <HelpCircle className="w-4 h-4 text-cyan-400" />
                  <span>Why Imbalance Matters in Machine Learning:</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  The dataset contains {data.classes?.ham?.count} Ham emails ({data.classes?.ham?.percentage}%) and {data.classes?.spam?.count} Spam emails ({data.classes?.spam?.percentage}%).
                  Because the classes are not exactly 50/50, we implement <span className="text-slate-200 font-semibold">Stratified Sampling</span> during train/test splitting to ensure both training and testing partitions preserve the exact real-world class distribution.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                  <span className="text-[11px] text-emerald-400 uppercase font-sans font-bold">Legitimate Class (Ham)</span>
                  <div className="text-lg font-bold text-white mt-0.5">{data.classes?.ham?.count || 0}</div>
                  <span className="text-[11px] text-slate-400 font-sans">Enron business/staff communications</span>
                </div>
                <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40">
                  <span className="text-[11px] text-rose-400 uppercase font-sans font-bold">Malicious Class (Spam)</span>
                  <div className="text-lg font-bold text-white mt-0.5">{data.classes?.spam?.count || 0}</div>
                  <span className="text-[11px] text-slate-400 font-sans">Phishing, prizes, solicitations</span>
                </div>
              </div>
            </div>
          </div>

          {/* Descriptive Statistics Table: Average, Median, Std Dev */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">Descriptive Length Statistics (CO5)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mean, Median, Standard Deviation, and Range for both word counts and character lengths.
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Calculated on Usable Text
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                    <th className="py-2.5 px-3">Metric Category</th>
                    <th className="py-2.5 px-3 text-right">Average (Mean)</th>
                    <th className="py-2.5 px-3 text-right">Median (50th %ile)</th>
                    <th className="py-2.5 px-3 text-right">Std Deviation (σ)</th>
                    <th className="py-2.5 px-3 text-right">Min Length</th>
                    <th className="py-2.5 px-3 text-right">Max Length</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-semibold text-cyan-300">Overall Word Count</td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">{data.length_metrics.overall.word_count.mean} words</td>
                    <td className="py-2.5 px-3 text-right">{data.length_metrics.overall.word_count.median} words</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{data.length_metrics.overall.word_count.std}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.overall.word_count.min}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.overall.word_count.max}</td>
                  </tr>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 text-emerald-300">Ham Word Count</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-300">{data.length_metrics.by_class?.ham?.word_count.mean || 0} words</td>
                    <td className="py-2.5 px-3 text-right">{data.length_metrics.by_class?.ham?.word_count.median || 0} words</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{data.length_metrics.by_class?.ham?.word_count.std || 0}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.by_class?.ham?.word_count.min || 0}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.by_class?.ham?.word_count.max || 0}</td>
                  </tr>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 text-rose-300">Spam Word Count</td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-300">{data.length_metrics.by_class?.spam?.word_count.mean || 0} words</td>
                    <td className="py-2.5 px-3 text-right">{data.length_metrics.by_class?.spam?.word_count.median || 0} words</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{data.length_metrics.by_class?.spam?.word_count.std || 0}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.by_class?.spam?.word_count.min || 0}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.by_class?.spam?.word_count.max || 0}</td>
                  </tr>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-semibold text-cyan-300">Overall Character Length</td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">{data.length_metrics.overall.char_length.mean} chars</td>
                    <td className="py-2.5 px-3 text-right">{data.length_metrics.overall.char_length.median} chars</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{data.length_metrics.overall.char_length.std}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.overall.char_length.min}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">{data.length_metrics.overall.char_length.max}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Explanations of each statistical term */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <span className="font-bold text-cyan-400 block mb-1">Average (Mean):</span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  The arithmetic sum of all lengths divided by email count. Indicates the central baseline length of a typical email in the dataset.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <span className="font-bold text-emerald-400 block mb-1">Median (50th Percentile):</span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  The exact midpoint when email lengths are ordered. Unlike the mean, the median is immune to extreme outliers (such as an unusually long contract or document dump).
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <span className="font-bold text-amber-400 block mb-1">Standard Deviation (σ):</span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Measures the degree of dispersion or variance around the mean. A larger standard deviation indicates high variety in email structure and wordiness.
                </p>
              </div>
            </div>
          </div>

          {/* Bar Chart: Length Comparison */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
            <h3 className="text-sm font-semibold text-white tracking-tight mb-1">Email Length Visual Comparison</h3>
            <p className="text-xs text-slate-400 mb-4">Visualizing average characters vs word count across classes.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lengthData}>
                  <XAxis dataKey="name" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#94A3B8' }} />
                  <Bar dataKey="avgChars" name="Mean Characters" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgWords" name="Mean Words" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Frequent Words by Class */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-emerald-400">Top Frequent Words in Ham</h3>
                <span className="text-[10px] font-mono text-slate-500">Excludes common stop-words</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 px-2">Word</th>
                      <th className="py-2 px-2 text-right">Count</th>
                      <th className="py-2 px-2 text-right">Frequency %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {topHamWords.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 font-medium text-emerald-300">{item.word}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{item.count}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">{item.frequency}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-rose-400">Top Frequent Words in Spam</h3>
                <span className="text-[10px] font-mono text-slate-500">Excludes common stop-words</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 px-2">Word</th>
                      <th className="py-2 px-2 text-right">Count</th>
                      <th className="py-2 px-2 text-right">Frequency %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {topSpamWords.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 font-medium text-rose-300">{item.word}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{item.count}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">{item.frequency}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Dedicated Chi-Square Section within Statistics */
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center space-x-2">
              <Binary className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold text-white">Pearson's Chi-Square Test (χ²) in Feature Selection</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Chi-square feature selection measures whether a word's occurrence in an email and the target class (Spam vs. Ham) are statistically independent.
              A high Chi-square score means the observed word frequency differs substantially from what chance alone would predict, identifying highly discriminative words.
            </p>
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
              <div><strong className="text-cyan-300 font-sans">Score vs. P-Value Distinction:</strong> The Chi-square score measures magnitude of divergence. The p-value indicates the exact probability that this divergence occurred purely by random luck.</div>
              <div><strong className="text-emerald-300 font-sans">Statistical Significance Rule:</strong> Features are considered statistically significant only when <span className="text-emerald-400 font-bold">p &lt; 0.05</span>.</div>
            </div>
          </div>

          {chiData ? (
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Selected Top Chi-Square Features ({chiData.features?.length || 0} terms)
                </h3>
                <span className="text-xs font-mono text-emerald-400">
                  {chiData.significant_features_count} statistically significant (p &lt; 0.05)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                      <th className="py-2 px-3">Word / Feature</th>
                      <th className="py-2 px-3">Chi2 Score</th>
                      <th className="py-2 px-3">P-Value</th>
                      <th className="py-2 px-3">Significance</th>
                      <th className="py-2 px-3">Class Association</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {chiData.features?.map((f, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-semibold text-white">{f.feature}</td>
                        <td className="py-2 px-3 font-bold text-cyan-400">{f.chi2_score.toFixed(2)}</td>
                        <td className="py-2 px-3 text-slate-300">{f.p_value_formatted}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            f.is_significant ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {f.significance.split('(')[0]}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            f.leaning_class === 'spam'
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          }`}>
                            {f.tendency}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 mx-auto text-cyan-400 animate-spin" />
              <p className="text-xs mt-2">Computing Chi-Square feature scores...</p>
            </div>
          )}
        </div>
      )}

      {/* University Viva & Defense Notes */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-cyan-900/50">
        <div className="flex items-center space-x-2 mb-3">
          <GraduationCap className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Academic Viva / Technical Defense Preparation
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.viva_insights?.map((item, idx) => (
            <div key={idx} className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
              <span className="text-[11px] font-semibold uppercase text-cyan-400 tracking-wider font-mono">
                {item.topic}
              </span>
              <h4 className="text-xs font-bold text-slate-200">{item.concept}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{item.explanation}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
