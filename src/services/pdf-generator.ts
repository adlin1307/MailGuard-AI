import { PredictionResult, PredictionRecord } from '../types';

export function escapePdfText(text: string): string {
  if (!text) return '';
  const replacements: Record<string, string> = {
    '\u2018': "'",
    '\u2019': "'",
    '\u201c': '"',
    '\u201d': '"',
    '\u2013': '-',
    '\u2014': '--',
    '\u2026': '...',
    '\u00a0': ' ',
    '\u2264': '<=',
    '\u2265': '>=',
    '\u03c7': 'Chi',
    '\u00b2': '2',
    '\r\n': ' ',
    '\r': ' ',
    '\n': ' ',
    '\t': ' ',
  };
  let safe = text;
  for (const [orig, rep] of Object.entries(replacements)) {
    safe = safe.split(orig).join(rep);
  }
  // Strip non-ascii characters
  safe = safe.replace(/[^\x20-\x7E]/g, '?');
  return safe.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function wrapText(text: string, maxChars: number = 80): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine: string[] = [];
  let currentLen = 0;

  for (const word of words) {
    if (currentLen + word.length + 1 > maxChars) {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      currentLine = [word];
      currentLen = word.length;
    } else {
      currentLine.push(word);
      currentLen += word.length + 1;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }
  return lines;
}

export class SimplePDFBuilder {
  width: number;
  height: number;
  streamCommands: string[];

  constructor(width: number = 595.28, height: number = 841.89) {
    this.width = width;
    this.height = height;
    this.streamCommands = [];
  }

  setFillColor(r: number, g: number, b: number) {
    this.streamCommands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  }

  setStrokeColor(r: number, g: number, b: number) {
    this.streamCommands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  }

  setLineWidth(width: number) {
    this.streamCommands.push(`${width.toFixed(2)} w`);
  }

  drawRect(x: number, y: number, w: number, h: number, fill: boolean = true, stroke: boolean = false) {
    const op = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.streamCommands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${op}`);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number) {
    this.streamCommands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  drawText(x: number, y: number, text: string, font: string = '/F1', size: number = 10.0) {
    const safeText = escapePdfText(text);
    const cmd = `BT ${font} ${size.toFixed(1)} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${safeText}) Tj ET`;
    this.streamCommands.push(cmd);
  }

  build(): Blob {
    const contentStream = this.streamCommands.join('\n');
    const streamLen = contentStream.length;

    const objects: string[] = [];
    objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
    objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
    objects.push(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] ` +
      `/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`
    );
    objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
    objects.push(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);
    objects.push(
      `6 0 obj\n<< /Length ${streamLen} >>\nstream\n` +
      contentStream +
      `\nendstream\nendobj\n`
    );

    let pdfText = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
    const offsets: number[] = [];

    for (const obj of objects) {
      offsets.push(pdfText.length);
      pdfText += obj;
    }

    const xrefOffset = pdfText.length;
    pdfText += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdfText += `${off.toString().padStart(10, '0')} 00000 n \n`;
    }

    pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return new Blob([pdfText], { type: 'application/pdf' });
  }
}

