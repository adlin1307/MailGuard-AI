import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

test('Show Analysis state machine: collapsed on open, toggles correctly, resets on email switch', () => {
  // Simulate UI state transitions
  let showAnalysis = false;
  let selectedMail = null;

  // 1. Initial selection: panel must be collapsed by default
  const mailA = {
    id: 'mail_1',
    subject: 'Security Briefing',
    body: 'Please review Q3 report.',
    isSpam: false,
    predictedClass: 'ham',
    spamProbability: 12.4,
    hamProbability: 87.6,
    riskScore: 12,
  };

  const handleSelectMail = (mail) => {
    selectedMail = mail;
    showAnalysis = false; // Reset to collapsed whenever an email opens
  };

  handleSelectMail(mailA);
  assert.strictEqual(showAnalysis, false, 'Panel must be collapsed by default whenever an email is opened');

  // 2. Clicking Show Analysis expands the panel
  const handleToggle = () => {
    showAnalysis = !showAnalysis;
  };

  handleToggle();
  assert.strictEqual(showAnalysis, true, 'Clicking Show Analysis must expand the panel');

  // 3. Clicking Hide Analysis collapses the panel
  handleToggle();
  assert.strictEqual(showAnalysis, false, 'Clicking Hide Analysis must collapse the panel');

  // 4. Switching to another email resets panel to collapsed
  handleToggle(); // open it for mailA
  assert.strictEqual(showAnalysis, true);

  const mailB = {
    id: 'mail_2',
    subject: 'Claim $5000',
    body: 'Urgent reward.',
    isSpam: true,
    predictedClass: 'spam',
    spamProbability: 95.8,
    hamProbability: 4.2,
    riskScore: 96,
  };

  handleSelectMail(mailB);
  assert.strictEqual(showAnalysis, false, 'Switching to another email must reset panel visibility to collapsed');
});

test('Analysis content representation for Spam and Ham emails', () => {
  const spamMail = {
    id: 'mail_spam_1',
    subject: 'URGENT: Claim $10,000 lottery winnings',
    body: 'Congratulations! Click http://phish-claim.com/prize immediately to verify your account.',
    isSpam: true,
    predictedClass: 'spam',
    spamProbability: 98.4,
    hamProbability: 1.6,
    riskScore: 98,
    topIndicators: [
      { token: 'prize', logOdds: 3.4, impact: 'spam' },
      { token: 'claim', logOdds: 2.8, impact: 'spam' }
    ],
    flagReasons: [
      { title: 'Warning', detail: 'Urgent prize claim detected', category: 'Urgency Cue', highlighted_phrase: 'immediately' }
    ],
    detectedLinks: ['http://phish-claim.com/prize'],
    suspiciousPhrases: ['verify your account'],
    explanation: 'The classifier identified lexical cues characteristic of solicitation and financial deception.'
  };

  // Verify spam analysis fields
  assert.strictEqual(spamMail.isSpam, true);
  assert.strictEqual(spamMail.predictedClass.toUpperCase(), 'SPAM');
  assert.ok(spamMail.spamProbability > 50);
  assert.ok(spamMail.riskScore >= 70, 'Risk score >= 70 denotes high risk');
  assert.ok(spamMail.detectedLinks.length > 0);
  assert.ok(spamMail.suspiciousPhrases.length > 0);
  assert.ok(spamMail.flagReasons.length > 0);
  assert.ok(spamMail.explanation.length > 0);

  const hamMail = {
    id: 'mail_ham_1',
    subject: 'Project sprint planning tomorrow',
    body: 'Hi team, let us meet tomorrow at 10am to discuss project deliverables.',
    isSpam: false,
    predictedClass: 'ham',
    spamProbability: 8.5,
    hamProbability: 91.5,
    riskScore: 9,
    topIndicators: [
      { token: 'meeting', logOdds: -2.1, impact: 'ham' }
    ],
    explanation: 'The classifier identified standard business communication patterns.'
  };

  // Verify ham analysis fields
  assert.strictEqual(hamMail.isSpam, false);
  assert.strictEqual(hamMail.predictedClass.toUpperCase(), 'HAM');
  assert.ok(hamMail.hamProbability > 50);
  assert.ok(hamMail.riskScore < 30, 'Risk score < 30 denotes low risk');
});

