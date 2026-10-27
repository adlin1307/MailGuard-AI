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
} from 'lucide-react';
import { mailService, MailItem } from '../services/mail-service';
import { User, authService } from '../services/auth-service';
import { mlEngine } from '../services/ml-engine';
import { generateScanReportPdf, triggerFileDownload } from '../services/pdf-generator';
import { PredictionResult } from '../types';

interface InboxPageProps {
  currentUser: User;
  onLogout?: () => void;
}

type MailFolder = 'inbox' | 'spam' | 'sent' | 'starred';

export const InboxPage: React.FC<InboxPageProps> = ({ currentUser, onLogout }) => {
  const [currentFolder, setCurrentFolder] = useState<MailFolder>('inbox');
  const [mails, setMails] = useState<MailItem[]>([]);
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVerdict, setFilterVerdict] = useState<'all' | 'spam' | 'ham'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Compose Modal State
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSuccess, setComposeSuccess] = useState<string | null>(null);

  // Debounced live pre-flight classification preview state
  const [livePreview, setLivePreview] = useState<PredictionResult | null>(null);
  const [isCheckingPreview, setIsCheckingPreview] = useState(false);

  // Other registered users in the system for quick recipient selection
  const [registeredUsers, setRegisteredUsers] = useState<
    { id: string; name: string; email: string; role: string }[]
  >([]);

  // Load emails
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

    // Refresh other users
    const allUsers = authService.getAllRegisteredUsers();
    setRegisteredUsers(
      allUsers.filter((u) => u.email.toLowerCase() !== currentUser.email.toLowerCase())
    );

    setIsRefreshing(false);
  };

  useEffect(() => {
    loadMails();
  }, [currentFolder, currentUser.email]);

  const handleSelectMail = (mail: MailItem) => {
    mailService.markAsRead(mail.id);
    setSelectedMail({ ...mail, isRead: true });
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

  const handleToggleSpam = (id: string) => {
    mailService.toggleSpam(id);
    loadMails();
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

  const handleOpenCompose = (prefillTo?: string, prefillSubject?: string) => {
    setComposeTo(prefillTo || '');
    setComposeSubject(prefillSubject || '');
    setComposeBody('');
    setComposeError(null);
    setComposeSuccess(null);
    setLivePreview(null);
    setIsCheckingPreview(false);
    setShowCompose(true);
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
      const sent = await mailService.sendMail({
        from: currentUser,
        toEmail: composeTo,
        subject: composeSubject,
        body: composeBody,
      });

      setComposeSuccess(
        `Message sent to in-app recipient (${composeTo.trim()}). Stored in Sent mail.`
      );
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

  // Unread badge counters
  const inboxUnread = mailService.getInbox(currentUser.email).filter((m) => !m.isRead).length;
  const spamCount = mailService.getSpam(currentUser.email).length;
  const sentCount = mailService.getSent(currentUser.email).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F19] text-slate-100 font-sans overflow-hidden selection:bg-cyan-500 selection:text-black">
      {/* SINGLE UNIFIED TOP TOOLBAR: FOLDERS, COMPOSE & FILTERS (NO SECOND SIDEBAR) */}
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

          {/* Registered users shortcut badge */}
          {registeredUsers.length > 0 && (
            <div className="hidden xl:flex items-center space-x-1 pl-1">
              <span className="text-[10px] text-slate-500 font-mono">Send to:</span>
              <div className="flex items-center space-x-1">
                {registeredUsers.slice(0, 2).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleOpenCompose(u.email, `Hello ${u.name}`)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 font-medium transition truncate max-w-[100px]"
                    title={`Send email to ${u.name} (${u.email})`}
                  >
                    @{u.name.split(' ')[0]}
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
          {/* MAIL LIST */}
          <div
            className={`${
              selectedMail ? 'hidden md:flex md:w-2/5' : 'flex w-full'
            } flex-col border-r border-slate-800 overflow-y-auto`}
          >
            {filteredMails.length === 0 ? (
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

                {/* AI CLASSIFICATION BANNER */}
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                    selectedMail.isSpam
                      ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                      : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        selectedMail.isSpam ? 'bg-rose-900/80 text-rose-400' : 'bg-emerald-900/80 text-emerald-400'
                      }`}
                    >
                      {selectedMail.isSpam ? (
                        <ShieldAlert className="w-5 h-5" />
                      ) : (
                        <ShieldCheck className="w-5 h-5" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold uppercase tracking-wider font-mono">
                        Bayesian Threat Verdict:{' '}
                        <span
                          className={selectedMail.isSpam ? 'text-rose-400 font-black' : 'text-emerald-400 font-black'}
                        >
                          {selectedMail.isSpam ? 'SPAM DETECTED' : 'SAFE / HAM'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-sans">
                        {selectedMail.isSpam
                          ? 'This email contains lexical patterns and keywords strongly characteristic of phishing, spam, or financial deception.'
                          : 'This email is authenticated as routine communication without malicious cues or phishing indicators.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 sm:border-l sm:border-slate-800 sm:pl-4 shrink-0 font-mono">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] uppercase text-slate-400">Spam Probability</div>
                      <div className={`text-base font-extrabold ${selectedMail.isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {selectedMail.spamProbability.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] uppercase text-slate-400">Risk Score</div>
                      <div className={`text-base font-extrabold ${selectedMail.isSpam ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {selectedMail.riskScore} / 100
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Trigger Tokens if present */}
                {selectedMail.topIndicators.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold uppercase font-mono text-slate-400 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Key Bayesian Trigger Tokens</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMail.topIndicators.map((ind, i) => (
                        <span
                          key={i}
                          className={`text-xs px-2.5 py-1 rounded-lg font-mono border ${
                            ind.impact === 'spam'
                              ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                          }`}
                        >
                          <span className="font-semibold">{ind.token}</span>{' '}
                          <span className="opacity-75 text-[10px]">
                            ({ind.impact === 'spam' ? '+' : '-'}
                            {Math.abs(ind.logOdds).toFixed(1)})
                          </span>
                        </span>
                      ))}
                    </div>
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
                <h3 className="text-sm font-bold text-white">Compose New Email</h3>
              </div>
              <button
                onClick={() => setShowCompose(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSendMail} className="p-6 space-y-4 flex-1 overflow-y-auto">
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

              {/* To / Recipient */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-300">
                  To (Recipient Email)
                </label>
                <input
                  type="email"
                  required
                  placeholder="colleague@security.org or select from below"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono transition"
                />

                {/* Quick picker pills of other registered users */}
                {registeredUsers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 font-mono">Registered Users:</span>
                    {registeredUsers.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => setComposeTo(u.email)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition ${
                          composeTo.toLowerCase() === u.email.toLowerCase()
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                        }`}
                      >
                        {u.name} ({u.email})
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
              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  Cancel
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
