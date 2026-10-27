import { mlEngine } from './ml-engine';
import { User, authService } from './auth-service';
import { api, getStoredAuthToken } from './api';

export interface MailItem {
  id: string;
  fromName: string;
  fromEmail: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  timestamp: string;
  isRead: boolean;
  starred?: boolean;
  isSpam: boolean;
  predictedClass: 'spam' | 'ham';
  confidence: number;
  spamProbability: number;
  hamProbability: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  topIndicators: {
    token: string;
    logOdds: number;
    impact: 'spam' | 'ham';
    chi2Score?: number;
    pValue?: number;
    pValueFormatted?: string;
    trainingAssociation?: string;
    predictionContribution?: string;
    interpretation?: string;
    isSignificant?: boolean;
    significanceStatus?: string;
    classAssociation?: string;
  }[];
  flagReasons?: { title: string; detail: string; highlighted_phrase?: string; category?: string }[];
  explanation?: string;
  suspiciousPhrases?: string[];
  detectedLinks?: string[];
  chi2Summary?: { method?: string; k_selected?: number; alpha_threshold?: number; description?: string; distinction_note?: string };
}

export interface DraftItem {
  id: string;
  userId?: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  updatedAt: string;
}

const STORAGE_KEY = 'probmail_mailbox_v2';

class MailService {
  private isConfirmedDemoMessage(m: MailItem): boolean {
    if (!m) return false;
    const fromName = (m.fromName || '').toLowerCase().trim();
    const fromEmail = (m.fromEmail || '').toLowerCase().trim();
    const subject = (m.subject || '').toLowerCase().trim();

    // Confirmed seeded demo senders
    if (fromName === 'security operations center' || fromEmail === 'soc-alerts@internal.org') return true;
    if (fromName === 'david miller' || fromEmail === 'david.miller@workplace.net') return true;
    if (fromName === 'global mega rewards' || fromEmail === 'promo-claim@fast-cash-rewards.xyz') return true;

    // Confirmed seeded demo subjects
    if (subject.includes('scheduled security patching window')) return true;
    if (subject.includes('sprint retrospective agenda')) return true;
    if (subject.includes('urgent: you won $5,000,000')) return true;
    if (subject.includes('confirm your payroll direct deposit details')) return true;
    if (subject.includes('antivirus subscription renewal invoice')) return true;

    return false;
  }

  private getStoredMessages(): MailItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const messages: MailItem[] = JSON.parse(data);
      if (!Array.isArray(messages)) return [];

