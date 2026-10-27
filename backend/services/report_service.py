"""
PDF Report Generation Service for ProbMail.
Generates professional, self-contained, valid PDF 1.4 security audit reports
without external binary dependencies.
"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import io


def _safe_float(val: Any, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    if val is None:
        return default
    try:
        return int(round(float(val)))
    except (ValueError, TypeError):
        return default


def escape_pdf_text(text: str) -> str:
    """Escapes characters for PDF string literals and handles ASCII conversion."""
    if not text:
        return ""
    # Map common unicode quotes, dashes, and whitespace to ascii
    replacements = {
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
        "\u2013": "-", "\u2014": "--", "\u2026": "...", "\u00a0": " ",
        "\u2264": "<=", "\u2265": ">=", "\u03c7": "Chi", "\u00b2": "2",
        "\r\n": " ", "\r": " ", "\n": " ", "\t": " "
    }
    for orig, rep in replacements.items():
        text = text.replace(orig, rep)
    
    # Strip any remaining non-printable or non-ascii characters
    safe = text.encode("ascii", errors="replace").decode("ascii")
    return safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def wrap_text(text: str, max_chars: int = 80) -> List[str]:
    """Wraps text into lines not exceeding max_chars."""
    if not text:
        return []
    words = text.split()
    lines = []
    current_line = []
    current_len = 0

    for word in words:
        if current_len + len(word) + 1 > max_chars:
            lines.append(" ".join(current_line))
            current_line = [word]
            current_len = len(word)
        else:
            current_line.append(word)
            current_len += len(word) + 1

    if current_line:
        lines.append(" ".join(current_line))
    return lines


class SimplePDFBuilder:
    """
    Constructs a standard, valid PDF 1.4 document in memory with headers,
    tables, badges, risk meters, and security recommendations.
    """
    def __init__(self, width: float = 595.28, height: float = 841.89):
        self.width = width
        self.height = height
        self.stream_commands: List[str] = []

    def set_fill_color(self, r: float, g: float, b: float):
        self.stream_commands.append(f"{r:.3f} {g:.3f} {b:.3f} rg")

    def set_stroke_color(self, r: float, g: float, b: float):
        self.stream_commands.append(f"{r:.3f} {g:.3f} {b:.3f} RG")

    def set_line_width(self, width: float):
        self.stream_commands.append(f"{width:.2f} w")

    def draw_rect(self, x: float, y: float, w: float, h: float, fill: bool = True, stroke: bool = False):
        op = "B" if (fill and stroke) else ("f" if fill else "S")
        self.stream_commands.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re {op}")

    def draw_line(self, x1: float, y1: float, x2: float, y2: float):
        self.stream_commands.append(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def draw_text(self, x: float, y: float, text: str, font: str = "/F1", size: float = 10.0):
        safe_text = escape_pdf_text(text)
        cmd = f"BT {font} {size:.1f} Tf {x:.2f} {y:.2f} Td ({safe_text}) Tj ET"
        self.stream_commands.append(cmd)

    def build(self) -> bytes:
        content_stream = "\n".join(self.stream_commands).encode("ascii")
        stream_len = len(content_stream)

        objects = []
        # Object 1: Catalog
        objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
        # Object 2: Pages
        objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
        # Object 3: Page
        page_obj = (
            f"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.width:.2f} {self.height:.2f}] "
            f"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n"
        ).encode("ascii")
        objects.append(page_obj)
        # Object 4: Font F1 (Helvetica regular)
        objects.append(b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")
        # Object 5: Font F2 (Helvetica bold)
        objects.append(b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n")
        # Object 6: Contents stream
        stream_obj = (
            f"6 0 obj\n<< /Length {stream_len} >>\nstream\n".encode("ascii")
            + content_stream
            + b"\nendstream\nendobj\n"
        )
        objects.append(stream_obj)

        # Assemble PDF with cross-reference table
        output = io.BytesIO()
        output.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

        offsets = []
        current_offset = output.tell()
        for obj in objects:
            offsets.append(current_offset)
            output.write(obj)
            current_offset = output.tell()

        xref_offset = output.tell()
        output.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        output.write(b"0000000000 65535 f \n")
        for off in offsets:
            output.write(f"{off:010d} 00000 n \n".encode("ascii"))

        trailer = (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
        output.write(trailer)

        return output.getvalue()


def generate_scan_report_pdf(scan_data: Dict[str, Any]) -> bytes:
    """
    Builds a professional, visually attractive PDF report for an analyzed email.
    """
    pdf = SimplePDFBuilder(width=595.28, height=841.89)

    subject = str(scan_data.get("subject") or "Untitled Email")
    predicted_class = str(scan_data.get("predicted_class") or "unknown").strip().upper()
    is_spam = "SPAM" in predicted_class

    # Probabilities & Risk safely extracted
    spam_prob = _safe_float(scan_data.get("spam_probability"), default=50.0)
    ham_prob = _safe_float(scan_data.get("ham_probability"), default=50.0)

    raw_risk = scan_data.get("risk_score")
    risk_score = _safe_int(raw_risk, default=int(round(spam_prob)))
    risk_score = max(0, min(100, risk_score))

    risk_category = scan_data.get("risk_category") or (
        "High Risk" if risk_score >= 70 else ("Medium Risk" if risk_score >= 30 else "Low Risk")
    )

    verdict_summary = str(scan_data.get("verdict_summary") or (
        "Email exhibits patterns consistent with spam." if is_spam else "Email appears consistent with legitimate communication."
    ))

    raw_ws = scan_data.get("warning_signs")
    warning_signs = raw_ws if isinstance(raw_ws, list) else []

    raw_prec = scan_data.get("recommended_precautions")
    precautions = raw_prec if isinstance(raw_prec, list) else []

    # Timestamp
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # 1. Header Banner (Dark Navy #0B1120)
    pdf.set_fill_color(0.043, 0.067, 0.125)
    pdf.draw_rect(0, 740, 595.28, 102, fill=True, stroke=False)

    # Cyan Accent Stripe (#06B6D4)
    pdf.set_fill_color(0.024, 0.714, 0.831)
    pdf.draw_rect(0, 736, 595.28, 4, fill=True, stroke=False)

    # Logo Badge
    pdf.set_fill_color(0.024, 0.714, 0.831)
    pdf.draw_rect(40, 770, 75, 24, fill=True, stroke=False)
    pdf.set_fill_color(0.043, 0.067, 0.125)
    pdf.draw_text(48, 777, "ProbMail", font="/F2", size=13)

    # Title & Subtitle in Banner
    pdf.set_fill_color(1.0, 1.0, 1.0)
    pdf.draw_text(125, 782, "EMAIL SECURITY SCAN REPORT", font="/F2", size=15)
    pdf.set_fill_color(0.58, 0.64, 0.72)
    pdf.draw_text(125, 768, "Automated Bayesian Email Threat & Risk Analysis", font="/F1", size=9)

    # Deduce Scan Source accurately
    upload_info = scan_data.get("upload_info")
    if upload_info and isinstance(upload_info, dict):
        source_label = str(upload_info.get("label") or f"Uploaded File ({upload_info.get('filename')})")
    elif str(subject).lower().endswith(".eml"):
        source_label = "Uploaded .EML File"
    elif str(subject).lower().endswith(".txt"):
        source_label = "Uploaded .TXT File"
    else:
        source_label = "Manual Text Entry"

    # Scan Metadata Right-Aligned
    pdf.set_fill_color(0.58, 0.64, 0.72)
    pdf.draw_text(380, 782, "Generated:", font="/F1", size=8.5)
    pdf.set_fill_color(1.0, 1.0, 1.0)
    pdf.draw_text(435, 782, now_str, font="/F2", size=8.5)
    pdf.set_fill_color(0.58, 0.64, 0.72)
    pdf.draw_text(380, 768, "Report Status:", font="/F1", size=8.5)
    pdf.set_fill_color(0.024, 0.714, 0.831)
    pdf.draw_text(445, 768, "Verified Active", font="/F2", size=8.5)
    pdf.set_fill_color(0.58, 0.64, 0.72)
    pdf.draw_text(380, 754, "Scan Source:", font="/F1", size=8.5)
    pdf.set_fill_color(1.0, 1.0, 1.0)
    pdf.draw_text(445, 754, escape_pdf_text(source_label)[:24], font="/F2", size=8.5)

    current_y = 705

    # 2. Executive Verdict & Risk Score Cards Side-by-Side
    # Left Card: Verdict (SPAM vs HAM)
    card_w = 245
    card_h = 75
    card1_x = 40
    card2_x = 310

    if is_spam:
        # Rose background / border
        pdf.set_fill_color(0.98, 0.94, 0.95)
        pdf.set_stroke_color(0.88, 0.25, 0.35)
        badge_text = "SPAM / SUSPICIOUS"
        badge_color = (0.88, 0.25, 0.35)
    else:
        # Emerald background / border
        pdf.set_fill_color(0.94, 0.98, 0.95)
        pdf.set_stroke_color(0.06, 0.73, 0.51)
        badge_text = "HAM / LEGITIMATE"
        badge_color = (0.06, 0.73, 0.51)

    pdf.set_line_width(1.0)
    pdf.draw_rect(card1_x, current_y - card_h, card_w, card_h, fill=True, stroke=True)

    pdf.set_fill_color(0.40, 0.45, 0.55)
    pdf.draw_text(card1_x + 15, current_y - 20, "CLASSIFICATION VERDICT", font="/F2", size=9)

    pdf.set_fill_color(*badge_color)
    pdf.draw_text(card1_x + 15, current_y - 42, badge_text, font="/F2", size=16)

    pdf.set_fill_color(0.35, 0.40, 0.50)
    conf_pct = _safe_float(scan_data.get("confidence_percentage"), default=max(spam_prob, ham_prob))
    pdf.draw_text(card1_x + 15, current_y - 60, f"Model Confidence: {conf_pct:.1f}%", font="/F1", size=9)

    # Right Card: Risk Score (0-100)
    # Background based on risk level
    if risk_score >= 70:
        pdf.set_fill_color(0.98, 0.94, 0.95)
        pdf.set_stroke_color(0.88, 0.25, 0.35)
        risk_color = (0.88, 0.25, 0.35)
    elif risk_score >= 30:
        pdf.set_fill_color(0.99, 0.96, 0.90)
        pdf.set_stroke_color(0.96, 0.62, 0.04)
        risk_color = (0.96, 0.62, 0.04)
    else:
        pdf.set_fill_color(0.94, 0.98, 0.95)
        pdf.set_stroke_color(0.06, 0.73, 0.51)
        risk_color = (0.06, 0.73, 0.51)

    pdf.draw_rect(card2_x, current_y - card_h, card_w, card_h, fill=True, stroke=True)

    pdf.set_fill_color(0.40, 0.45, 0.55)
    pdf.draw_text(card2_x + 15, current_y - 20, "EMAIL RISK SCORE", font="/F2", size=9)

    pdf.set_fill_color(*risk_color)
    pdf.draw_text(card2_x + 15, current_y - 44, f"{risk_score} / 100", font="/F2", size=20)
    pdf.draw_text(card2_x + 120, current_y - 42, f"[{str(risk_category).upper()}]", font="/F2", size=11)

    # Mini Risk Meter inside card
    meter_x = card2_x + 15
    meter_y = current_y - 62
    meter_w = 215
    meter_h = 7
    pdf.set_fill_color(0.85, 0.88, 0.92)
    pdf.draw_rect(meter_x, meter_y, meter_w, meter_h, fill=True, stroke=False)
    fill_w = max(5.0, (risk_score / 100.0) * meter_w)
    pdf.set_fill_color(*risk_color)
    pdf.draw_rect(meter_x, meter_y, fill_w, meter_h, fill=True, stroke=False)

    current_y -= (card_h + 20)

    # 3. Probability Metrics Table
    pdf.set_fill_color(0.12, 0.16, 0.24)
    pdf.draw_text(40, current_y, "ESTIMATED CONDITIONAL PROBABILITIES", font="/F2", size=10)
    current_y -= 8

    # Table Header
    table_w = 515
    pdf.set_fill_color(0.93, 0.95, 0.98)
    pdf.draw_rect(40, current_y - 18, table_w, 18, fill=True, stroke=False)
    pdf.set_fill_color(0.30, 0.35, 0.45)
    pdf.draw_text(50, current_y - 13, "Class", font="/F2", size=8.5)
    pdf.draw_text(160, current_y - 13, "Estimated Posterior Probability", font="/F2", size=8.5)
    pdf.draw_text(350, current_y - 13, "Assessment", font="/F2", size=8.5)
    current_y -= 18

    # Table Row 1: Spam
    pdf.set_fill_color(1.0, 1.0, 1.0)
    pdf.draw_rect(40, current_y - 18, table_w, 18, fill=True, stroke=False)
    pdf.set_stroke_color(0.88, 0.90, 0.94)
    pdf.draw_line(40, current_y - 18, 555, current_y - 18)
    pdf.set_fill_color(0.88, 0.25, 0.35)
    pdf.draw_text(50, current_y - 13, "Spam (Malicious)", font="/F2", size=8.5)
    pdf.set_fill_color(0.15, 0.20, 0.30)
    pdf.draw_text(160, current_y - 13, f"{spam_prob:.2f}%", font="/F2", size=8.5)
    pdf.draw_text(350, current_y - 13, "Likelihood of solicitation, phishing, or threat", font="/F1", size=8.5)
    current_y -= 18

    # Table Row 2: Ham
    pdf.set_fill_color(1.0, 1.0, 1.0)
    pdf.draw_rect(40, current_y - 18, table_w, 18, fill=True, stroke=False)
    pdf.set_stroke_color(0.88, 0.90, 0.94)
    pdf.draw_line(40, current_y - 18, 555, current_y - 18)
    pdf.set_fill_color(0.06, 0.73, 0.51)
    pdf.draw_text(50, current_y - 13, "Ham (Legitimate)", font="/F2", size=8.5)
    pdf.set_fill_color(0.15, 0.20, 0.30)
    pdf.draw_text(160, current_y - 13, f"{ham_prob:.2f}%", font="/F2", size=8.5)
    pdf.draw_text(350, current_y - 13, "Likelihood of standard interpersonal email", font="/F1", size=8.5)
    current_y -= 25

    # 4. Email Subject & Summary Box
    pdf.set_fill_color(0.12, 0.16, 0.24)
    pdf.draw_text(40, current_y, "EMAIL CONTENT INSPECTION", font="/F2", size=10)
    current_y -= 8

    # Box container (capped lines to avoid overflow)
    src_lines = wrap_text(f"Scan Source: {source_label}", max_chars=82)[:1]
    subj_lines = wrap_text(f"Subject / Name: {subject}", max_chars=82)[:2]
    sum_lines = wrap_text(f"Summary: {verdict_summary}", max_chars=82)[:2]
    box_lines_count = len(src_lines) + len(subj_lines) + len(sum_lines)
    box_h = 24 + (box_lines_count * 13)

    pdf.set_fill_color(0.97, 0.98, 0.99)
    pdf.set_stroke_color(0.85, 0.88, 0.92)
    pdf.draw_rect(40, current_y - box_h, table_w, box_h, fill=True, stroke=True)

    text_y = current_y - 16
    for sr_line in src_lines:
        pdf.set_fill_color(0.024, 0.50, 0.65)
        pdf.draw_text(52, text_y, sr_line, font="/F2", size=8.5)
        text_y -= 13

    for s_line in subj_lines:
        pdf.set_fill_color(0.10, 0.14, 0.20)
        pdf.draw_text(52, text_y, s_line, font="/F2", size=8.5)
        text_y -= 13

    text_y -= 2
    for sum_line in sum_lines:
        pdf.set_fill_color(0.30, 0.35, 0.45)
        pdf.draw_text(52, text_y, sum_line, font="/F1", size=8.5)
        text_y -= 13

    current_y -= (box_h + 18)

    # 5. Why Was This Email Flagged? (Warning Signs / Patterns)
    pdf.set_fill_color(0.12, 0.16, 0.24)
    pdf.draw_text(40, current_y, "WHY WAS THIS EMAIL FLAGGED? (DETECTED PATTERNS)", font="/F2", size=10)
    current_y -= 10

    # Filter out any internal token artifacts if present
    cleaned_ws = []
    for ws in warning_signs:
        t = str(ws.get("title", "") or "")
        d = str(ws.get("detail", "") or "")
        p = str(ws.get("highlighted_phrase", "") or "")
        # Skip if internal token is referenced
        if any(tok in s for tok in ["num_token", "url_token", "email_token", "currency_token", "_token"] for s in [t.lower(), d.lower(), p.lower()]):
            continue
        cleaned_ws.append(ws)

    if not cleaned_ws:
        cleaned_ws = [
            {
                "title": "Model Pattern Recognition",
                "detail": "The model classified this email based on learned text patterns; no reliable feature-level explanation is available."
            }
        ]

    # Render up to 3 warning signs
    for ws in cleaned_ws[:3]:
        title = ws.get("title") or ws.get("category") or "Detected Sign"
        desc = ws.get("detail") or ws.get("description") or ""
        
        pdf.set_fill_color(0.96, 0.97, 0.99)
        pdf.set_stroke_color(0.85, 0.88, 0.92)
        pdf.draw_rect(40, current_y - 24, table_w, 24, fill=True, stroke=True)

        # Bullet marker
        pdf.set_fill_color(*risk_color)
        pdf.draw_rect(48, current_y - 17, 6, 6, fill=True, stroke=False)

        pdf.set_fill_color(0.15, 0.20, 0.30)
        pdf.draw_text(62, current_y - 15, f"{title}:", font="/F2", size=8.5)
        pdf.set_fill_color(0.35, 0.40, 0.50)
        pdf.draw_text(180, current_y - 15, desc[:72], font="/F1", size=8.0)
        current_y -= 28

    current_y -= 8

    # 6. Recommended Security Precautions
    pdf.set_fill_color(0.12, 0.16, 0.24)
    pdf.draw_text(40, current_y, "RECOMMENDED SECURITY PRECAUTIONS", font="/F2", size=10)
    current_y -= 10

    if not precautions:
        if is_spam:
            precautions = [
                "Do not click hyperlinks or download attachments from this email.",
                "Never share passwords, banking credentials, or social security numbers.",
                "Verify the sender address through an official, independent contact method.",
                "Flag and delete this message from your email client."
            ]
        else:
            precautions = [
                "Exercise standard vigilance even with emails classified as legitimate.",
                "Verify the sender's exact email address domain before opening attachments.",
                "Confirm unexpected requests for wire transfers or sensitive information."
            ]

    for p in precautions[:3]:
        pdf.set_fill_color(0.06, 0.73, 0.51)
        pdf.draw_text(50, current_y - 12, "[x]", font="/F2", size=8.5)
        pdf.set_fill_color(0.20, 0.25, 0.35)
        pdf.draw_text(68, current_y - 12, p[:88], font="/F1", size=8.5)
        current_y -= 17

    # 7. Disclaimer & Footer
    footer_y = 50
    pdf.set_stroke_color(0.85, 0.88, 0.92)
    pdf.draw_line(40, footer_y + 24, 555, footer_y + 24)

    pdf.set_fill_color(0.55, 0.60, 0.68)
    disclaimer_text = (
        "Disclaimer: This report is an automated statistical prediction generated by ProbMail using Bayesian conditional probability. "
        "It is an algorithmic score based on learned text patterns and does not constitute a legal or absolute guarantee of email safety."
    )
    for d_line in wrap_text(disclaimer_text, max_chars=105):
        pdf.draw_text(40, footer_y + 12, d_line, font="/F1", size=7.0)
        footer_y -= 9

    pdf.set_fill_color(0.40, 0.45, 0.55)
    pdf.draw_text(40, 20, "ProbMail Security Platform  *  Zero-Dependency PDF Report Generator", font="/F1", size=8)
    pdf.draw_text(495, 20, "Page 1 of 1", font="/F2", size=8)

    return pdf.build()