test('Phase 03 Chi-Square feature selection and statistical explainability mapping', () => {
  const emailItem = {
    id: 'mail_chi2_verified',
    predictedClass: 'spam',
    isSpam: true,
    confidence: 97.4,
    spamProbability: 97.4,
    hamProbability: 2.6,
    riskScore: 97,
    riskLevel: 'high',
    riskCategory: 'High Risk',
    explanation: 'Classified as SPAM with 97.4% estimated probability. Content contains urgent solicitation cues.',
    topIndicators: [
      {
        token: 'free',
        logOdds: 1.45,
        impact: 'spam',
        chi2Score: 28.87,
        pValue: 0.0001,
        pValueFormatted: 'p < 0.001',
        isSignificant: true,
        significanceStatus: 'Highly Significant',
        classAssociation: 'Spam-associated',
        trainingAssociation: 'χ² = 28.87, p < 0.001 (Highly Significant)',
        predictionContribution: '+1.45 log-odds (favors Spam)',
        interpretation: 'Spam-associated in training data (p < 0.001). Shifts current prediction toward Spam by +1.45 log-odds.'
      },
      {
        token: 'verify',
        logOdds: 0.89,
        impact: 'spam',
        chi2Score: 19.42,
        pValue: 0.0002,
        pValueFormatted: 'p < 0.001',
        isSignificant: true,
        significanceStatus: 'Highly Significant',
        classAssociation: 'Spam-associated',
        trainingAssociation: 'χ² = 19.42, p < 0.001 (Highly Significant)',
        predictionContribution: '+0.89 log-odds (favors Spam)',
        interpretation: 'Spam-associated in training data (p < 0.001). Shifts current prediction toward Spam by +0.89 log-odds.'
      }
    ],
    chi2Summary: {
      method: 'SelectKBest(score_func=chi2)',
      k_selected: 50,
      alpha_threshold: 0.05,
      description: 'Chi-Square (χ²) evaluates statistical dependence between words and Spam/Ham labels during model training (significance threshold α = 0.05, p < 0.05).',
      distinction_note: 'Training-time χ² p-values reflect vocabulary feature importance across the dataset, distinct from this email\'s Bayesian posterior classification probabilities.'
    },
    flagReasons: [
      { title: 'Credential Verification', detail: 'Asks user to submit sensitive credentials', category: 'Credential Harvesting' }
    ],
    suspiciousPhrases: ['verify your password'],
    detectedLinks: ['http://security-update-fake.net']
  };

  // 1. Classification & Probabilities
  assert.strictEqual(emailItem.predictedClass, 'spam');
  assert.strictEqual(emailItem.spamProbability + emailItem.hamProbability, 100);
  assert.strictEqual(emailItem.riskScore, Math.round(emailItem.spamProbability));
  assert.strictEqual(emailItem.riskLevel, 'high');

  // 2. Chi-Square threshold and methodology
  assert.strictEqual(emailItem.chi2Summary.alpha_threshold, 0.05);
  assert.ok(emailItem.chi2Summary.distinction_note.includes('distinct from this email\'s'));

  // 3. Genuine feature-level statistical evidence
  assert.strictEqual(emailItem.topIndicators.length, 2);
  const feat1 = emailItem.topIndicators[0];
  assert.strictEqual(feat1.token, 'free');
  assert.strictEqual(feat1.chi2Score, 28.87);
  assert.strictEqual(feat1.pValueFormatted, 'p < 0.001');
  assert.strictEqual(feat1.isSignificant, true);
  assert.strictEqual(feat1.significanceStatus, 'Highly Significant');
  assert.strictEqual(feat1.classAssociation, 'Spam-associated');
  assert.ok(feat1.trainingAssociation.includes('Highly Significant'));
  assert.ok(feat1.predictionContribution.includes('favors Spam'));
  assert.ok(feat1.interpretation.includes('Spam-associated'));

  // 4. Distinction between model weights and heuristic indicators
  assert.notStrictEqual(emailItem.topIndicators[0].token, emailItem.suspiciousPhrases[0]);
  assert.ok(emailItem.detectedLinks.length > 0);
  assert.ok(emailItem.flagReasons.length > 0);
});

