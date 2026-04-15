"""
GhostResume.ai — FastAPI Backend
Production API that wraps the resume bot pipeline.
"""
import os
import json
import uuid
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

import httpx
import pdfplumber
from docx import Document as DocxDocument

app = FastAPI(title="GhostResume.ai", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
OUTPUT_DIR = Path("./output")
OUTPUT_DIR.mkdir(exist_ok=True)


# ============================================================
# HELPERS
# ============================================================
async def call_claude(system_prompt: str, user_message: str, use_search: bool = False) -> str:
    """Call Claude API and return text response."""
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 8000,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }
    if use_search:
        payload["tools"] = [{"type": "web_search_20250305", "name": "web_search"}]

    headers = {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        text_blocks = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
        return "\n".join(text_blocks)


async def call_perplexity(query: str) -> str:
    """Call Perplexity API for company research."""
    if not PERPLEXITY_KEY:
        return ""

    headers = {
        "Authorization": f"Bearer {PERPLEXITY_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sonar-pro",
        "messages": [
            {"role": "system", "content": "You are a company research analyst. Provide factual, current information."},
            {"role": "user", "content": query},
        ],
        "max_tokens": 2048,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            response = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception:
            return ""


def parse_json_response(raw: str) -> dict:
    """Extract JSON from Claude response."""
    cleaned = raw.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0]
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0]
    brace_start = cleaned.find("{")
    if brace_start > 0:
        cleaned = cleaned[brace_start:]
    brace_end = cleaned.rfind("}")
    if brace_end > -1:
        cleaned = cleaned[:brace_end + 1]
    return json.loads(cleaned.strip())


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file."""
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text


def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX file."""
    doc = DocxDocument(file_path)
    return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])


# ============================================================
# MODELS
# ============================================================
class PipelineRequest(BaseModel):
    resume_text: str
    job_input: str
    job_is_url: bool = False


class PipelineResponse(BaseModel):
    session_id: str
    company: str
    role: str
    location: str
    ceo_pain: str
    ats_score: int
    viability_score: int
    recommendation: str
    tailored_resume: dict
    cover_letter: dict
    gap_report: dict
    interview_prep: dict
    red_flags: list
    green_flags: list


# ============================================================
# ENDPOINTS
# ============================================================
@app.get("/")
async def root():
    return {"name": "GhostResume.ai", "status": "running", "version": "1.0.0"}


@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """Upload and parse a resume file (PDF or DOCX) into text."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.lower().split(".")[-1]
    if ext not in ("pdf", "docx", "doc", "txt"):
        raise HTTPException(400, "Unsupported file type. Use PDF, DOCX, or TXT.")

    # Save temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if ext == "pdf":
            text = extract_text_from_pdf(tmp_path)
        elif ext in ("docx", "doc"):
            text = extract_text_from_docx(tmp_path)
        else:
            text = content.decode("utf-8", errors="replace")
    finally:
        os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(400, "Could not extract text from file. Try pasting your resume text directly.")

    return {"text": text, "filename": file.filename, "char_count": len(text)}


@app.post("/api/run-pipeline")
async def run_pipeline(request: PipelineRequest):
    """Run the full GhostResume pipeline."""
    if not ANTHROPIC_KEY:
        raise HTTPException(500, "Anthropic API key not configured")

    session_id = str(uuid.uuid4())[:8]

    # Fetch job posting if URL
    job_text = request.job_input
    if request.job_is_url:
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(request.job_input, headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
                })
                import re
                text = re.sub(r'<script[^>]*>.*?</script>', '', resp.text, flags=re.DOTALL)
                text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
                text = re.sub(r'<[^>]+>', ' ', text)
                job_text = re.sub(r'\s+', ' ', text).strip()[:15000]
        except Exception as e:
            raise HTTPException(400, f"Could not fetch job posting URL: {e}")

    # Company research via Perplexity (parallel would be nice but keeping it simple)
    # We'll extract company name first from the job text
    company_research = ""

    # Main pipeline call to Claude
    system_prompt = """You are GhostResume.ai — an expert resume tailoring engine that thinks like a recruiter.

You use the "Ghost Resume" methodology:
1. FIRST: Parse the uploaded resume into a structured vault — extract every skill, experience entry, bullet point, metric, and education item into a tagged, organized format. This vault is your source of truth.
2. Parse the job posting and classify requirements by signal strength (dealbreaker / strong / bonus)
3. Analyze the CEO's pain — WHY they're hiring, not just what they want
4. Generate the ideal candidate's resume for this role (the ghost)
5. Map the vault's real experience onto the ghost resume's structure
6. Generate gap report, cover letter, interview prep, ATS score

