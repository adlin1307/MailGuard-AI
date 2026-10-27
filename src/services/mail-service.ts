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
  topIndicators: { token: string; logOdds: number; impact: 'spam' | 'ham' }[];
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
        logOdds: f.impact_score,
        impact: f.polarity.toLowerCase().includes('spam') ? 'spam' : 'ham',
      })),
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
  }): Promise<MailItem> {
    const { from, toEmail, subject, body } = params;

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

    // Attempt backend persistence for shared cross-browser delivery
    let savedMail: MailItem | null = null;
    if (getStoredAuthToken()) {
      try {
        const res = await api.sendMailboxMessage({
          recipient_email: trimmedTo,
          recipient_name: toName,
          subject: subject.trim(),
          body: body.trim(),
        });
        if (res?.mail) {
          savedMail = res.mail;
        }
      } catch (err: any) {
        console.warn('Backend mailbox delivery warning:', err?.message);
      }
    }

    if (!savedMail) {
      savedMail = this.createMailRecord(
        from.name,
        from.email,
        toName,
        trimmedTo,
        subject,
        body,
        new Date().toISOString(),
        false
      );
    }

    const messages = this.getStoredMessages();
    messages.push(savedMail);
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

      if (backendMsgs.length > 0) {
        const local = this.getStoredMessages();
        const map = new Map<string, MailItem>();
        for (const m of local) map.set(m.id, m);
        for (const m of backendMsgs) {
          map.set(m.id, {
            ...map.get(m.id),
            ...m,
          });
        }
        this.saveMessages(Array.from(map.values()));
      }
    } catch {
      // offline or backend error, use local
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

  public toggleSpam(id: string): void {
    const messages = this.getStoredMessages();
    const item = messages.find((m) => m.id === id);
    if (item) {
      item.isSpam = !item.isSpam;
      item.predictedClass = item.isSpam ? 'spam' : 'ham';
      this.saveMessages(messages);
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
}

export const mailService = new MailService();
