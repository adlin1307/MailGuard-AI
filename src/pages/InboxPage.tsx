import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  AlertTriangle,
  Star,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Reply,
  ShieldCheck,
  ShieldAlert,
  Clock,
  User as UserIcon,
  X,
  FileDown,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  Shield,
  Layers,
  ExternalLink,
  Loader2,
  FileEdit,
  CheckCircle,
} from 'lucide-react';
import { mailService, MailItem, DraftItem } from '../services/mail-service';
import { User } from '../services/auth-service';
import { mlEngine } from '../services/ml-engine';
import { api } from '../services/api';
import { generateScanReportPdf, triggerFileDownload } from '../services/pdf-generator';
import { PredictionResult } from '../types';
import { StatisticalAnalysisView } from '../components/StatisticalAnalysisView';

interface InboxPageProps {
  currentUser: User;
  onLogout?: () => void;
}

type MailFolder = 'inbox' | 'spam' | 'sent' | 'starred' | 'drafts';

export const InboxPage: React.FC<InboxPageProps> = ({ currentUser, onLogout }) => {
  const [currentFolder, setCurrentFolder] = useState<MailFolder>('inbox');
  const [mails, setMails] = useState<MailItem[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVerdict, setFilterVerdict] = useState<'all' | 'spam' | 'ham'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Compose Modal State
  const [showCompose, setShowCompose] = useState(false);
  const [composeDraftId, setComposeDraftId] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSuccess, setComposeSuccess] = useState<string | null>(null);

  // Debounced live pre-flight classification preview state
  const [livePreview, setLivePreview] = useState<PredictionResult | null>(null);
  const [isCheckingPreview, setIsCheckingPreview] = useState(false);

  // Sent recipients history for the current user
  const [sentRecipients, setSentRecipients] = useState<{ email: string; name: string }[]>([]);
  const [recipientSuggestions, setRecipientSuggestions] = useState<{ email: string; name: string }[]>([]);

  // Load emails and drafts
  const loadMails = async () => {
    setIsRefreshing(true);

    try {
      await mailService.syncWithBackend();
    } catch {
      // fallback to local storage
    }

    let list: MailItem[] = [];
    if (currentFolder === 'inbox') {
      list = mailService.getInbox(currentUser.email);
    } else if (currentFolder === 'spam') {
      list = mailService.getSpam(currentUser.email);
    } else if (currentFolder === 'sent') {
      list = mailService.getSent(currentUser.email);
    } else if (currentFolder === 'starred') {
      list = mailService.getStarred(currentUser.email);
    }

    setMails(list);

    // Refresh selected mail if open
    if (selectedMail) {
      const refreshed = list.find((m) => m.id === selectedMail.id);
      if (refreshed) {
        setSelectedMail(refreshed);
      }
    }

    // Load drafts and sent recipients
    try {
      const [userDrafts, userRecipients] = await Promise.all([
        mailService.getDrafts(),
        mailService.getSentRecipients(),
      ]);
      setDrafts(userDrafts);
      setSentRecipients(userRecipients);
    } catch {
      // ignore
    }

    setIsRefreshing(false);
  };

  useEffect(() => {
    loadMails();
  }, [currentFolder, currentUser.email]);

  // Reset Show Analysis visibility whenever switching to another email or deselecting
  useEffect(() => {
    setShowAnalysis(false);
    setLoadingAnalysis(false);
  }, [selectedMail?.id]);

  const handleToggleAnalysis = async () => {
    if (showAnalysis) {
      setShowAnalysis(false);
      return;
    }
    if (!selectedMail) return;

    // If probabilities or Chi-Square statistics are missing on this email, query real backend ML without recording history
    const needsEnrichment =
      selectedMail.spamProbability === undefined ||
      !selectedMail.chi2Summary ||
      (selectedMail.topIndicators &&
        selectedMail.topIndicators.length > 0 &&
        selectedMail.topIndicators.some(
          (ind) => ind.chi2Score === undefined && (ind as any).chi2_score === undefined
        ));

    if (
      needsEnrichment &&
      (selectedMail.subject?.trim() || selectedMail.body?.trim())
    ) {
      setLoadingAnalysis(true);
      try {
        const pred = await api.predictEmail({
          subject: selectedMail.subject,
          body: selectedMail.body,
          record_history: false,
        });
        if (pred && pred.status === 'success') {
          const updated: MailItem = {
            ...selectedMail,
            isSpam: pred.predicted_class === 'spam',
            predictedClass: pred.predicted_class as 'ham' | 'spam',
            spamProbability:
              pred.spam_probability ??
              (pred.predicted_class === 'spam'
                ? pred.confidence_percentage
                : 100 - pred.confidence_percentage),
            hamProbability:
              pred.ham_probability ??
              (pred.predicted_class === 'ham'
                ? pred.confidence_percentage
                : 100 - (pred.spam_probability ?? 50)),
            riskScore: pred.risk_score ?? Math.round(pred.spam_probability ?? 0),
            topIndicators: (pred.influential_features || []).map((f) => ({
              token: f.word,
              logOdds: f.log_odds ?? f.impact_score ?? 0,
              impact: (f.predicted_impact || (f.polarity === 'spam' || f.badge === 'danger' ? 'spam' : 'ham')) as 'spam' | 'ham',
              chi2Score: f.chi2_score,
              pValue: f.p_value,
              pValueFormatted: f.p_value_formatted,
              trainingAssociation: f.training_association,
              predictionContribution: f.prediction_contribution,
              interpretation: f.interpretation,
              isSignificant: f.is_significant,
              significanceStatus: f.significance_status,
              classAssociation: f.class_association,
            })),
            flagReasons: (pred.warning_signs || []).map((w) => ({
              title: typeof w === 'string' ? 'Warning' : w.title || 'Warning',
              detail: typeof w === 'string' ? w : w.detail,
              category: typeof w === 'string' ? 'Warning' : w.category || 'Warning',
              highlighted_phrase: typeof w === 'string' ? undefined : w.highlighted_phrase,
            })),
            explanation: pred.verdict_summary || pred.explanation,
            suspiciousPhrases: pred.suspicious_phrases,
            detectedLinks: pred.detected_links,
            chi2Summary: pred.chi2_summary,
          };
          setSelectedMail(updated);
          setMails((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      } catch (err) {
        console.warn('Could not retrieve on-demand analysis for email:', err);
      } finally {
        setLoadingAnalysis(false);
      }
    }
    setShowAnalysis(true);
  };

  const handleSelectMail = (mail: MailItem) => {
    mailService.markAsRead(mail.id);
    setSelectedMail({ ...mail, isRead: true });
    setShowAnalysis(false);
    setMails((prev) =>
      prev.map((m) => (m.id === mail.id ? { ...m, isRead: true } : m))
    );
  };

  const handleToggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    mailService.toggleStar(id);
    setMails((prev) =>
      prev.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m))
    );
    if (selectedMail && selectedMail.id === id) {
      setSelectedMail((prev) => (prev ? { ...prev, starred: !prev.starred } : null));
    }
  };

  const handleToggleSpam = async (id: string) => {
    await mailService.toggleSpam(id);
    await loadMails();
    if (selectedMail && selectedMail.id === id) {
      setSelectedMail(null);
    }
  };

  const handleDelete = (id: string) => {
    mailService.deleteMail(id);
    if (selectedMail?.id === id) {
      setSelectedMail(null);
    }
    loadMails();
  };

  const handleDownloadPdf = (mail: MailItem) => {
    const pdfBlob = generateScanReportPdf({
      id: 1,
      subject: mail.subject,
      predicted_class: mail.predictedClass,
      confidence_percentage: mail.confidence,
      spam_probability: mail.spamProbability,
      ham_probability: mail.hamProbability,
      risk_score: mail.riskScore,
      risk_level: mail.riskLevel,
      verdict_summary: mail.isSpam ? 'Flagged as Spam' : 'Verified Safe Ham',
      timestamp: mail.timestamp,
    });

    triggerFileDownload(
      pdfBlob,
      `ProbMail_Security_Audit_${mail.predictedClass.toUpperCase()}_${Date.now()}.pdf`
    );
  };

  const handleOpenCompose = (
    prefillTo?: string,
    prefillSubject?: string,
    draftId?: string,
    prefillBody?: string
  ) => {
    setComposeDraftId(draftId || null);
    setComposeTo(prefillTo || '');
    setComposeSubject(prefillSubject || '');
    setComposeBody(prefillBody || '');
    setRecipientSuggestions([]);
    setComposeError(null);
    setComposeSuccess(null);
    setDraftNotice(null);
    setLivePreview(null);
    setIsCheckingPreview(false);
    setShowCompose(true);
  };

  const handleOpenDraft = (draft: DraftItem) => {
    handleOpenCompose(draft.recipientEmail, draft.subject, draft.id, draft.body);
  };

  const handleSaveDraft = async (isAutosave = false) => {
    const hasContent = Boolean(
      composeTo.trim() || composeSubject.trim() || composeBody.trim()
    );
    if (!hasContent) {
      return;
    }

    setIsSavingDraft(true);
    try {
      const activeDraftId =
        composeDraftId ||
        `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const saved = await mailService.saveDraft({
        id: activeDraftId,
        recipientEmail: composeTo.trim(),
        subject: composeSubject.trim(),
        body: composeBody.trim(),
      });

      if (saved && saved.id) {
        setComposeDraftId(saved.id);
      } else {
        setComposeDraftId(activeDraftId);
      }

      // Refresh drafts list without full page reload
      const updatedDrafts = await mailService.getDrafts();
      setDrafts(updatedDrafts);

      setDraftNotice(isAutosave ? 'Draft autosaved' : 'Draft saved');
      setTimeout(() => setDraftNotice(null), 3000);
    } catch (err: any) {
      if (!isAutosave) {
        setComposeError('Failed to save draft: ' + (err.message || 'Server error'));
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleCloseCompose = async () => {
    // Preserve unsent content as draft if user entered anything
    const hasContent = Boolean(
      composeTo.trim() || composeSubject.trim() || composeBody.trim()
    );
    if (hasContent && !composeSuccess) {
      await handleSaveDraft(true);
    }
    setShowCompose(false);
    setComposeDraftId(null);
    setRecipientSuggestions([]);
  };

  const handleDeleteDraft = async (draftId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await mailService.deleteDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      if (composeDraftId === draftId) {
        setComposeDraftId(null);
      }
    } catch (err) {
      console.warn('Failed to delete draft:', err);
    }
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeError(null);
    setComposeSuccess(null);

    if (!composeTo.trim()) {
      setComposeError('Please enter a recipient email.');
      return;
    }
    if (!composeSubject.trim()) {
      setComposeError('Please provide a subject line.');
      return;
    }
    if (!composeBody.trim()) {
      setComposeError('Please enter an email message.');
      return;
    }

    setComposeSending(true);
    try {
      await mailService.sendMail({
        from: currentUser,
        toEmail: composeTo,
        subject: composeSubject,
        body: composeBody,
        draftId: composeDraftId || undefined,
      });

      setComposeSuccess(
        `Message sent to in-app recipient (${composeTo.trim()}). Stored in Sent mail.`
      );
      setComposeDraftId(null);
      setTimeout(() => {
        setShowCompose(false);
        setComposeSending(false);
        loadMails();
      }, 1000);
    } catch (err: any) {
      setComposeError(err.message || 'Failed to send mail.');
      setComposeSending(false);
    }
  };

  // Debounced pre-flight classification preview (decoupled from render body)
  useEffect(() => {
    // If compose modal is closed or inputs are empty, clear preview and do nothing
    if (!showCompose || (!composeSubject.trim() && !composeBody.trim())) {
      setLivePreview(null);
      setIsCheckingPreview(false);
      return;
    }

    setIsCheckingPreview(true);
    let isCancelled = false;

    // 350ms debounce window to prevent prediction execution on every keystroke
    const timer = setTimeout(() => {
      if (isCancelled) return;
      try {
        // Non-persisting pre-flight check (recordHistory = false) to protect scan history
        const result = mlEngine.predictEmail(composeSubject, composeBody, false);
        if (!isCancelled) {
          setLivePreview(result);
          setIsCheckingPreview(false);
        }
      } catch {
        if (!isCancelled) {
          setIsCheckingPreview(false);
        }
      }
    }, 350);

    // Cancel timer and mark request stale on input change, modal close, or unmount
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [showCompose, composeSubject, composeBody]);

  // Preserve draft on window refresh/unload if user is composing
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (showCompose && (composeTo.trim() || composeSubject.trim() || composeBody.trim())) {
        const draftPayload = {
          id: composeDraftId || `draft_${Date.now()}_autosave`,
          recipient_email: composeTo.trim(),
          subject: composeSubject.trim(),
          body: composeBody.trim(),
        };
        const token = localStorage.getItem('probmail_auth_token');
        if (token && navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(draftPayload)], { type: 'application/json' });
          navigator.sendBeacon(`/api/mailbox/drafts?token=${encodeURIComponent(token)}`, blob);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [showCompose, composeTo, composeSubject, composeBody, composeDraftId]);

  // Filter mails
  const filteredMails = mails.filter((m) => {
    const matchesSearch =
      m.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.fromName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.fromEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.body.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (filterVerdict === 'spam') return m.isSpam;
    if (filterVerdict === 'ham') return !m.isSpam;
    return true;
  });

  // Filter drafts
  const filteredDrafts = drafts.filter((d) => {
    const term = searchTerm.toLowerCase();
    return (
      (d.subject || '').toLowerCase().includes(term) ||
      (d.recipientEmail || '').toLowerCase().includes(term) ||
      (d.recipientName || '').toLowerCase().includes(term) ||
      (d.body || '').toLowerCase().includes(term)
    );
  });

  // Unread badge counters
  const inboxUnread = mailService.getInbox(currentUser.email).filter((m) => !m.isRead).length;
  const spamCount = mailService.getSpam(currentUser.email).length;
  const sentCount = mailService.getSent(currentUser.email).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F19] text-slate-100 font-sans overflow-hidden selection:bg-cyan-500 selection:text-black">
      {/* SINGLE UNIFIED TOP TOOLBAR: FOLDERS, COMPOSE & FILTERS */}
      <div className="border-b border-slate-800 bg-slate-900/70 backdrop-blur px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Compose Button + Folder Tab Pills */}
        <div className="flex items-center flex-wrap gap-2">
          {/* COMPOSE BUTTON */}
          <button
            onClick={() => handleOpenCompose()}
            className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Compose Mail</span>
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1 hidden sm:block" />

          {/* Folder Navigation Pills */}
          <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setCurrentFolder('inbox');
                setSelectedMail(null);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentFolder === 'inbox'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Inbox</span>
              {inboxUnread > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold bg-cyan-500 text-slate-950 ml-1">
                  {inboxUnread}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setCurrentFolder('spam');
                setSelectedMail(null);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentFolder === 'spam'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Spam &amp; Threats</span>
              {spamCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-700/50 ml-1">
                  {spamCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setCurrentFolder('sent');
                setSelectedMail(null);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentFolder === 'sent'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Sent</span>
              {sentCount > 0 && (
                <span className="text-[10px] text-slate-500 font-mono ml-1">{sentCount}</span>
              )}
            </button>

            <button
              onClick={() => {
                setCurrentFolder('starred');
                setSelectedMail(null);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentFolder === 'starred'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span>Starred</span>
            </button>

            <button
              onClick={() => {
                setCurrentFolder('drafts');
                setSelectedMail(null);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentFolder === 'drafts'
                  ? 'bg-purple-950 text-purple-300 border border-purple-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileEdit className="w-3.5 h-3.5 text-purple-400" />
              <span>Drafts</span>
              {drafts.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-700/50 ml-1">
                  {drafts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Search, Filter Verdict & Refresh */}
        <div className="flex items-center space-x-2.5 flex-1 justify-end max-w-xl">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[170px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search mail by subject, sender, body..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          {/* Filter Verdict Pills */}
          <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setFilterVerdict('all')}
              className={`px-2 py-1 rounded-md transition text-[11px] ${
                filterVerdict === 'all'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterVerdict('ham')}
              className={`px-2 py-1 rounded-md transition text-[11px] ${
                filterVerdict === 'ham'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ham
            </button>
            <button
              onClick={() => setFilterVerdict('spam')}
              className={`px-2 py-1 rounded-md transition text-[11px] ${
                filterVerdict === 'spam'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Spam
            </button>
          </div>

          {/* Previous Sent Recipients shortcut badges (displayed only if user has previously sent emails) */}
          {sentRecipients.length > 0 && (
            <div className="hidden xl:flex items-center space-x-1 pl-1">
              <span className="text-[10px] text-slate-500 font-mono">Send to:</span>
              <div className="flex items-center space-x-1">
                {sentRecipients.slice(0, 3).map((r) => (
                  <button
                    key={r.email}
                    onClick={() => handleOpenCompose(r.email, `Hello ${r.name || r.email.split('@')[0]}`)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 font-medium transition truncate max-w-[120px]"
                    title={`Send email to ${r.name ? `${r.name} (${r.email})` : r.email}`}
                  >
                    @{r.name ? r.name.split(' ')[0] : r.email.split('@')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={loadMails}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh Mailbox"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

        {/* CONTENT AREA: SPLIT VIEW OR FOCUSED EMAIL */}
        <div className="flex-1 flex overflow-hidden">
          {/* MAIL / DRAFTS LIST */}
          <div
            className={`${
              selectedMail ? 'hidden md:flex md:w-2/5' : 'flex w-full'
            } flex-col border-r border-slate-800 overflow-y-auto`}
          >
            {currentFolder === 'drafts' ? (
              filteredDrafts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
                  <FileEdit className="w-12 h-12 text-slate-600 stroke-[1.5]" />
                  <h4 className="text-sm font-semibold text-slate-400">No drafts saved</h4>
                  <p className="text-xs text-slate-500 max-w-xs">
                    {searchTerm
                      ? 'No drafts matched your search query.'
                      : 'Unsent emails are automatically saved here so you can finish and send them later.'}
                  </p>
                  <button
                    onClick={() => handleOpenCompose()}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
                  >
                    Compose New Email
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {filteredDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      onClick={() => handleOpenDraft(draft)}
                      className="p-4 cursor-pointer transition flex items-start space-x-3 bg-slate-900/30 hover:bg-slate-800/50 group"
                    >
                      <div className="mt-1 text-purple-400">
                        <FileEdit className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {draft.recipientEmail
                              ? `To: ${draft.recipientName ? `${draft.recipientName} (${draft.recipientEmail})` : draft.recipientEmail}`
                              : '(No Recipient Specified)'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-950/90 text-purple-300 border border-purple-800/80 shrink-0">
                            DRAFT
                          </span>
                        </div>

                        <div className="text-xs font-medium text-slate-100 truncate">
                          {draft.subject || '(Draft - No Subject)'}
                        </div>

                        <p className="text-[11px] text-slate-500 truncate">
                          {draft.body || '(Empty draft message)'}
                        </p>

                        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 font-mono">
                          <span>
                            Updated {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                            • {new Date(draft.updatedAt).toLocaleDateString()}
                          </span>

                          <button
                            onClick={(e) => handleDeleteDraft(draft.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 transition"
                            title="Discard Draft"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : filteredMails.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
                <Inbox className="w-12 h-12 text-slate-600 stroke-[1.5]" />
                <h4 className="text-sm font-semibold text-slate-400">No emails found</h4>
                <p className="text-xs text-slate-500 max-w-xs">
                  {searchTerm
                    ? 'No messages matched your search query.'
                    : currentFolder === 'spam'
                    ? 'Your spam folder is clean! No suspicious emails detected.'
                    : 'Your mailbox is empty. Click "+ Compose Mail" to send an email to any user.'}
                </p>
                <button
                  onClick={() => handleOpenCompose()}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
                >
                  Compose New Email
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {filteredMails.map((mail) => {
                  const isSelected = selectedMail?.id === mail.id;
                  return (
                    <div
                      key={mail.id}
                      onClick={() => handleSelectMail(mail)}
                      className={`p-4 cursor-pointer transition flex items-start space-x-3 ${
                        isSelected
                          ? 'bg-slate-800/80 border-l-4 border-cyan-400'
                          : mail.isRead
                          ? 'bg-transparent hover:bg-slate-900/60'
                          : 'bg-slate-900/40 hover:bg-slate-800/50'
                      }`}
                    >
                      {/* Star Button */}
                      <button
                        onClick={(e) => handleToggleStar(e, mail.id)}
                        className="mt-0.5 text-slate-600 hover:text-amber-400 transition"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            mail.starred ? 'text-amber-400 fill-amber-400' : ''
                          }`}
                        />
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Header: Sender & Classification Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2 truncate">
                            <span
                              className={`text-xs truncate ${
                                !mail.isRead ? 'font-bold text-white' : 'font-medium text-slate-300'
                              }`}
                            >
                              {currentFolder === 'sent'
                                ? `To: ${mail.toName}`
                                : mail.fromName || mail.fromEmail}
                            </span>
                            {!mail.isRead && (
                              <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                            )}
                          </div>

                          {/* Classification Pill */}
                          {mail.isSpam ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-950/90 text-rose-300 border border-rose-800/80 shrink-0 flex items-center space-x-1">
                              <ShieldAlert className="w-3 h-3 text-rose-400" />
                              <span>SPAM {mail.confidence.toFixed(0)}%</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950/90 text-emerald-300 border border-emerald-800/80 shrink-0 flex items-center space-x-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>HAM (SAFE)</span>
                            </span>
                          )}
                        </div>

                        {/* Subject */}
                        <div
                          className={`text-xs truncate ${
                            !mail.isRead ? 'font-bold text-slate-100' : 'text-slate-300'
                          }`}
                        >
                          {mail.subject || '(No Subject)'}
                        </div>

                        {/* Snippet */}
                        <p className="text-[11px] text-slate-500 truncate">{mail.body}</p>

                        {/* Timestamp */}
                        <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                          {new Date(mail.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          • {new Date(mail.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* EMAIL DETAIL READER */}
          <div
            className={`${
              selectedMail ? 'flex flex-1' : 'hidden md:flex md:flex-1'
            } flex-col bg-[#0B0F19] overflow-y-auto`}
          >
            {selectedMail ? (
              <div className="flex-1 flex flex-col p-6 sm:p-8 space-y-6 max-w-4xl">
                {/* Back button for mobile */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <button
                    onClick={() => setSelectedMail(null)}
                    className="md:hidden flex items-center space-x-1.5 text-xs text-cyan-400 font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to list</span>
                  </button>

                  <div className="flex items-center space-x-2 ml-auto">
                    {/* Show / Hide Analysis Toggle */}
                    <button
                      onClick={handleToggleAnalysis}
                      disabled={loadingAnalysis}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition ${
                        showAnalysis
                          ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-sm shadow-cyan-500/10'
                          : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                      title={showAnalysis ? 'Hide Security Analysis Panel' : 'Show Security Analysis Panel'}
                    >
                      {loadingAnalysis ? (
                        <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>{loadingAnalysis ? 'Analyzing...' : showAnalysis ? 'Hide Analysis' : 'Show Analysis'}</span>
                    </button>

                    {/* Mark as Spam / Ham */}
                    <button
                      onClick={() => handleToggleSpam(selectedMail.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 flex items-center space-x-1.5 transition"
                      title={selectedMail.isSpam ? 'Mark as Not Spam' : 'Mark as Spam'}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>{selectedMail.isSpam ? 'Move to Inbox' : 'Move to Spam'}</span>
                    </button>

                    {/* Download PDF report */}
                    <button
                      onClick={() => handleDownloadPdf(selectedMail)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-cyan-300 flex items-center space-x-1.5 transition"
                      title="Download Security Audit Report"
                    >
                      <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="hidden sm:inline">Audit PDF</span>
                    </button>

                    {/* Reply */}
                    <button
                      onClick={() =>
                        handleOpenCompose(selectedMail.fromEmail, `Re: ${selectedMail.subject}`)
                      }
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(selectedMail.id)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition"
                      title="Delete Email"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Email Subject Title */}
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {selectedMail.subject || '(No Subject)'}
                  </h2>
                </div>

                {/* Sender & Recipient Information */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-700/50 flex items-center justify-center text-sm font-bold text-cyan-300 font-mono">
                      {selectedMail.fromName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {selectedMail.fromName}{' '}
                        <span className="text-xs text-slate-400 font-normal">
                          &lt;{selectedMail.fromEmail}&gt;
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        to <span className="text-slate-300">{selectedMail.toEmail}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 font-mono">
                    {new Date(selectedMail.timestamp).toLocaleString()}
                  </div>
                </div>

                {/* OPTIONAL EXPANDABLE SECURITY ANALYSIS PANEL */}
                {showAnalysis && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-cyan-900/40 shadow-xl animate-in fade-in duration-200">
                    <StatisticalAnalysisView
                      predictedClass={selectedMail.predictedClass || (selectedMail.isSpam ? 'spam' : 'ham')}
                      confidencePercentage={selectedMail.confidence}
                      spamProbability={selectedMail.spamProbability}
                      hamProbability={selectedMail.hamProbability}
                      riskScore={selectedMail.riskScore}
                      riskLevel={selectedMail.riskLevel}
                      explanation={selectedMail.explanation}
                      influentialFeatures={selectedMail.topIndicators?.map((ind: any) => ({
                        word: ind.token || ind.word,
                        log_odds: ind.logOdds ?? ind.log_odds,
                        impact_score: Math.abs(ind.logOdds ?? ind.log_odds ?? 0),
                        predicted_impact: ind.impact || ind.predicted_impact,
                        badge: (ind.impact === 'spam' || ind.predicted_impact === 'spam') ? 'danger' : 'success',
                        chi2_score: ind.chi2Score ?? ind.chi2_score,
                        p_value: ind.pValue ?? ind.p_value,
                        p_value_formatted: ind.pValueFormatted ?? ind.p_value_formatted,
                        training_association: ind.trainingAssociation ?? ind.training_association,
                        prediction_contribution: ind.predictionContribution ?? ind.prediction_contribution,
                        interpretation: ind.interpretation,
                        is_significant: ind.isSignificant ?? ind.is_significant,
                        significance_status: ind.significanceStatus ?? ind.significance_status,
                        class_association: ind.classAssociation ?? ind.class_association,
                      }))}
                      warningSigns={selectedMail.flagReasons}
                      suspiciousPhrases={selectedMail.suspiciousPhrases}
                      detectedLinks={selectedMail.detectedLinks}
                      chi2Summary={selectedMail.chi2Summary}
                      compactMode={true}
                    />
                  </div>
                )}

                {/* Email Body Content */}
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedMail.body}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
                <ShieldCheck className="w-14 h-14 text-slate-700 stroke-[1.5]" />
                <h3 className="text-base font-semibold text-slate-300">Select an email to read</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Click on any incoming email to view its message content, security audit breakdown, and Bayesian risk scores.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COMPOSE MAIL MODAL */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-cyan-400 stroke-[3]" />
                <h3 className="text-sm font-bold text-white">
                  {composeDraftId ? 'Edit Draft' : 'Compose New Email'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseCompose}
                className="text-slate-400 hover:text-white transition"
                title="Close and save draft"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSendMail} className="p-6 space-y-4 flex-1 overflow-y-auto">
              {draftNotice && (
                <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-800 text-purple-300 text-xs font-semibold flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{draftNotice}</span>
                </div>
              )}
              {composeError && (
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                  {composeError}
                </div>
              )}
              {composeSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-semibold">
                  {composeSuccess}
                </div>
              )}

              {/* To / Recipient input with autocomplete for past sent recipients */}
              <div className="space-y-1 relative">
                <label className="block text-xs font-medium text-slate-300">
                  To (Recipient Email)
                </label>
                <input
                  type="email"
                  required
                  placeholder="recipient@example.com"
                  value={composeTo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setComposeTo(val);
                    if (val.trim()) {
                      const query = val.toLowerCase().trim();
                      const matches = sentRecipients.filter(
                        (r) =>
                          r.email.toLowerCase().includes(query) ||
                          (r.name && r.name.toLowerCase().includes(query))
                      );
                      setRecipientSuggestions(matches);
                    } else {
                      setRecipientSuggestions([]);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setRecipientSuggestions([]), 200);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono transition"
                />

                {/* Autocomplete suggestions displayed only while typing */}
                {recipientSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto divide-y divide-slate-800">
                    {recipientSuggestions.map((s) => (
                      <button
                        key={s.email}
                        type="button"
                        onMouseDown={() => {
                          setComposeTo(s.email);
                          setRecipientSuggestions([]);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 flex items-center justify-between transition"
                      >
                        <span className="font-semibold text-white truncate">{s.name || s.email}</span>
                        <span className="font-mono text-slate-400 text-[11px] truncate">{s.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">Subject</label>
                <input
                  type="text"
                  required
                  placeholder="Subject line..."
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              {/* Body */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">Message</label>
                <textarea
                  rows={6}
                  required
                  placeholder="Type your message here..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 transition resize-none leading-relaxed"
                />
              </div>

              {/* Live Bayesian Pre-Flight Preview */}
              {isCheckingPreview && !livePreview && (
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center space-x-2 text-xs font-mono text-slate-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Checking message with AI classifier...</span>
                </div>
              )}
              {livePreview && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                    livePreview.predicted_class === 'spam'
                      ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                      : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {livePreview.predicted_class === 'spam' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>
                      AI Classifier Pre-Check:{' '}
                      <strong className="uppercase">{livePreview.predicted_class}</strong>
                    </span>
                    {isCheckingPreview && (
                      <RefreshCw className="w-3 h-3 animate-spin text-slate-400 ml-1.5 inline" />
                    )}
                  </div>
                  <span>
                    Spam Probability:{' '}
                    {(livePreview.spam_probability ?? (livePreview.predicted_class === 'spam' ? 95 : 5)).toFixed(1)}%
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={handleCloseCompose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveDraft(false)}
                  disabled={
                    isSavingDraft ||
                    (!composeTo.trim() && !composeSubject.trim() && !composeBody.trim())
                  }
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center space-x-1.5 transition border border-slate-700 disabled:opacity-50"
                  title="Save as draft without sending"
                >
                  <FileEdit className="w-3.5 h-3.5 text-purple-400" />
                  <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
                </button>
                <button
                  type="submit"
                  disabled={composeSending}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-2 transition shadow-lg shadow-cyan-500/20 active:scale-98 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{composeSending ? 'Sending...' : 'Send Mail'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