CRITICAL RULES:
- NEVER fabricate experience. Only reframe what the candidate actually has in their vault.
- Mirror the posting's language without copying verbatim.
- Quantify everything possible — pull metrics from the vault.
- Address the CEO's pain in the professional summary and top bullets.
- ALWAYS extract the candidate's full contact info (name, email, phone, location, linkedin) from the resume.
- For the cover letter: search for the company's physical address and hiring manager name. Format as a proper business letter.

For the cover letter: write the full letter BODY first, then re-read it and REPLACE the first line with a hook. The contact header, date, and recipient info go in separate fields — NOT in full_text.

Respond ONLY with valid JSON (no markdown fences):
{
  "company": "string",
  "role": "string",
  "location": "string",
  "ceo_pain": "string",
  "pain_category": "string",
  "ats_score": number,
  "viability_score": number,
  "recommendation": "strong_apply | apply_with_strategy | risky_apply | skip",
  "red_flags": [{"flag": "string", "severity": "string"}],
  "green_flags": [{"flag": "string"}],
  "contact": {
    "name": "string (full name from resume)",
    "email": "string (from resume)",
    "phone": "string (from resume)",
    "location": "string (city, state from resume)",
    "linkedin": "string or null (from resume if present)"
  },
  "vault": {
    "skills": [{"name": "string", "proficiency": "string", "tags": ["string"]}],
    "experience": [{"company": "string", "role": "string", "dates": "string", "bullets": [{"text": "string", "tags": ["string"], "metrics": "string or null"}]}],
    "education": [{"institution": "string", "degree": "string", "dates": "string"}]
  },
  "tailored_resume": {
    "summary": "string",
    "sections": [{"name": "string", "entries": [{"title": "string", "company": "string", "dates": "string", "bullets": ["string"]}]}],
    "skills": ["string"],
    "education": [{"degree": "string", "institution": "string", "dates": "string"}]
  },
  "cover_letter": {
    "recipient_name": "string (hiring manager name if found, otherwise 'Hiring Manager')",
    "recipient_title": "string or null",
    "company_name": "string",
    "company_address": "string (full street address of company, searched via web — e.g. '1901 Ulmerton Road, Clearwater, FL 33762')",
    "hook_line": "string",
    "original_first_line": "string",
    "full_text": "string (BODY ONLY — the 3 paragraphs, no header/date/address, no sign-off name)",
    "sign_off": "string (e.g. 'Sincerely,' or 'Best regards,')"
  },
  "gap_report": {
    "critical_gaps": [{"gap": "string", "strategy": "string"}],
    "advantages": [{"strength": "string", "pitch": "string"}],
    "gap_closers": [{"gap": "string", "tier": "string", "action": "string", "time": "string"}]
  },
  "interview_prep": {
    "two_min_pitch": "string",
    "gap_questions": [{"question": "string", "answer": "string"}],
    "behavioral_stars": [{"question": "string", "situation": "string", "task": "string", "action": "string", "result": "string"}],
    "technical_questions": [{"question": "string", "answer": "string"}],
    "questions_to_ask": [{"question": "string", "why": "string"}],
    "salary": {"floor": "string", "target": "string", "stretch": "string"}
  }
}"""

    user_message = f"RESUME:\n{request.resume_text}\n\nJOB POSTING:\n{job_text}"

    try:
        raw = await call_claude(system_prompt, user_message, use_search=True)
        result = parse_json_response(raw)
    except Exception as e:
        raise HTTPException(500, f"Pipeline error: {str(e)}")

    # Save session
    session_path = OUTPUT_DIR / f"{session_id}.json"
    result["session_id"] = session_id
    result["timestamp"] = datetime.now().isoformat()
    with open(session_path, "w") as f:
        json.dump(result, f, indent=2)

    return result


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Retrieve a previous session's results."""
    session_path = OUTPUT_DIR / f"{session_id}.json"
    if not session_path.exists():
        raise HTTPException(404, "Session not found")
    with open(session_path) as f:
        return json.load(f)


class DocumentRequest(BaseModel):
    type: str  # "resume" or "cover_letter"
    format: str  # "pdf" or "docx"
    data: dict  # the tailored_resume or cover_letter object from results
    company: str = "Company"
    role: str = "Role"


