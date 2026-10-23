import React, { useState, useRef } from 'react';
import {
  MailSearch,
  UploadCloud,
  FileText,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  RotateCcw,
  CheckCircle2,
  FileDown,
  Info,
  Shield,
  AlertOctagon,
} from 'lucide-react';
import { api, triggerFileDownload } from '../services/api';
import { PredictionResult } from '../types';

const CircularRiskGauge: React.FC<{ score: number; level: 'low' | 'medium' | 'high' }> = ({ score, level }) => {
  const safeScore = typeof score === 'number' && !isNaN(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
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

const SAMPLE_TEMPLATES = [
  {
    title: 'Bank Account Phishing Alert',
    type: 'spam',
    subject: 'URGENT: Your Bank Account Access Has Been Suspended',
    body: 'Your financial account security has been compromised. Immediate action is required to avoid permanent suspension. Please visit our verification portal to confirm your password and identity now.',
  },
  {
    title: 'Sweepstakes Prize Winner',
    type: 'spam',
    subject: 'CONGRATULATIONS! You have been chosen for a $1,000,000 cash payout',
    body: 'You have been selected as our grand prize winner of $1,000,000 cash. To claim your prize immediately, reply with your personal details and wire routing numbers today. Guaranteed payout with no risk!',
  },
  {
    title: 'Platform Maintenance Notice',
    type: 'ham',
    subject: 'Scheduled system maintenance and server downtime',
    body: 'Here is the agenda for tomorrow morning staff meeting: 1. Server maintenance schedule 2. Capacity volume targets 3. System upgrades. See you in conference room 3.',
  },
  {
    title: 'Team Project Status Review',
    type: 'ham',
    subject: 'Quarterly review notes and forecast deliverables',
    body: 'Attached are the volume forecasts and budget reviews for through October. Demand remains steady with operating efficiency at 94%. Please send any comments before Thursday.',
  },
];

export const ScannerPage: React.FC = () => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTemplateClick = (t: typeof SAMPLE_TEMPLATES[0]) => {
    setSubject(t.subject);
    setBody(t.body);
    setFile(null);
    setError(null);
    setReportError(null);
    setResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setSubject(selectedFile.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        setBody((event.target?.result as string) || '');
      };
      reader.readAsText(selectedFile);
      setError(null);
      setReportError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasSubject = Boolean(subject.trim());
    const hasBody = Boolean(body.trim());
    const hasFile = Boolean(file);

    if (!hasSubject && !hasBody && !hasFile) {
      setError('Please enter an email subject line or message text to analyze.');
      return;
    }

    setLoading(true);
    setError(null);
    setReportError(null);
    setResult(null);

    try {
      let res: PredictionResult;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await api.predictEmailFile(formData);
      } else {
        res = await api.predictEmail({
          subject: subject.trim(),
          body: body.trim(),
        });
      }

      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Email analysis is temporarily unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSubject('');
    setBody('');
    setFile(null);
    setResult(null);
    setError(null);
    setReportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Safe extraction of probabilities from prediction result
  const rawSpamProb = result ? (result.spam_probability ?? result.class_probabilities?.spam) : undefined;
  const rawHamProb = result ? (result.ham_probability ?? result.class_probabilities?.ham) : undefined;

  const spamProb = typeof rawSpamProb === 'number'
    ? +rawSpamProb.toFixed(2)
    : (result ? (result.predicted_class === 'spam' ? +result.confidence_percentage.toFixed(2) : +(100 - result.confidence_percentage).toFixed(2)) : 0);

  const hamProb = typeof rawHamProb === 'number'
    ? +rawHamProb.toFixed(2)
    : (result ? (result.predicted_class === 'ham' ? +result.confidence_percentage.toFixed(2) : +(100 - result.confidence_percentage).toFixed(2)) : 0);

  // Directly map actual Spam probability to 0-100 risk score (e.g. 47.84% -> 48)
  const currentRiskScore = result
    ? (typeof result.risk_score === 'number' && !isNaN(result.risk_score)
        ? Math.max(0, Math.min(100, Math.round(result.risk_score)))
        : Math.max(0, Math.min(100, Math.round(spamProb))))
    : 0;

  const currentRiskLevel: 'low' | 'medium' | 'high' =
    result?.risk_level || (currentRiskScore >= 70 ? 'high' : currentRiskScore >= 30 ? 'medium' : 'low');

  const currentRiskCategory: string =
    result?.risk_category || (currentRiskScore >= 70 ? 'High Risk' : currentRiskScore >= 30 ? 'Medium Risk' : 'Low Risk');

  const handleDownloadReport = async () => {
    if (!result) return;
    setDownloadingReport(true);
    setReportError(null);
    try {
      const payload = {
        subject: subject.trim() || result.subject_snippet || 'Untitled Email',
        predicted_class: result.predicted_class,
        confidence_percentage: result.confidence_percentage,
        spam_probability: spamProb,
        ham_probability: hamProb,
        risk_score: currentRiskScore,
        risk_category: currentRiskCategory,
        verdict_summary: result.verdict_summary,
        warning_signs: result.warning_signs || [],
        recommended_precautions: result.recommended_precautions || [],
      };
      const blob = await api.downloadScanReport(payload);
      const dateStr = new Date().toISOString().split('T')[0];
      triggerFileDownload(blob, `ProbMail_Scan_Report_${dateStr}.pdf`);
    } catch (err: any) {
      setReportError(err.message || 'Failed to download scan report.');
    } finally {
      setDownloadingReport(false);
    }
  };

  const copyVerdict = () => {
    if (!result) return;
    const text = `ProbMail Security Verdict: ${result.predicted_class.toUpperCase()} (${currentRiskCategory} - Score: ${currentRiskScore}/100)\nSpam Probability: ${spamProb}%\nHam Probability: ${hamProb}%\nSubject: ${subject || result.subject_snippet}\nSummary: ${result.verdict_summary}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Email Scanner</h1>
        <p className="text-sm text-slate-400 mt-1">
          Enter an email subject and message to check whether it is legitimate (Ham) or suspicious (Spam).
        </p>
      </div>

      {/* Quick Test Samples */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Try a Sample Email</span>
          </span>
          <span className="text-xs text-slate-500">Click any card to populate form</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {SAMPLE_TEMPLATES.map((tmpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleTemplateClick(tmpl)}
              className={`p-2.5 rounded-lg border text-left text-xs font-medium transition flex items-center justify-between ${
                tmpl.type === 'spam'
                  ? 'border-rose-900/40 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40 hover:border-rose-700'
                  : 'border-emerald-900/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40 hover:border-emerald-700'
              }`}
            >
              <span className="truncate pr-2">{tmpl.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase shrink-0 ${
                tmpl.type === 'spam' ? 'bg-rose-900/60 text-rose-200' : 'bg-emerald-900/60 text-emerald-200'
              }`}>
                {tmpl.type}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Input Form + Result Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Input */}
        <div className="lg:col-span-6 space-y-4">
          <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-md">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Action Required: Please verify your account..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-sans"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Email Message Body
                </label>
                <span className="text-[11px] text-slate-500 font-mono">
                  {body ? `${body.split(/\s+/).filter(Boolean).length} words` : '0 words'}
                </span>
              </div>
              <textarea
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Paste the email content or message body here..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-sans leading-relaxed"
              />
            </div>

            {/* Optional File Upload */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400 flex items-center space-x-1.5 cursor-pointer hover:text-cyan-400 transition">
                  <UploadCloud className="w-4 h-4 text-slate-400" />
                  <span>Upload email text file (.txt, .eml)</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.eml"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {file && (
                  <span className="text-xs text-cyan-400 font-mono flex items-center space-x-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{file.name}</span>
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-950/50 transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing Email...</span>
                  </>
                ) : (
                  <>
                    <MailSearch className="w-4 h-4" />
                    <span>Analyze Email</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium border border-slate-700 transition flex items-center space-x-1.5"
                title="Reset input fields"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Output: Verdict & Analysis Card */}
        <div className="lg:col-span-6 space-y-4">
          {result ? (
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-5 shadow-xl animate-in fade-in duration-200">
              {/* Verdict Header Badge */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Scan Analysis Results
                </span>
                <button
                  onClick={copyVerdict}
                  className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 transition"
                  title="Copy verdict to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* 1. Classification Result */}
              <div
                className={`p-4 rounded-xl border flex items-center space-x-4 ${
                  result.predicted_class === 'spam'
                    ? 'bg-rose-950/40 border-rose-700/80 text-rose-300'
                    : 'bg-emerald-950/40 border-emerald-700/80 text-emerald-300'
                }`}
              >
                <div
                  className={`p-3 rounded-lg border shrink-0 ${
                    result.predicted_class === 'spam'
                      ? 'bg-rose-900/40 border-rose-600 text-rose-400'
                      : 'bg-emerald-900/40 border-emerald-600 text-emerald-400'
                  }`}
                >
                  {result.predicted_class === 'spam' ? (
                    <ShieldAlert className="w-8 h-8" />
                  ) : (
                    <ShieldCheck className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider opacity-80">
                    Predicted Classification
                  </div>
                  <div className="text-2xl font-extrabold tracking-tight">
                    {result.predicted_class === 'spam' ? 'SPAM / SUSPICIOUS' : 'HAM / LEGITIMATE'}
                  </div>
                  <div className="text-xs mt-0.5 font-medium">
                    {result.confidence_percentage.toFixed(1)}% Model Confidence
                  </div>
                </div>
              </div>

              {/* 2. Email Risk Score (0-100) */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Email Risk Score</span>
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                      currentRiskLevel === 'high'
                        ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                        : currentRiskLevel === 'medium'
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                        : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                    }`}
                  >
                    {currentRiskCategory}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                  <CircularRiskGauge score={currentRiskScore} level={currentRiskLevel} />
                  <div className="space-y-1.5 text-xs text-slate-300 flex-1">
                    <div className="text-xs text-slate-400">
                      Risk Tier Thresholds:
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                      <div className={`p-1.5 rounded border text-center ${currentRiskLevel === 'low' ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300 font-bold' : 'border-slate-800 bg-slate-900/60 text-slate-500'}`}>
                        0–29 Low
                      </div>
                      <div className={`p-1.5 rounded border text-center ${currentRiskLevel === 'medium' ? 'border-amber-700 bg-amber-950/40 text-amber-300 font-bold' : 'border-slate-800 bg-slate-900/60 text-slate-500'}`}>
                        30–69 Med
                      </div>
                      <div className={`p-1.5 rounded border text-center ${currentRiskLevel === 'high' ? 'border-rose-700 bg-rose-950/40 text-rose-300 font-bold' : 'border-slate-800 bg-slate-900/60 text-slate-500'}`}>
                        70–100 High
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight pt-1">
                      Score is derived from the model's estimated Spam probability ({spamProb}%). It is a statistical estimate, not a guarantee of safety.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Estimated Posterior Probabilities */}
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span className="text-emerald-400 font-semibold">Legitimate (Ham): {hamProb}%</span>
                  <span className="text-rose-400 font-semibold">Spam: {spamProb}%</span>
                </div>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${hamProb}%` }}
                    title={`Ham: ${hamProb}%`}
                  />
                  <div
                    className="bg-rose-500 transition-all duration-500"
                    style={{ width: `${spamProb}%` }}
                    title={`Spam: ${spamProb}%`}
                  />
                </div>
              </div>

              {/* 4. Why Was This Email Flagged? */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <AlertOctagon className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      Why Was This Email Flagged?
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Detected Warning Signs
                  </span>
                </div>

                <div className="space-y-2.5">
                  {result.warning_signs && result.warning_signs.length > 0 ? (
                    result.warning_signs.map((ws, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white flex items-center space-x-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              result.risk_level === 'high' ? 'bg-rose-400' : (result.risk_level === 'medium' ? 'bg-amber-400' : 'bg-emerald-400')
                            }`} />
                            <span>{ws.title}</span>
                          </span>
                          {ws.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              {ws.category}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 font-sans leading-relaxed">
                          {ws.detail}
                        </p>
                        {ws.highlighted_phrase && (
                          <div className="pt-1 flex items-center space-x-1.5">
                            <span className="text-[10px] text-slate-500 font-mono">Detected cue:</span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-slate-700/60">
                              "{ws.highlighted_phrase}"
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                      The model classified this email based on learned text patterns; no reliable feature-level explanation is available.
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Recommended Security Precautions */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Recommended Security Precautions
                  </h3>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300 font-sans">
                  {result.recommended_precautions && result.recommended_precautions.length > 0 ? (
                    result.recommended_precautions.map((prec, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{prec}</span>
                      </li>
                    ))
                  ) : (
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Exercise standard caution and verify sender identity if email requests sensitive actions.</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* 6 & 7. Action Buttons: Download Scan Report & Scan Another Email */}
              <div className="space-y-2 pt-1">
                {reportError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{reportError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDownloadReport}
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

                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center justify-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Scan Another Email</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-10 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center text-slate-500 space-y-3">
              <MailSearch className="w-10 h-10 mx-auto text-slate-600" />
              <h4 className="text-sm font-semibold text-slate-400">Scanner Ready</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto font-sans">
                Enter an email subject and message on the left, or select a sample email above to analyze.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
