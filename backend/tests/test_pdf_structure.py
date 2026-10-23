import re
import io
from services.report_service import generate_scan_report_pdf, SimplePDFBuilder


def test_pdf_validity_and_xref_integrity():
    scan_data = {
        "subject": "Security Alert: Verify Your Account Credentials",
        "predicted_class": "spam",
        "confidence_percentage": 94.6,
        "spam_probability": 94.6,
        "ham_probability": 5.4,
        "risk_score": 95,
        "risk_category": "High Risk",
        "verdict_summary": "Email contains artificial urgency and credential verification cues.",
        "warning_signs": [
            {"title": "Urgent Action Pressure", "detail": "Time-sensitive warnings to coerce immediate action.", "category": "Urgency"},
            {"title": "Credential Harvest", "detail": "Prompts recipient to confirm login credentials.", "category": "Phishing"}
        ],
        "recommended_precautions": [
            "Do not click hyperlinks or download attachments.",
            "Verify sender identity through official independent channels."
        ]
    }

    pdf_bytes = generate_scan_report_pdf(scan_data)
    assert pdf_bytes.startswith(b"%PDF-1.4\n")
    assert pdf_bytes.rstrip().endswith(b"%%EOF")

    # 1. Check xref table
    assert b"\nxref\n0 " in pdf_bytes
    xref_match = re.search(rb"startxref\s+(\d+)\s+%%EOF", pdf_bytes)
    assert xref_match is not None
    xref_pos = int(xref_match.group(1))

    # The xref table should be at xref_pos
    assert pdf_bytes[xref_pos:xref_pos + 4] == b"xref"

    # 2. Check each object offset in xref table
    lines = pdf_bytes[xref_pos:].split(b"\n")
    # First line: xref
    # Second line: 0 N
    header = lines[1].split()
    total_objects = int(header[1])

    offsets = []
    for i in range(2, 2 + total_objects):
        entry = lines[i]
        assert len(entry) == 19 or len(entry) == 20 or entry.endswith(b" ")
        parts = entry.split()
        if len(parts) >= 3:
            offset = int(parts[0])
            gen = int(parts[1])
            status = parts[2]
            if status == b"n":
                offsets.append(offset)

    assert len(offsets) == 6  # 6 objects in our builder

    # Verify that each offset points to "X 0 obj"
    for idx, off in enumerate(offsets, start=1):
        target = pdf_bytes[off:off + 30]
        expected_obj = f"{idx} 0 obj".encode("ascii")
        assert expected_obj in target, f"Offset {off} does not point to {expected_obj}, found: {target}"

    # 3. Check Stream Length matches /Length dictionary entry
    stream_match = re.search(rb"6 0 obj\s*<<\s*/Length\s+(\d+)\s*>>\s*stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.DOTALL)
    assert stream_match is not None
    declared_len = int(stream_match.group(1))
    actual_len = len(stream_match.group(2))
    assert declared_len == actual_len, f"Stream declared length {declared_len} != actual {actual_len}"

    # 4. Check that critical scan data is present in the stream
    stream_content = stream_match.group(2)
    assert b"ProbMail" in stream_content
    assert b"EMAIL SECURITY SCAN REPORT" in stream_content
    assert b"SPAM / SUSPICIOUS" in stream_content
    assert b"95 / 100" in stream_content
    assert b"[HIGH RISK]" in stream_content
    assert b"94.60%" in stream_content
    assert b"5.40%" in stream_content
    assert b"Security Alert: Verify Your Account Credentials" in stream_content