def _build_resume_docx(data: dict, contact: dict, filepath: str):
    """Generate a professional DOCX resume with contact header."""
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn

    doc = DocxDocument()
    for section in doc.sections:
        section.top_margin = Inches(0.6)
        section.bottom_margin = Inches(0.6)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10.5)
    style.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    def add_border(p):
        pPr = p._p.get_or_add_pPr()
        pBdr = pPr.makeelement(qn('w:pBdr'), {})
        bottom = pBdr.makeelement(qn('w:bottom'), {qn('w:val'): 'single', qn('w:sz'): '4', qn('w:space'): '1', qn('w:color'): '999999'})
        pBdr.append(bottom)
        pPr.append(pBdr)

    # Name header
    if contact.get("name"):
        np = doc.add_paragraph()
        np.alignment = WD_ALIGN_PARAGRAPH.CENTER
        nr = np.add_run(contact["name"])
        nr.bold = True
        nr.font.size = Pt(18)
        nr.font.color.rgb = RGBColor(0x1a, 0x1a, 0x1a)
        np.space_after = Pt(2)

    # Contact line
    contact_parts = [contact.get(k) for k in ["location", "phone", "email", "linkedin"] if contact.get(k)]
    if contact_parts:
        cp = doc.add_paragraph()
        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cr = cp.add_run(" | ".join(contact_parts))
        cr.font.size = Pt(9)
        cr.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
        cp.space_after = Pt(6)

    # Divider
    dp = doc.add_paragraph()
    dp.space_before = Pt(0)
    dp.space_after = Pt(4)
    pPr = dp._p.get_or_add_pPr()
    pBdr = pPr.makeelement(qn('w:pBdr'), {})
    bottom = pBdr.makeelement(qn('w:bottom'), {qn('w:val'): 'single', qn('w:sz'): '6', qn('w:space'): '1', qn('w:color'): '333333'})
    pBdr.append(bottom)
    pPr.append(pBdr)

    # Summary
    summary = data.get("summary", "")
    if summary:
        p = doc.add_paragraph()
        run = p.add_run("PROFESSIONAL SUMMARY")
        run.bold = True
        run.font.size = Pt(11)
        add_border(p)
        sp = doc.add_paragraph(summary)
        sp.space_after = Pt(6)

    # Sections
    for section in data.get("sections", []):
        p = doc.add_paragraph()
        run = p.add_run((section.get("name", "")).upper())
        run.bold = True
        run.font.size = Pt(11)
        p.space_before = Pt(8)
        add_border(p)

        for entry in section.get("entries", []):
            ep = doc.add_paragraph()
            run_title = ep.add_run(entry.get("title", ""))
            run_title.bold = True
            run_title.font.size = Pt(10.5)
            if entry.get("company"):
                ep.add_run(f" — {entry['company']}")
            if entry.get("dates"):
                dr = ep.add_run(f"  |  {entry['dates']}")
                dr.font.size = Pt(9.5)
                dr.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
            ep.space_after = Pt(2)

            for bullet in entry.get("bullets", []):
                bp = doc.add_paragraph(style='List Bullet')
                bp.text = bullet
                bp.paragraph_format.left_indent = Inches(0.3)
                bp.paragraph_format.space_after = Pt(1)

    # Skills
    skills = data.get("skills", [])
    if skills:
        p = doc.add_paragraph()
        run = p.add_run("SKILLS")
        run.bold = True
        run.font.size = Pt(11)
        p.space_before = Pt(8)
        add_border(p)
        doc.add_paragraph(" | ".join(skills))

    # Education
    education = data.get("education", [])
    if education:
        p = doc.add_paragraph()
        run = p.add_run("EDUCATION")
        run.bold = True
        run.font.size = Pt(11)
        p.space_before = Pt(8)
        add_border(p)
        for edu in education:
            ep = doc.add_paragraph()
            er = ep.add_run(f"{edu.get('degree', '')}")
            er.bold = True
            ep.add_run(f" — {edu.get('institution', '')}  |  {edu.get('dates', '')}")

    doc.save(filepath)


