import React, { useState, useEffect } from 'react';
import {
  History,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Inbox,
  CheckCircle2,
  Eye,
  X,
  ArrowRight,
  FileDown,
  Shield,
} from 'lucide-react';
import { api, triggerFileDownload } from '../services/api';
import { PredictionRecord } from '../types';

export const HistoryPage: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<'all' | 'spam' | 'ham'>('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PredictionRecord | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownloadReportById = async (id: number) => {
    setDownloadingId(id);
    try {
      const blob = await api.downloadScanReportById(id);
      const dateStr = new Date().toISOString().split('T')[0];
      triggerFileDownload(blob, `ProbMail_Scan_Report_${id}_${dateStr}.pdf`);
    } catch (err: any) {
      setError(err.message || 'Failed to download report.');
    } finally {
      setDownloadingId(null);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getHistory();
      setPredictions(res.predictions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load prediction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleClearHistory = async () => {
    try {
      const res = await api.clearHistory();
      setPredictions([]);
      setShowConfirmClear(false);
      setSelectedRecord(null);
      setSuccessMsg(res.message || 'Audit history successfully cleared.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to clear history.');
    }
  };

  const filteredPredictions = predictions.filter((p) => {
    const matchesSearch =
      (p.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.snippet || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (filterClass === 'spam') return matchesSearch && p.predicted_class === 'spam';
    if (filterClass === 'ham') return matchesSearch && p.predicted_class === 'ham';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Scan History &amp; Audit Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Persistent SQLite database log of analyzed emails with posterior conditional probabilities.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title="Refresh Log"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {predictions.length > 0 && (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
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
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmClear && (
        <div className="p-4 rounded-xl bg-slate-900 border border-rose-800/80 shadow-xl space-y-3">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-white">Confirm Log Erasure</h4>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to permanently delete all {predictions.length} scanned email audit records from the local SQLite database? This cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button
              onClick={() => setShowConfirmClear(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleClearHistory}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs text-white font-medium"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      )}

      {/* Controls: Search and Filter */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by subject or content snippet..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-sans w-56 sm:w-80"
            />
          </div>

          <select
            value={filterClass}
            onChange={(e: any) => setFilterClass(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none font-mono"
          >
            <option value="all">All Verdicts</option>
            <option value="spam">Spam Only</option>
            <option value="ham">Ham Only</option>
          </select>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          Showing {filteredPredictions.length} of {predictions.length} records
        </span>
      </div>

      {/* History Table */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
        {filteredPredictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Email Subject &amp; Snippet</th>
                  <th className="py-2.5 px-3">Verdict</th>
                  <th className="py-2.5 px-3">Risk Score</th>
                  <th className="py-2.5 px-3">Spam Prob</th>
                  <th className="py-2.5 px-3">Ham Prob</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredPredictions.map((pred) => {
                  const sProb = pred.spam_probability ?? (pred.predicted_class === 'spam' ? pred.confidence : 100 - pred.confidence);
                  const hProb = pred.ham_probability ?? (pred.predicted_class === 'ham' ? pred.confidence : 100 - pred.confidence);
                  const rScore = pred.risk_score ?? Math.round(sProb);
                  const rCat = pred.risk_category || (rScore >= 70 ? 'High Risk' : rScore >= 30 ? 'Medium Risk' : 'Low Risk');
                  const rLevel = rScore >= 70 ? 'high' : rScore >= 30 ? 'medium' : 'low';
                  return (
                    <tr key={pred.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 text-slate-500">#{pred.id}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white truncate max-w-xs sm:max-w-md font-sans">
                          {pred.subject || 'Untitled Email'}
                        </div>
                        {pred.snippet && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md font-sans mt-0.5">
                            {pred.snippet}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {pred.predicted_class === 'spam' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800">
                            SPAM
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            HAM
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          rLevel === 'high'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                            : rLevel === 'medium'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                        }`}>
                          <span>{rScore}/100</span>
                          <span className="opacity-75">· {rCat.split(' ')[0]}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-rose-400">
                        {sProb.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">
                        {hProb.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">
                        {new Date(pred.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setSelectedRecord(pred)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-sans flex items-center space-x-1 transition"
                            title="View audit details"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Details</span>
                          </button>
                          <button
                            onClick={() => handleDownloadReportById(pred.id)}
                            disabled={downloadingId === pred.id}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 transition disabled:opacity-50"
                            title="Download PDF report"
                          >
                            {downloadingId === pred.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <FileDown className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 space-y-3">
            <Inbox className="w-10 h-10 mx-auto text-slate-600" />
            <h4 className="text-sm font-semibold text-slate-400">No Records Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {predictions.length === 0
                ? 'No email scans recorded in the database yet. Scanned emails will automatically be saved here.'
                : 'No records matched your search query.'}
            </p>
          </div>
        )}
      </div>

      {/* Scan Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                  Scan #{selectedRecord.id}
                </span>
                <h3 className="text-sm font-bold text-white">Scan Audit Details</h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-xs text-slate-400 uppercase font-mono block mb-1">Subject</span>
                <p className="text-sm font-semibold text-white bg-slate-950 p-3 rounded-lg border border-slate-800">
                  {selectedRecord.subject || 'Untitled Email'}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-400 uppercase font-mono block mb-1">Message Preview / Snippet</span>
                <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed font-sans">
                  {selectedRecord.snippet || 'No message snippet stored.'}
                </p>
              </div>

              {/* Risk Score & Assessment */}
              {(() => {
                const sProb = selectedRecord.spam_probability ?? (selectedRecord.predicted_class === 'spam' ? selectedRecord.confidence : 100 - selectedRecord.confidence);
                const rScore = selectedRecord.risk_score ?? Math.round(sProb);
                const rCat = selectedRecord.risk_category || (rScore >= 70 ? 'High Risk' : rScore >= 30 ? 'Medium Risk' : 'Low Risk');
                const rLevel = rScore >= 70 ? 'high' : rScore >= 30 ? 'medium' : 'low';
                return (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 uppercase flex items-center space-x-1.5">
                        <Shield className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Email Risk Score:</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                        rLevel === 'high'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                          : rLevel === 'medium'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                      }`}>
                        {rScore} / 100 · {rCat}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          rLevel === 'high' ? 'bg-rose-500' : (rLevel === 'medium' ? 'bg-amber-500' : 'bg-emerald-500')
                        }`}
                        style={{ width: `${rScore}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 block">Classification:</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                    selectedRecord.predicted_class === 'spam'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    {selectedRecord.predicted_class.toUpperCase()}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 block">Timestamp:</span>
                  <span className="text-slate-200 text-[11px] block truncate">
                    {new Date(selectedRecord.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Probabilities */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-300 uppercase font-mono block">
                  Model Estimated Conditional Probabilities
                </span>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-emerald-400">
                      Ham: {selectedRecord.ham_probability !== undefined ? selectedRecord.ham_probability.toFixed(1) : (selectedRecord.predicted_class === 'ham' ? selectedRecord.confidence.toFixed(1) : (100 - selectedRecord.confidence).toFixed(1))}%
                    </span>
                    <span className="text-rose-400">
                      Spam: {selectedRecord.spam_probability !== undefined ? selectedRecord.spam_probability.toFixed(1) : (selectedRecord.predicted_class === 'spam' ? selectedRecord.confidence.toFixed(1) : (100 - selectedRecord.confidence).toFixed(1))}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500"
                      style={{
                        width: `${selectedRecord.ham_probability !== undefined ? selectedRecord.ham_probability : (selectedRecord.predicted_class === 'ham' ? selectedRecord.confidence : 100 - selectedRecord.confidence)}%`,
                      }}
                    />
                    <div
                      className="bg-rose-500"
                      style={{
                        width: `${selectedRecord.spam_probability !== undefined ? selectedRecord.spam_probability : (selectedRecord.predicted_class === 'spam' ? selectedRecord.confidence : 100 - selectedRecord.confidence)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => handleDownloadReportById(selectedRecord.id)}
                disabled={downloadingId === selectedRecord.id}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
              >
                {downloadingId === selectedRecord.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Download PDF Report</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
