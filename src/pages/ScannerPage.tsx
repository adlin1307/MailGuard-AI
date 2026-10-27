import React, { useState, useRef } from 'react';
import {
  MailSearch,
  UploadCloud,
  FileText,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { api, triggerFileDownload } from '../services/api';
import { PredictionResult } from '../types';
import { StatisticalAnalysisView } from '../components/StatisticalAnalysisView';

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

  // Directly map actual Spam probability to 0-100 risk score
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

  const handleSubjectChange = (val: string) => {
    setSubject(val);
    if (file) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    if (result) setResult(null);
  };

  const handleBodyChange = (val: string) => {
    setBody(val);
    if (file) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    if (result) setResult(null);
  };

  const isEmlFile = Boolean(file && file.name.toLowerCase().endsWith('.eml'));
  const isTxtFile = Boolean(file && file.name.toLowerCase().endsWith('.txt'));

  const scanButtonLabel = file
    ? (isEmlFile ? 'Analyze Email File' : isTxtFile ? 'Analyze Text File' : 'Analyze File')
    : 'Analyze Text';

  const scanLoadingLabel = file
    ? (isEmlFile ? 'Analyzing Email File...' : isTxtFile ? 'Analyzing Text File...' : 'Analyzing File...')
    : 'Analyzing Text...';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Email &amp; File Scanner</h1>
        <p className="text-sm text-slate-400 mt-1">
          Enter text or upload an email file (.eml, .txt) to check whether it is legitimate (Ham) or suspicious (Spam).
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
                Email Subject / File Name
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
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
                onChange={(e) => handleBodyChange(e.target.value)}
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
                    <span>{scanLoadingLabel}</span>
                  </>
                ) : (
                  <>
                    <MailSearch className="w-4 h-4" />
                    <span>{scanButtonLabel}</span>
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
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl animate-in fade-in duration-200">
              <StatisticalAnalysisView
                predictedClass={result.predicted_class}
                confidencePercentage={result.confidence_percentage}
                spamProbability={spamProb}
                hamProbability={hamProb}
                riskScore={currentRiskScore}
                riskCategory={currentRiskCategory}
                riskLevel={currentRiskLevel}
                verdictTitle={result.verdict_title}
                verdictSummary={result.verdict_summary}
                explanation={result.explanation}
                influentialFeatures={result.influential_features}
                warningSigns={result.warning_signs}
                suspiciousPhrases={result.suspicious_phrases}
                detectedLinks={result.detected_links}
                chi2Summary={result.chi2_summary || result.analysis_details?.chi2_summary}
                recommendedPrecautions={result.recommended_precautions}
                uploadInfo={
                  result.upload_info ||
                  (file
                    ? {
                        filename: file.name,
                        label: file.name.toLowerCase().endsWith('.eml')
                          ? 'Uploaded .EML File'
                          : 'Uploaded .TXT File',
                      }
                    : undefined)
                }
                showActions={true}
                onDownloadReport={handleDownloadReport}
                downloadingReport={downloadingReport}
                reportError={reportError}
                onClear={handleClear}
              />
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