def _build_resume_pdf(data: dict, contact: dict, filepath: str):
    """Generate a professional PDF resume with contact header."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    doc = SimpleDocTemplate(filepath, pagesize=letter,
                            topMargin=0.5*inch, bottomMargin=0.5*inch,
                            leftMargin=0.65*inch, rightMargin=0.65*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='ResName', fontName='Helvetica-Bold', fontSize=16, alignment=1, spaceAfter=2, textColor=HexColor('#1a1a1a')))
    styles.add(ParagraphStyle(name='ResCont', fontName='Helvetica', fontSize=8.5, alignment=1, spaceAfter=4, textColor=HexColor('#666666')))
    styles.add(ParagraphStyle(name='SHead', fontName='Helvetica-Bold', fontSize=10, spaceBefore=10, spaceAfter=3, textColor=HexColor('#1a1a1a')))
    styles.add(ParagraphStyle(name='EntryTitle', fontName='Helvetica-Bold', fontSize=10, spaceAfter=1, textColor=HexColor('#333333')))
    styles.add(ParagraphStyle(name='EntryDate', fontName='Helvetica', fontSize=8.5, textColor=HexColor('#666666'), spaceAfter=2))
    styles.add(ParagraphStyle(name='ResBullet', fontName='Helvetica', fontSize=9.5, leftIndent=14, spaceAfter=2, textColor=HexColor('#333333')))
    styles.add(ParagraphStyle(name='Sum', fontName='Helvetica', fontSize=9.5, spaceAfter=6, textColor=HexColor('#333333')))
    styles.add(ParagraphStyle(name='Skl', fontName='Helvetica', fontSize=9.5, spaceAfter=4, textColor=HexColor('#333333')))

    story = []
    hr_thick = lambda: HRFlowable(width="100%", thickness=0.5, color=HexColor('#333333'), spaceAfter=6, spaceBefore=4)
    hr_thin = lambda: HRFlowable(width="100%", thickness=0.3, color=HexColor('#999999'), spaceAfter=4)

    # Contact header
    if contact.get("name"):
        story.append(Paragraph(contact["name"], styles['ResName']))
    contact_parts = [contact.get(k) for k in ["location", "phone", "email", "linkedin"] if contact.get(k)]
    if contact_parts:
        story.append(Paragraph(" | ".join(contact_parts), styles['ResCont']))
    story.append(hr_thick())

    # Summary
    summary = data.get("summary", "")
    if summary:
        story.append(Paragraph("PROFESSIONAL SUMMARY", styles['SHead']))
        story.append(hr_thin())
        story.append(Paragraph(summary, styles['Sum']))

    for section in data.get("sections", []):
        story.append(Paragraph((section.get("name", "")).upper(), styles['SHead']))
        story.append(hr_thin())
        for entry in section.get("entries", []):
            title = f"<b>{entry.get('title', '')}</b>"
            if entry.get("company"):
                title += f" — {entry['company']}"
            story.append(Paragraph(title, styles['EntryTitle']))
            if entry.get("dates"):
                story.append(Paragraph(entry["dates"], styles['EntryDate']))
            for bullet in entry.get("bullets", []):
                safe = bullet.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                story.append(Paragraph(f"• {safe}", styles['ResBullet']))
            story.append(Spacer(1, 4))

    skills = data.get("skills", [])
    if skills:
        story.append(Paragraph("SKILLS", styles['SHead']))
        story.append(hr_thin())
        story.append(Paragraph(" | ".join(skills), styles['Skl']))

    education = data.get("education", [])
    if education:
        story.append(Paragraph("EDUCATION", styles['SHead']))
        story.append(hr_thin())
        for edu in education:
            safe = f"<b>{edu.get('degree', '')}</b> — {edu.get('institution', '')}  |  {edu.get('dates', '')}"
            story.append(Paragraph(safe, styles['Sum']))

    doc.build(story)


def _build_cover_letter_docx(data: dict, contact: dict, filepath: str):
    """Generate cover letter as DOCX with full business letter format."""
    from docx.shared import Pt, Inches, RGBColor
    doc = DocxDocument()
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(11)

    # Sender header
    if contact.get("name"):
        np = doc.add_paragraph()
        nr = np.add_run(contact["name"])
        nr.bold = True
        nr.font.size = Pt(13)
    contact_parts = [contact.get(k) for k in ["location", "phone", "email"] if contact.get(k)]
    if contact_parts:
        cp = doc.add_paragraph(" | ".join(contact_parts))
        for run in cp.runs:
            run.font.size = Pt(9.5)
            run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    # Date
    doc.add_paragraph("")
    doc.add_paragraph(datetime.now().strftime("%B %d, %Y"))

    # Recipient
    doc.add_paragraph("")
    recipient = data.get("recipient_name", "Hiring Manager")
    doc.add_paragraph(recipient)
    if data.get("company_name"):
        doc.add_paragraph(data["company_name"])
    if data.get("company_address"):
        doc.add_paragraph(data["company_address"])

    # Greeting
    doc.add_paragraph("")
    greeting_name = recipient if recipient != "Hiring Manager" else "Hiring Team"
    doc.add_paragraph(f"Dear {greeting_name},")

    # Body
    doc.add_paragraph("")
    full_text = data.get("full_text", "")
    for para in full_text.split("\n\n"):
        if para.strip():
            doc.add_paragraph(para.strip())

    # Sign-off
    doc.add_paragraph("")
    sign_off = data.get("sign_off", "Sincerely,")
    doc.add_paragraph(sign_off)
    doc.add_paragraph("")
    if contact.get("name"):
        doc.add_paragraph(contact["name"])

    doc.save(filepath)


def _build_cover_letter_pdf(data: dict, contact: dict, filepath: str):
    """Generate cover letter as PDF with full business letter format."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    doc = SimpleDocTemplate(filepath, pagesize=letter,
                            topMargin=1*inch, bottomMargin=1*inch,
                            leftMargin=1*inch, rightMargin=1*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='SenderName', fontName='Helvetica-Bold', fontSize=13, spaceAfter=2, textColor=HexColor('#1a1a1a')))
    styles.add(ParagraphStyle(name='SenderInfo', fontName='Helvetica', fontSize=9.5, spaceAfter=2, textColor=HexColor('#666666')))
    styles.add(ParagraphStyle(name='LetterBody', fontName='Helvetica', fontSize=11, spaceAfter=10, textColor=HexColor('#333333'), leading=16))
    styles.add(ParagraphStyle(name='LetterMeta', fontName='Helvetica', fontSize=11, spaceAfter=2, textColor=HexColor('#333333')))

    story = []

    # Sender
    if contact.get("name"):
        story.append(Paragraph(contact["name"], styles['SenderName']))
    contact_parts = [contact.get(k) for k in ["location", "phone", "email"] if contact.get(k)]
    if contact_parts:
        story.append(Paragraph(" | ".join(contact_parts), styles['SenderInfo']))
    story.append(Spacer(1, 16))

    # Date
    story.append(Paragraph(datetime.now().strftime("%B %d, %Y"), styles['LetterMeta']))
    story.append(Spacer(1, 12))

    # Recipient
    recipient = data.get("recipient_name", "Hiring Manager")
    story.append(Paragraph(recipient, styles['LetterMeta']))
    if data.get("company_name"):
        story.append(Paragraph(data["company_name"], styles['LetterMeta']))
    if data.get("company_address"):
        story.append(Paragraph(data["company_address"], styles['LetterMeta']))
    story.append(Spacer(1, 16))

    # Greeting
    greeting_name = recipient if recipient != "Hiring Manager" else "Hiring Team"
    story.append(Paragraph(f"Dear {greeting_name},", styles['LetterBody']))
    story.append(Spacer(1, 8))

    # Body
    full_text = data.get("full_text", "")
    for para in full_text.split("\n\n"):
        if para.strip():
            safe = para.strip().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(safe, styles['LetterBody']))

    # Sign-off
    story.append(Spacer(1, 12))
    sign_off = data.get("sign_off", "Sincerely,")
    story.append(Paragraph(sign_off, styles['LetterBody']))
    story.append(Spacer(1, 24))
    if contact.get("name"):
        story.append(Paragraph(contact["name"], styles['LetterMeta']))

    doc.build(story)