export function generateScanReportPdf(scanData: Partial<PredictionResult & PredictionRecord>): Blob {
  const pdf = new SimplePDFBuilder(595.28, 841.89);

  const subject = String(scanData.subject || scanData.subject_snippet || 'Untitled Email');
  const predictedClass = String(scanData.predicted_class || 'unknown').toUpperCase();
  const isSpam = predictedClass.includes('SPAM');

  const spamProb = typeof scanData.spam_probability === 'number' ? scanData.spam_probability : isSpam ? 85.0 : 15.0;
  const hamProb = typeof scanData.ham_probability === 'number' ? scanData.ham_probability : isSpam ? 15.0 : 85.0;

  let riskScore = typeof scanData.risk_score === 'number' ? scanData.risk_score : Math.round(spamProb);
  riskScore = Math.max(0, Math.min(100, riskScore));

  const riskCategory = scanData.risk_category || (riskScore >= 70 ? 'High Risk' : riskScore >= 30 ? 'Medium Risk' : 'Low Risk');

  const verdictSummary = String(
    scanData.verdict_summary ||
    (isSpam ? 'Email exhibits patterns consistent with spam.' : 'Email appears consistent with legitimate communication.')
  );

  const warningSigns = Array.isArray(scanData.warning_signs) ? scanData.warning_signs : [];
  const precautions = Array.isArray(scanData.recommended_precautions) ? scanData.recommended_precautions : [];

  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  // 1. Header Banner
  pdf.setFillColor(0.043, 0.067, 0.125);
  pdf.drawRect(0, 740, 595.28, 102, true, false);

  // Cyan Accent Stripe
  pdf.setFillColor(0.024, 0.714, 0.831);
  pdf.drawRect(0, 736, 595.28, 4, true, false);

  // Logo Badge
  pdf.setFillColor(0.024, 0.714, 0.831);
  pdf.drawRect(40, 770, 75, 24, true, false);
  pdf.setFillColor(0.043, 0.067, 0.125);
  pdf.drawText(48, 777, 'ProbMail', '/F2', 13);

  // Title & Subtitle in Banner
  pdf.setFillColor(1.0, 1.0, 1.0);
  pdf.drawText(125, 782, 'EMAIL SECURITY SCAN REPORT', '/F2', 15);
  pdf.setFillColor(0.58, 0.64, 0.72);
  pdf.drawText(125, 768, 'Automated Bayesian Email Threat & Risk Analysis', '/F1', 9);

  // Scan Metadata
  pdf.setFillColor(0.58, 0.64, 0.72);
  pdf.drawText(380, 782, 'Generated:', '/F1', 8.5);
  pdf.setFillColor(1.0, 1.0, 1.0);
  pdf.drawText(435, 782, nowStr, '/F2', 8.5);
  pdf.setFillColor(0.58, 0.64, 0.72);
  pdf.drawText(380, 768, 'Report Status:', '/F1', 8.5);
  pdf.setFillColor(0.024, 0.714, 0.831);
  pdf.drawText(445, 768, 'Verified Active', '/F2', 8.5);

  let currentY = 705;

  // 2. Verdict & Risk Score Cards Side-by-Side
  const cardW = 245;
  const cardH = 75;
  const card1X = 40;
  const card2X = 310;

  let badgeColor: [number, number, number] = isSpam ? [0.88, 0.25, 0.35] : [0.06, 0.73, 0.51];
  let badgeText = isSpam ? 'SPAM / SUSPICIOUS' : 'HAM / LEGITIMATE';

  if (isSpam) {
    pdf.setFillColor(0.98, 0.94, 0.95);
    pdf.setStrokeColor(0.88, 0.25, 0.35);
  } else {
    pdf.setFillColor(0.94, 0.98, 0.95);
    pdf.setStrokeColor(0.06, 0.73, 0.51);
  }

  pdf.setLineWidth(1.0);
  pdf.drawRect(card1X, currentY - cardH, cardW, cardH, true, true);

  pdf.setFillColor(0.40, 0.45, 0.55);
  pdf.drawText(card1X + 15, currentY - 20, 'CLASSIFICATION VERDICT', '/F2', 9);

  pdf.setFillColor(...badgeColor);
  pdf.drawText(card1X + 15, currentY - 42, badgeText, '/F2', 16);

  pdf.setFillColor(0.35, 0.40, 0.50);
  const confPct = typeof scanData.confidence_percentage === 'number' ? scanData.confidence_percentage : Math.max(spamProb, hamProb);
  pdf.drawText(card1X + 15, currentY - 60, `Model Confidence: ${confPct.toFixed(1)}%`, '/F1', 9);

  // Right Card: Risk Score
  let riskColor: [number, number, number] =
    riskScore >= 70 ? [0.88, 0.25, 0.35] : riskScore >= 30 ? [0.96, 0.62, 0.04] : [0.06, 0.73, 0.51];

  if (riskScore >= 70) {
    pdf.setFillColor(0.98, 0.94, 0.95);
    pdf.setStrokeColor(0.88, 0.25, 0.35);
  } else if (riskScore >= 30) {
    pdf.setFillColor(0.99, 0.96, 0.90);
    pdf.setStrokeColor(0.96, 0.62, 0.04);
  } else {
    pdf.setFillColor(0.94, 0.98, 0.95);
    pdf.setStrokeColor(0.06, 0.73, 0.51);
  }

  pdf.drawRect(card2X, currentY - cardH, cardW, cardH, true, true);

  pdf.setFillColor(0.40, 0.45, 0.55);
  pdf.drawText(card2X + 15, currentY - 20, 'EMAIL RISK SCORE', '/F2', 9);

  pdf.setFillColor(...riskColor);
  pdf.drawText(card2X + 15, currentY - 44, `${riskScore} / 100`, '/F2', 20);
  pdf.drawText(card2X + 120, currentY - 42, `[${String(riskCategory).toUpperCase()}]`, '/F2', 11);

  // Mini Risk Meter inside card
  const meterX = card2X + 15;
  const meterY = currentY - 62;
  const meterW = 215;
  const meterH = 7;
  pdf.setFillColor(0.85, 0.88, 0.92);
  pdf.drawRect(meterX, meterY, meterW, meterH, true, false);
  const fillW = Math.max(5.0, (riskScore / 100.0) * meterW);
  pdf.setFillColor(...riskColor);
  pdf.drawRect(meterX, meterY, fillW, meterH, true, false);

  currentY -= cardH + 20;

  // 3. Probability Metrics Table
  pdf.setFillColor(0.12, 0.16, 0.24);
  pdf.drawText(40, currentY, 'ESTIMATED CONDITIONAL PROBABILITIES', '/F2', 10);
  currentY -= 8;

  const tableW = 515;
  pdf.setFillColor(0.93, 0.95, 0.98);
  pdf.drawRect(40, currentY - 18, tableW, 18, true, false);
  pdf.setFillColor(0.30, 0.35, 0.45);
  pdf.drawText(50, currentY - 13, 'Class', '/F2', 8.5);
  pdf.drawText(160, currentY - 13, 'Estimated Posterior Probability', '/F2', 8.5);
  pdf.drawText(350, currentY - 13, 'Assessment', '/F2', 8.5);
  currentY -= 18;

  // Table Row 1: Spam
  pdf.setFillColor(1.0, 1.0, 1.0);
  pdf.drawRect(40, currentY - 18, tableW, 18, true, false);
  pdf.setStrokeColor(0.88, 0.90, 0.94);
  pdf.drawLine(40, currentY - 18, 555, currentY - 18);
  pdf.setFillColor(0.88, 0.25, 0.35);
  pdf.drawText(50, currentY - 13, 'Spam (Malicious)', '/F2', 8.5);
  pdf.setFillColor(0.15, 0.20, 0.30);
  pdf.drawText(160, currentY - 13, `${spamProb.toFixed(2)}%`, '/F2', 8.5);
  pdf.drawText(350, currentY - 13, 'Likelihood of solicitation, phishing, or threat', '/F1', 8.5);
  currentY -= 18;

  // Table Row 2: Ham
  pdf.setFillColor(1.0, 1.0, 1.0);
  pdf.drawRect(40, currentY - 18, tableW, 18, true, false);
  pdf.setStrokeColor(0.88, 0.90, 0.94);
  pdf.drawLine(40, currentY - 18, 555, currentY - 18);
  pdf.setFillColor(0.06, 0.73, 0.51);
  pdf.drawText(50, currentY - 13, 'Ham (Legitimate)', '/F2', 8.5);
  pdf.setFillColor(0.15, 0.20, 0.30);
  pdf.drawText(160, currentY - 13, `${hamProb.toFixed(2)}%`, '/F2', 8.5);
  pdf.drawText(350, currentY - 13, 'Likelihood of standard interpersonal email', '/F1', 8.5);
  currentY -= 25;

  // 4. Content Inspection Box
  pdf.setFillColor(0.12, 0.16, 0.24);
  pdf.drawText(40, currentY, 'EMAIL CONTENT INSPECTION', '/F2', 10);
  currentY -= 8;

  const subjLines = wrapText(`Subject: ${subject}`, 82).slice(0, 2);
  const sumLines = wrapText(`Summary: ${verdictSummary}`, 82).slice(0, 3);
  const boxLinesCount = subjLines.length + sumLines.length;
  const boxH = 24 + boxLinesCount * 13;

  pdf.setFillColor(0.97, 0.98, 0.99);
  pdf.setStrokeColor(0.85, 0.88, 0.92);
  pdf.drawRect(40, currentY - boxH, tableW, boxH, true, true);

  let textY = currentY - 16;
  for (const sLine of subjLines) {
    pdf.setFillColor(0.10, 0.14, 0.20);
    pdf.drawText(52, textY, sLine, '/F2', 8.5);
    textY -= 13;
  }
  textY -= 2;
  for (const sumLine of sumLines) {
    pdf.setFillColor(0.30, 0.35, 0.45);
    pdf.drawText(52, textY, sumLine, '/F1', 8.5);
    textY -= 13;
  }

  currentY -= boxH + 18;

  // 5. Why Was This Email Flagged?
  pdf.setFillColor(0.12, 0.16, 0.24);
  pdf.drawText(40, currentY, 'WHY WAS THIS EMAIL FLAGGED? (DETECTED PATTERNS)', '/F2', 10);
  currentY -= 10;

  const cleanedWs = warningSigns.filter((ws) => {
    const t = (ws.title || '').toLowerCase();
    const d = (ws.detail || '').toLowerCase();
    const p = (ws.highlighted_phrase || '').toLowerCase();
    return !['_token', 'num_token', 'url_token', 'email_token', 'currency_token'].some((tok) =>
      t.includes(tok) || d.includes(tok) || p.includes(tok)
    );
  });

  const displayWs = cleanedWs.length > 0 ? cleanedWs.slice(0, 3) : [
    {
      title: 'Model Pattern Recognition',
      detail: 'The model classified this email based on learned text patterns; no reliable feature-level explanation is available.'
    }
  ];

  for (const ws of displayWs) {
    const title = ws.title || ws.category || 'Detected Sign';
    const desc = ws.detail || '';

    pdf.setFillColor(0.96, 0.97, 0.99);
    pdf.setStrokeColor(0.85, 0.88, 0.92);
    pdf.drawRect(40, currentY - 24, tableW, 24, true, true);

    pdf.setFillColor(...riskColor);
    pdf.drawRect(48, currentY - 17, 6, 6, true, false);

    pdf.setFillColor(0.15, 0.20, 0.30);
    pdf.drawText(62, currentY - 15, `${title}:`, '/F2', 8.5);
    pdf.setFillColor(0.35, 0.40, 0.50);
    pdf.drawText(180, currentY - 15, desc.substring(0, 72), '/F1', 8.0);
    currentY -= 28;
  }

  currentY -= 8;

  // 6. Security Precautions
  pdf.setFillColor(0.12, 0.16, 0.24);
  pdf.drawText(40, currentY, 'RECOMMENDED SECURITY PRECAUTIONS', '/F2', 10);
  currentY -= 10;

  const displayPrec = precautions.length > 0 ? precautions.slice(0, 3) : isSpam ? [
    'Do not click hyperlinks or download attachments from this email.',
    'Never share passwords, banking credentials, or social security numbers.',
    'Verify the sender address through an official, independent contact method.'
  ] : [
    'Exercise standard vigilance even with emails classified as legitimate.',
    'Verify the sender exact email address domain before opening attachments.',
    'Confirm unexpected requests for wire transfers or sensitive information.'
  ];

  for (const p of displayPrec) {
    pdf.setFillColor(0.06, 0.73, 0.51);
    pdf.drawText(50, currentY - 12, '[x]', '/F2', 8.5);
    pdf.setFillColor(0.20, 0.25, 0.35);
    pdf.drawText(68, currentY - 12, p.substring(0, 88), '/F1', 8.5);
    currentY -= 17;
  }

  // 7. Footer
  const footerY = 50;
  pdf.setStrokeColor(0.85, 0.88, 0.92);
  pdf.drawLine(40, footerY + 24, 555, footerY + 24);

  pdf.setFillColor(0.55, 0.60, 0.68);
  const disclaimerText =
    'Disclaimer: This report is an automated statistical prediction generated by ProbMail using Bayesian conditional probability. ' +
    'It is an algorithmic score based on learned text patterns and does not constitute a legal or absolute guarantee of email safety.';

  let dY = footerY + 12;
  for (const dLine of wrapText(disclaimerText, 105)) {
    pdf.drawText(40, dY, dLine, '/F1', 7.0);
    dY -= 9;
  }

  pdf.setFillColor(0.40, 0.45, 0.55);
  pdf.drawText(40, 20, 'ProbMail Security Platform  *  Zero-Dependency PDF Report Generator', '/F1', 8);
  pdf.drawText(495, 20, 'Page 1 of 1', '/F2', 8);

  return pdf.build();
}

export function triggerFileDownload(blob: Blob, filename: string) {
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      window.URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 2000);
}
