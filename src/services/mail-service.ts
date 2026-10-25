import { mlEngine } from './ml-engine';
import { User, authService } from './auth-service';

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
  private getStoredMessages(): MailItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
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

  // Seed default demonstration emails for a user so inbox isn't blank
  public ensureSeedForUser(user: User): void {
    const all = this.getStoredMessages();
    const userMails = all.filter((m) => m.toEmail.toLowerCase() === user.email.toLowerCase());
    if (userMails.length > 0) return;

    // Create 3 realistic sample emails automatically classified by Bayesian ML
    const sample1 = this.createMailRecord(
      'Security Operations Center',
      'soc-alerts@internal.org',
      user.name,
      user.email,
      'Scheduled Security Patching Window: Tonight at 22:00 UTC',
      'Hello team,\n\nPlease be advised that routine server maintenance and database indexing will occur tonight from 22:00 to 22:30 UTC. No downtime is anticipated for production services.\n\nBest regards,\nSecOps Infrastructure Team',
      new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      true
    );

    const sample2 = this.createMailRecord(
      'Global Mega Rewards',
      'promo-claim@fast-cash-rewards.xyz',
      user.name,
      user.email,
      'URGENT: You won $5,000,000 Cash Prize! Claim Within 24 Hours',
      'CONGRATULATIONS WINNER!\n\nYour email address has been selected as the grand cash recipient of $5,000,000 USD! Click the link below immediately to claim your funds transfer:\nhttp://claim-free-funds-now.cc/verify-bank-account\n\nFailure to reply with your account details in 24 hours will forfeit your million dollar prize.',
      new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      false
    );

    const sample3 = this.createMailRecord(
      'David Miller',
      'david.miller@workplace.net',
      user.name,
      user.email,
      'Sprint retrospective agenda & project timeline updates',
      'Hey,\n\nI reviewed the pull requests for the email filtering engine. The test coverage looks solid and the confusion matrix metrics are looking great. Let us discuss during the standup.\n\nCheers,\nDavid',
      new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
      true
    );

    all.push(sample1, sample2, sample3);
    this.saveMessages(all);
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
    const pred = mlEngine.predictEmail(subject, body);
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

    const newMail = this.createMailRecord(
      from.name,
      from.email,
      toName,
      trimmedTo,
      subject,
      body,
      new Date().toISOString(),
      false
    );

    const messages = this.getStoredMessages();
    messages.push(newMail);
    this.saveMessages(messages);

    return newMail;
  }

  public markAsRead(id: string): void {
    const messages = this.getStoredMessages();
    const item = messages.find((m) => m.id === id);
    if (item && !item.isRead) {
      item.isRead = true;
      this.saveMessages(messages);
    }
  }

  public toggleStar(id: string): void {
    const messages = this.getStoredMessages();
    const item = messages.find((m) => m.id === id);
    if (item) {
      item.starred = !item.starred;
      this.saveMessages(messages);
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
  }
}

export const mailService = new MailService();