@app.post("/api/generate-document")
async def generate_document(request: DocumentRequest):
    """Generate a PDF or DOCX from tailored resume or cover letter data."""
    safe_company = "".join(c for c in request.company if c.isalnum() or c in (' ', '-', '_')).strip().replace(" ", "_")
    safe_role = "".join(c for c in request.role if c.isalnum() or c in (' ', '-', '_')).strip().replace(" ", "_")

    ext = request.format.lower()
    if ext not in ("pdf", "docx"):
        raise HTTPException(400, "Format must be 'pdf' or 'docx'")

    prefix = "Resume" if request.type == "resume" else "CoverLetter"
    filename = f"{prefix}_{safe_company}_{safe_role}.{ext}"
    filepath = OUTPUT_DIR / filename

    # Extract contact from the top-level results if provided
    contact = request.data.get("_contact", {})

    try:
        if request.type == "resume":
            if ext == "pdf":
                _build_resume_pdf(request.data, contact, str(filepath))
            else:
                _build_resume_docx(request.data, contact, str(filepath))
        elif request.type == "cover_letter":
            if ext == "pdf":
                _build_cover_letter_pdf(request.data, contact, str(filepath))
            else:
                _build_cover_letter_docx(request.data, contact, str(filepath))
        else:
            raise HTTPException(400, "Type must be 'resume' or 'cover_letter'")
    except Exception as e:
        raise HTTPException(500, f"Document generation failed: {str(e)}")

    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/pdf" if ext == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "anthropic_key_set": bool(ANTHROPIC_KEY),
        "perplexity_key_set": bool(PERPLEXITY_KEY),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
