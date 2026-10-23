import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Table,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { api } from '../services/api';
import { DatasetSummary } from '../types';

export const DatasetPage: React.FC = () => {
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Column remapping state
  const [selectedTextCol, setSelectedTextCol] = useState('');
  const [selectedLabelCol, setSelectedLabelCol] = useState('');
  const [selectedSubjectCol, setSelectedSubjectCol] = useState('');
  const [remapping, setRemapping] = useState(false);

  const fetchDatasetSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDatasetSummary();
      if (res.is_loaded && res.summary) {
        setSummary(res.summary);
        setSelectedTextCol(res.summary.selected_columns.text_column || '');
        setSelectedLabelCol(res.summary.selected_columns.label_column || '');
        setSelectedSubjectCol(res.summary.selected_columns.subject_column || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dataset summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasetSummary();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.uploadDataset(formData);
      setSummary(res.summary);
      setSelectedTextCol(res.summary.selected_columns.text_column || '');
      setSelectedLabelCol(res.summary.selected_columns.label_column || '');
      setSelectedSubjectCol(res.summary.selected_columns.subject_column || '');
      setSuccessMsg(`Dataset '${file.name}' uploaded and cleaned successfully.`);
    } catch (err: any) {
      setError(err.message || 'Error uploading dataset.');
    } finally {
      setUploading(false);
    }
  };

  const handleLoadBenchmark = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.loadSampleDataset();
      setSummary(res.summary);
      setSelectedTextCol(res.summary.selected_columns.text_column || '');
      setSelectedLabelCol(res.summary.selected_columns.label_column || '');
      setSelectedSubjectCol(res.summary.selected_columns.subject_column || '');
      setSuccessMsg('Benchmark email security dataset loaded and preprocessed.');
    } catch (err: any) {
      setError(err.message || 'Error loading benchmark dataset.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTextCol || !selectedLabelCol) {
      setError('Please select both a text column and a label column.');
      return;
    }

    setRemapping(true);
    setError(null);
    try {
      const res = await api.remapColumns({
        text_column: selectedTextCol,
        label_column: selectedLabelCol,
        subject_column: selectedSubjectCol || undefined,
      });
      setSummary(res.summary);
      setSuccessMsg('Column mappings updated and preprocessing re-calculated.');
    } catch (err: any) {
      setError(err.message || 'Failed to remap dataset columns.');
    } finally {
      setRemapping(false);
    }
  };

  const prep = summary?.preprocessing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Dataset & Data Hygiene</h1>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-cyan-950 border border-cyan-800 text-cyan-300">
              Technical Responsibility #1
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            CSV dataset ingestion, column mapping, HTML entity decoding, tokenization, and label normalization.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleLoadBenchmark}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-2 transition"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Load Benchmark Dataset</span>
          </button>

          <label className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-2 cursor-pointer transition shadow-sm shadow-cyan-900/40">
            <UploadCloud className="w-4 h-4" />
            <span>Upload Custom CSV</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Preprocessing Summary Audit Cards */}
      {prep && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Original Rows</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{summary.total_rows_raw}</div>
            <div className="text-[11px] text-slate-500 mt-1">Raw CSV records</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Cleaned Samples</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{prep.cleaned_rows}</div>
            <div className="text-[11px] text-slate-500 mt-1">Valid for model training</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Duplicates Removed</span>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{prep.duplicates_removed}</div>
            <div className="text-[11px] text-slate-500 mt-1">Exact text copies dropped</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-mono">Missing Values</span>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
              {prep.missing_text_count + prep.missing_label_count}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Filtered out safely</div>
          </div>
        </div>
      )}

      {/* Column Mapping Configuration */}
      {summary && (
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">Active Column Mappings</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Current source file: <span className="text-cyan-400 font-mono">{summary.filename}</span>
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Available Columns: [{summary.columns.join(', ')}]
            </span>
          </div>

          <form onSubmit={handleRemap} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Email Body / Text Column *
              </label>
              <select
                value={selectedTextCol}
                onChange={(e) => setSelectedTextCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                {summary.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target Label Column *
              </label>
              <select
                value={selectedLabelCol}
                onChange={(e) => setSelectedLabelCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                {summary.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Subject Column (Optional)
              </label>
              <select
                value={selectedSubjectCol}
                onChange={(e) => setSelectedSubjectCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="">-- None (Single Text Field) --</option>
                {summary.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={remapping}
              className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
            >
              {remapping ? 'Updating...' : 'Apply Mappings'}
            </button>
          </form>
        </div>
      )}

      {/* Label Distribution & Hygiene Breakdown */}
      {prep && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Label Distribution */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
            <h3 className="text-sm font-semibold text-white tracking-tight">Normalized Label Distribution</h3>
            <p className="text-xs text-slate-400 mt-1">
              Labels mapped strictly into binary security categories (Ham vs Spam).
            </p>
            <div className="mt-4 space-y-3 font-mono text-xs">
              {Object.entries(prep.class_distribution).map(([label, count]) => {
                const total = prep.cleaned_rows || 1;
                const pct = ((count / total) * 100).toFixed(1);
                const isSpam = label.toLowerCase() === 'spam';
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-slate-300">
                      <span className="font-semibold uppercase flex items-center space-x-1.5">
                        <span className={`w-2 h-2 rounded-full ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <span>{label}</span>
                      </span>
                      <span>{count} emails ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cleaning Pipeline Details */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
            <h3 className="text-sm font-semibold text-white tracking-tight">Text Normalization Pipeline</h3>
            <p className="text-xs text-slate-400 mt-1">
              Applied text transformations to standardize tokens across disparate sources:
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300 list-disc list-inside">
              <li><span className="font-semibold text-white">HTML Stripping:</span> Unescapes HTML entities (&amp;, &lt;) and strips tags.</li>
              <li><span className="font-semibold text-white">Security Tokenization:</span> Normalizes URLs (<code className="text-cyan-400">url_token</code>), emails (<code className="text-cyan-400">email_token</code>), currency (<code className="text-cyan-400">currency_token</code>).</li>
              <li><span className="font-semibold text-white">Unicode Normalization:</span> NFKD standardization for quotes and accents.</li>
              <li><span className="font-semibold text-white">Case Folding:</span> Lowercasing to unify vocabulary dimensions.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Dataset Tabular Preview */}
      {summary && summary.preview && summary.preview.length > 0 && (
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">Dataset Preview (First 5 Rows)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect raw un-modified records directly from the uploaded CSV.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Total Columns: {summary.columns.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  {summary.columns.map((col) => (
                    <th key={col} className="py-2.5 px-3 whitespace-nowrap bg-slate-950/40">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {summary.preview.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    {summary.columns.map((col) => (
                      <td key={col} className="py-2.5 px-3 max-w-xs truncate">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