      const filtered = messages.filter((m) => !this.isConfirmedDemoMessage(m));
      if (filtered.length !== messages.length) {
        this.saveMessages(filtered);
      }
      return filtered;
    } catch {
      return [];
    }
  }

  private saveMessages(messages: MailItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save messages', e);
    }
  }

  constructor() {
    this.cleanLegacyDemoMessages();
  }

  private cleanLegacyDemoMessages(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;
      const messages: MailItem[] = JSON.parse(data);
      if (!Array.isArray(messages)) return;

      const genuineMessages = messages.filter((m) => !this.isConfirmedDemoMessage(m));
      if (genuineMessages.length !== messages.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(genuineMessages));
      }
    } catch {
      // ignore
    }
  }

  // Demonstration emails disabled so new inboxes start clean
  public ensureSeedForUser(_user: User): void {
    // No-op: automatic sample email injection disabled per submission priorities
    return;
  }

  private createMailRecord(
    fromName: string,
    fromEmail: string,
    toName: string,
    toEmail: string,
    subject: string,
    body: string,
    timestamp: string,
    isRead: boolean = false
  ): MailItem {
    // Use recordHistory = false so dispatching/storing mail does not pollute the email scan audit log
    const pred = mlEngine.predictEmail(subject, body, false);
    const isSpam = pred.predicted_class === 'spam';
    return {
      id: `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fromName,
      fromEmail: fromEmail.toLowerCase().trim(),
      toName,
      toEmail: toEmail.toLowerCase().trim(),
      subject: subject.trim(),
      body: body.trim(),
      timestamp,
      isRead,
      starred: false,
      isSpam,
      predictedClass: pred.predicted_class,
      confidence: pred.confidence_percentage,
      spamProbability: pred.spam_probability ?? (isSpam ? 95 : 5),
      hamProbability: pred.ham_probability ?? (!isSpam ? 95 : 5),
      riskScore: pred.risk_score,
      riskLevel: pred.risk_level,
      topIndicators: (pred.influential_features || []).slice(0, 5).map((f) => ({
        token: f.word,
        logOdds: f.log_odds ?? f.impact_score,
        impact: (f.predicted_impact || (f.polarity.toLowerCase().includes('spam') ? 'spam' : 'ham')) as 'spam' | 'ham',
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
      explanation: pred.verdict_summary || pred.explanation,
      suspiciousPhrases: pred.suspicious_phrases,
      detectedLinks: pred.detected_links,
      chi2Summary: pred.chi2_summary,
    };
  }

  public getInbox(userEmail: string): MailItem[] {
    const target = userEmail.toLowerCase().trim();
    return this.getStoredMessages()
      .filter((m) => m.toEmail === target && !m.isSpam)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getSpam(userEmail: string): MailItem[] {
    const target = userEmail.toLowerCase().trim();
    return this.getStoredMessages()
      .filter((m) => m.toEmail === target && m.isSpam)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getAllIncoming(userEmail: string): MailItem[] {
    const target = userEmail.toLowerCase().trim();
    return this.getStoredMessages()
      .filter((m) => m.toEmail === target)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getSent(userEmail: string): MailItem[] {
    const target = userEmail.toLowerCase().trim();
    return this.getStoredMessages()
      .filter((m) => m.fromEmail === target)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getStarred(userEmail: string): MailItem[] {
    const target = userEmail.toLowerCase().trim();
    return this.getStoredMessages()
      .filter((m) => (m.toEmail === target || m.fromEmail === target) && m.starred)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async sendMail(params: {
    from: User;
    toEmail: string;
    subject: string;
    body: string;
    draftId?: string;
  }): Promise<MailItem> {
    const { from, toEmail, subject, body, draftId } = params;

    const trimmedTo = toEmail.toLowerCase().trim();
    if (!trimmedTo) {
      throw new Error('Please enter a recipient email address.');
    }
    if (!subject.trim()) {
      throw new Error('Please enter an email subject line.');
    }
    if (!body.trim()) {
      throw new Error('Please enter an email body message.');
    }

    // Lookup recipient user in system if available
    const registeredUsers = authService.getAllRegisteredUsers();
    const recipientUser = registeredUsers.find((u) => u.email.toLowerCase() === trimmedTo);
    const toName = recipientUser ? recipientUser.name : trimmedTo.split('@')[0];

    // Must deliver via authenticated backend API - never fake email delivery
    const res = await api.sendMailboxMessage({
      recipient_email: trimmedTo,
      recipient_name: toName,
      subject: subject.trim(),
      body: body.trim(),
      draft_id: draftId,
    });

    if (!res || !res.mail) {
      throw new Error('Failed to deliver message: invalid backend response.');
    }

    const savedMail: MailItem = res.mail;
    const messages = this.getStoredMessages();
    const existingIndex = messages.findIndex((m) => m.id === savedMail.id);
    if (existingIndex >= 0) {
      messages[existingIndex] = savedMail;
    } else {
      messages.push(savedMail);
    }
    this.saveMessages(messages);

    return savedMail;
  }

  public async syncWithBackend(): Promise<void> {
    if (!getStoredAuthToken()) return;
    try {
      const [inboxRes, spamRes, sentRes] = await Promise.all([
        api.getInboxMessages().catch(() => null),
        api.getSpamMessages().catch(() => null),
        api.getSentMessages().catch(() => null),
      ]);
      const backendMsgs: MailItem[] = [];
      if (inboxRes?.messages) backendMsgs.push(...inboxRes.messages);
      if (spamRes?.messages) backendMsgs.push(...spamRes.messages);
      if (sentRes?.messages) backendMsgs.push(...sentRes.messages);

      // Server is the authoritative source of truth for the authenticated user's mailbox
      if (inboxRes || spamRes || sentRes) {
        const map = new Map<string, MailItem>();
        for (const m of backendMsgs) {
          map.set(m.id, m);
        }
        this.saveMessages(Array.from(map.values()));
      }
    } catch {
      // offline fallback to cached messages
    }
  }

  public markAsRead(id: string): void {
    const messages = this.getStoredMessages();
    const item = messages.find((m) => m.id === id);
    if (item && !item.isRead) {
      item.isRead = true;
      this.saveMessages(messages);
      if (getStoredAuthToken()) {
        api.markMailboxRead(id).catch(() => {});
      }
    }
  }

  public toggleStar(id: string): void {
    const messages = this.getStoredMessages();
    const item = messages.find((m) => m.id === id);
    if (item) {
      item.starred = !item.starred;
      this.saveMessages(messages);
      if (getStoredAuthToken()) {
        api.toggleMailboxStar(id).catch(() => {});
      }
    }
  }

  public async toggleSpam(id: string): Promise<void> {
    const messages = this.getStoredMessages();
    const item = messages.find((m) => m.id === id);
    if (item) {
      item.isSpam = !item.isSpam;
      item.predictedClass = item.isSpam ? 'spam' : 'ham';
      this.saveMessages(messages);
      if (getStoredAuthToken()) {
        try {
          await api.toggleMailboxSpam(id);
        } catch (e) {
          console.warn('Failed to toggle spam status on backend:', e);
        }
      }
    }
  }

  public deleteMail(id: string): void {
    const messages = this.getStoredMessages();
    const filtered = messages.filter((m) => m.id !== id);
    this.saveMessages(filtered);
    if (getStoredAuthToken()) {
      api.deleteMailboxMessage(id).catch(() => {});
    }
  }

  public async getSentRecipients(): Promise<{ email: string; name: string }[]> {
    if (!getStoredAuthToken()) return [];
    try {
      const res = await api.getSentRecipients();
      return res.recipients || [];
    } catch {
      return [];
    }
  }

  public async getDrafts(): Promise<DraftItem[]> {
    if (!getStoredAuthToken()) return [];
    try {
      const res = await api.getDrafts();
      return res.drafts || [];
    } catch {
      return [];
    }
  }

  public async saveDraft(params: {
    id?: string;
    recipientEmail?: string;
    recipientName?: string;
    subject?: string;
    body?: string;
  }): Promise<DraftItem> {
    const res = await api.saveDraft({
      id: params.id,
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      subject: params.subject,
      body: params.body,
    });
    return res.draft;
  }

  public async deleteDraft(draftId: string): Promise<void> {
    await api.deleteDraft(draftId);
  }
}

export const mailService = new MailService();
