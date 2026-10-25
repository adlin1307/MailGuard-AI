import React, { useEffect, useState } from 'react';
import {
  Mail,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Inbox,
  AlertCircle,
  History,
  Lock,
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { DashboardData } from '../types';
import { api } from '../services/api';
import { PageId } from '../components/Sidebar';

interface DashboardPageProps {
  onNavigate: (page: PageId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Email analysis is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading security dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-800 text-rose-300 flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 mt-0.5 text-rose-400 shrink-0" />
        <div>
          <h4 className="font-semibold text-sm">Service Notice</h4>
          <p className="text-xs mt-1 text-rose-400">{error}</p>
          <button
            onClick={fetchDashboard}
            className="mt-3 px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-xs font-medium text-white transition"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    total_analyzed: 0,
    spam_detected: 0,
    ham_detected: 0,
    spam_percentage: 0,
    ham_percentage: 0,
  };

  const recentPredictions = data?.recent_predictions || [];

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 font-mono">
                ProbMail Security
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Spam &amp; Ham Email Classification
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-sans">
              Check suspicious emails using intelligent Spam and Ham classification backed by Bayesian probabilistic modeling.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('inbox')}
              className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-cyan-500/25 transition transform active:scale-95"
            >
              <Inbox className="w-4 h-4" />
              <span>Open Mailbox</span>
            </button>
            <button
              onClick={() => onNavigate('scanner')}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center space-x-2 transition"
            >
              <ArrowRight className="w-4 h-4 text-cyan-400" />
              <span>Email Scanner</span>
            </button>
            <button
              onClick={() => onNavigate('history')}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center space-x-2 transition"
            >
              <History className="w-4 h-4 text-cyan-400" />
              <span>Scan History</span>
            </button>
          </div>
        </div>
      </div>

      {/* User-Facing Security Activity KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Emails Scanned"
          value={metrics.total_analyzed}
          subtext="Total emails analyzed on platform"
          icon={<Mail className="w-5 h-5" />}
          variant="cyan"
          badge="Audit Log"
        />
        <MetricCard
          title="Classified as Spam"
          value={metrics.spam_detected}
          subtext={`${metrics.spam_percentage}% of analyzed emails`}
          icon={<ShieldAlert className="w-5 h-5" />}
          variant="rose"
          badge="Spam"
        />
        <MetricCard
          title="Classified as Ham"
          value={metrics.ham_detected}
          subtext={`${metrics.ham_percentage}% of analyzed emails`}
          icon={<ShieldCheck className="w-5 h-5" />}
          variant="emerald"
          badge="Ham"
        />
        <MetricCard
          title="Scanner Status"
          value="Active"
          subtext="Classification engine ready"
          icon={<Lock className="w-5 h-5" />}
          variant="cyan"
          badge="Online"
        />
      </div>

      {/* How the Scanner Works */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">How ProbMail Protects You</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Simple 3-step email threat analysis workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 text-xs font-bold font-mono">
              1
            </div>
            <h3 className="text-sm font-semibold text-white">Enter Email</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Enter the subject line and paste the email body message or upload an .eml file into the scanner.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 text-xs font-bold font-mono">
              2
            </div>
            <h3 className="text-sm font-semibold text-white">Automated Analysis</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              The engine automatically analyzes lexical patterns, urgency cues, and token probabilities in real time.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 text-xs font-bold font-mono">
              3
            </div>
            <h3 className="text-sm font-semibold text-white">Instant Verdict &amp; PDF Report</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              View a clear Spam or Ham classification with confidence scores, risk gauge, and download a security report.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Scans Table */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Recent Scanned Emails</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Previously analyzed emails logged in your local scan history.
            </p>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs text-cyan-400 hover:underline flex items-center space-x-1 font-medium"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentPredictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                  <th className="py-2.5 px-3 font-sans">Email Subject / Preview</th>
                  <th className="py-2.5 px-3 font-sans">Verdict</th>
                  <th className="py-2.5 px-3 font-sans">Spam Probability</th>
                  <th className="py-2.5 px-3 font-sans">Ham Probability</th>
                  <th className="py-2.5 px-3 text-right font-sans">Date &amp; Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {recentPredictions.map((pred) => (
                  <tr key={pred.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-200 truncate max-w-xs sm:max-w-md font-sans">
                        {pred.subject || 'Untitled Email'}
                      </div>
                      {pred.snippet && (
                        <div className="text-[11px] text-slate-500 truncate max-w-xs sm:max-w-md font-sans">
                          {pred.snippet}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {pred.predicted_class === 'spam' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800 font-sans">
                          SPAM
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-sans">
                          HAM
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-rose-400">
                      {pred.spam_probability !== undefined ? `${pred.spam_probability.toFixed(1)}%` : `${pred.confidence.toFixed(1)}%`}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">
                      {pred.ham_probability !== undefined ? `${pred.ham_probability.toFixed(1)}%` : `${(100 - pred.confidence).toFixed(1)}%`}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {new Date(pred.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-slate-500 space-y-3">
            <Inbox className="w-10 h-10 mx-auto text-slate-600" />
            <h4 className="text-sm font-semibold text-slate-400">No Emails Scanned Yet</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto font-sans">
              Enter an email into the scanner to test suspicious links or verify safe messages.
            </p>
            <button
              onClick={() => onNavigate('scanner')}
              className="mt-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
            >
              Scan Your First Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
