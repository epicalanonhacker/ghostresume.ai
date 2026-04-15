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
1. Parse the job posting and classify requirements by signal strength
2. Analyze the CEO's pain — WHY they're hiring
3. Generate the ideal candidate's resume (the ghost)
4. Map the real candidate's experience onto the ghost
5. Generate gap report, cover letter, interview prep, ATS score

CRITICAL RULES:
- NEVER fabricate experience. Only reframe what the candidate actually has.
- Mirror the posting's language without copying verbatim.
- Quantify everything possible.
- Address the CEO's pain — WHY they're hiring, not just what they want.

For the cover letter: write the full letter first, then re-read it and REPLACE the first line with a hook — the most surprising or counter-intuitive thing about the candidate for this role.

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
  "tailored_resume": {
    "summary": "string",
    "sections": [{"name": "string", "entries": [{"title": "string", "company": "string", "dates": "string", "bullets": ["string"]}]}],
    "skills": ["string"]
  },
  "cover_letter": {
    "hook_line": "string",
    "original_first_line": "string",
    "full_text": "string"
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
