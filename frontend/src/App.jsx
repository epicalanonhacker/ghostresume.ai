import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, Link, Zap, Download, ChevronRight, Ghost, Shield, Target, MessageSquare, BookOpen, AlertTriangle, CheckCircle, Loader2, X, Eye, Database } from "lucide-react";

const ACCENT = "#00d4ff";
const ACCENT_DIM = "rgba(0,212,255,0.15)";
const BG = "#08080f";
const CARD = "#101018";
const BORDER = "#1e1e2e";
const TEXT = "#e4e4e7";
const MUTED = "#71717a";
const SUCCESS = "#22c55e";
const WARNING = "#f59e0b";
const DANGER = "#ef4444";

const PIPELINE_STEPS = [
  { label: "Extracting resume into vault", icon: "🗄️" },
  { label: "Parsing job posting", icon: "📋" },
  { label: "Analyzing CEO pain point", icon: "🧠" },
  { label: "Researching company", icon: "🔍" },
  { label: "Building ghost resume", icon: "👻" },
  { label: "Mapping your experience", icon: "🗺️" },
  { label: "Scoring ATS match", icon: "📈" },
  { label: "Writing cover letter", icon: "✉️" },
  { label: "Generating interview prep", icon: "🎤" },
  { label: "Finalizing documents", icon: "📄" },
];

const GradeCircle = ({ score, size = 120 }) => {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? SUCCESS : score >= 60 ? WARNING : DANGER;
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B+" : score >= 60 ? "B" : score >= 50 ? "C" : "D";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={BORDER} strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 1.5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 800, color }}>{grade}</span>
        <span style={{ fontSize: size * 0.14, color: MUTED }}>{score}/100</span>
      </div>
    </div>
  );
};

const TabButton = ({ active, children, onClick }) => (
  <button onClick={onClick} style={{
    padding: "10px 20px", border: "none", borderRadius: "8px 8px 0 0",
    background: active ? CARD : "transparent", color: active ? ACCENT : MUTED,
    fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: active ? 600 : 400,
    cursor: "pointer", borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent",
    transition: "all 0.2s"
  }}>{children}</button>
);

const DlBtn = ({ onClick, children }) => (
  <button onClick={onClick} style={{
    display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px",
    border: `1px solid ${BORDER}`, borderRadius: "6px", background: CARD,
    color: ACCENT, fontSize: "13px", fontWeight: 500, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  }}><Download size={14} /> {children}</button>
);

const API_BASE = "https://ghostresumeai-production.up.railway.app";

async function uploadResume(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload-resume`, { method: "POST", body: formData });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Upload failed"); }
  return res.json();
}

async function runBackendPipeline(resumeText, jobInput, jobIsUrl, voiceMode) {
  const res = await fetch(`${API_BASE}/api/run-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText, job_input: jobInput, job_is_url: jobIsUrl, voice_mode: voiceMode || "match" }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Pipeline failed"); }
  return res.json();
}

async function downloadDocument(type, format, data, company, role, contact) {
  try {
    // Inject contact into data so the backend doc generators can use it
    const enrichedData = { ...data, _contact: contact || {} };
    const res = await fetch(`${API_BASE}/api/generate-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, format, data: enrichedData, company, role }),
    });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const prefix = type === "resume" ? "Resume" : "CoverLetter";
    const safeCo = (company || "Company").replace(/[^a-zA-Z0-9]/g, "_");
    const safeRole = (role || "Role").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${prefix}_${safeCo}_${safeRole}.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Download failed: " + err.message);
  }
}

function dlText(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function apiGapTranslate(gap, gapStrategy, vault, role, company) {
  const res = await fetch(`${API_BASE}/api/gap-translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gap, gap_strategy: gapStrategy, vault, role, company }),
  });
  if (!res.ok) throw new Error("Translation failed");
  return res.json();
}

async function apiQuestionnaireStart(gap, gapStrategy, role, company) {
  const res = await fetch(`${API_BASE}/api/gap-questionnaire/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gap, gap_strategy: gapStrategy, role, company }),
  });
  if (!res.ok) throw new Error("Questionnaire failed to start");
  return res.json();
}

async function apiQuestionnaireContinue(gap, role, company, conversation, questionCount) {
  const res = await fetch(`${API_BASE}/api/gap-questionnaire/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gap, role, company, conversation, question_count: questionCount }),
  });
  if (!res.ok) throw new Error("Questionnaire failed to continue");
  return res.json();
}

function fmtResume(r) {
  const res = r.tailored_resume; if (!res) return "";
  const L = [];
  L.push("═".repeat(60));
  L.push("PROFESSIONAL SUMMARY");
  L.push("═".repeat(60));
  L.push(res.summary || ""); L.push("");
  for (const s of (res.sections || [])) {
    L.push("═".repeat(60));
    L.push((s.name || "").toUpperCase());
    L.push("═".repeat(60));
    for (const e of (s.entries || [])) {
      L.push("");
      const tl = [e.title, e.company].filter(Boolean).join(" — ");
      L.push(e.dates ? `${tl}  |  ${e.dates}` : tl);
      L.push("─".repeat(40));
      for (const b of (e.bullets || [])) L.push(`  • ${b}`);
    }
    L.push("");
  }
  if (res.skills?.length) {
    L.push("═".repeat(60)); L.push("SKILLS"); L.push("═".repeat(60));
    L.push(res.skills.join("  |  "));
  }
  return L.join("\n");
}

function fmtPrep(p, co, ro) {
  if (!p) return ""; const L = [];
  L.push("╔" + "═".repeat(58) + "╗");
  L.push(`║  INTERVIEW PREP — ${ro} at ${co}`);
  L.push("╚" + "═".repeat(58) + "╝"); L.push("");
  if (p.two_min_pitch) { L.push("═ YOUR 2-MINUTE PITCH " + "═".repeat(38)); L.push(""); L.push(p.two_min_pitch); L.push(""); }
  if (p.gap_questions?.length) { L.push("═ GAP QUESTIONS " + "═".repeat(44)); L.push("");
    for (const q of p.gap_questions) { L.push(`  Q: ${q.question}`); L.push(`  A: ${q.answer}`); L.push(""); } }
  if (p.behavioral_stars?.length) { L.push("═ BEHAVIORAL STAR STORIES " + "═".repeat(34)); L.push("");
    for (const b of p.behavioral_stars) { L.push(`  Q: ${b.question}`); L.push(`  ┌ S: ${b.situation}`); L.push(`  │ T: ${b.task}`); L.push(`  │ A: ${b.action}`); L.push(`  └ R: ${b.result}`); L.push(""); } }
  if (p.technical_questions?.length) { L.push("═ TECHNICAL QUESTIONS " + "═".repeat(39)); L.push("");
    for (const t of p.technical_questions) { L.push(`  Q: ${t.question}`); L.push(`  A: ${t.answer}`); L.push(""); } }
  if (p.questions_to_ask?.length) { L.push("═ QUESTIONS TO ASK THEM " + "═".repeat(36)); L.push("");
    for (const q of p.questions_to_ask) { L.push(`  Q: ${q.question}`); L.push(`     ↳ ${q.why}`); L.push(""); } }
  if (p.salary) { L.push("═ SALARY NEGOTIATION " + "═".repeat(39)); L.push("");
    L.push(`  Floor:   ${p.salary.floor}`); L.push(`  Target:  ${p.salary.target}`); L.push(`  Stretch: ${p.salary.stretch}`); }
  return L.join("\n");
}

function slug(c, r) { return `${(c||"Co").replace(/[^a-zA-Z0-9]/g,"_")}_${(r||"Role").replace(/[^a-zA-Z0-9]/g,"_")}`; }

export default function GhostResumeApp() {
  const [screen, setScreen] = useState("upload");
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadFormat, setUploadFormat] = useState("txt");
  const [voiceMode, setVoiceMode] = useState("match"); // "match" or "professional"
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("resume");
  const [showSkillTranslator, setShowSkillTranslator] = useState(false);
  const [gapModal, setGapModal] = useState(null); // { gap, strategy, mode, ...state }
  const [addedBullets, setAddedBullets] = useState([]); // bullets added to resume via gap closer
  const [addedSkills, setAddedSkills] = useState([]); // skills added from translator
  const [outcomeReported, setOutcomeReported] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setResumeFileName(file.name);
    setResumeFile(file);
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "pdf") setUploadFormat("pdf");
    else if (ext === "docx" || ext === "doc") setUploadFormat("docx");
    else setUploadFormat("txt");
    if (ext === "txt" || ext === "md") {
      const reader = new FileReader();
      reader.onload = (e) => setResumeText(e.target.result);
      reader.readAsText(file);
    } else { setResumeText(""); }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const runPipeline = async () => {
    if (!resumeText && !resumeFile) { setError("Drop your resume first."); return; }
    const hasUrl = jobUrl.trim().length > 0;
    const hasText = jobText.trim().length > 0;
    if (!hasUrl && !hasText) { setError("Provide a job posting URL or paste the description."); return; }
    setError(""); setScreen("processing"); setCurrentStep(0); setElapsed(0);

    let si, ti;
    try {
      si = setInterval(() => setCurrentStep(p => Math.min(p + 1, PIPELINE_STEPS.length - 1)), 3500);
      ti = setInterval(() => setElapsed(p => p + 1), 1000);

      let txt = resumeText;
      if (resumeFile && !txt) {
        const up = await uploadResume(resumeFile);
        txt = up.text;
      }

      const jobInput = hasUrl ? jobUrl.trim() : jobText.trim();
      const parsed = await runBackendPipeline(txt, jobInput, hasUrl, voiceMode);

      clearInterval(si); clearInterval(ti);
      setResults(parsed); setCurrentStep(PIPELINE_STEPS.length);
      setTimeout(() => setScreen("results"), 800);
    } catch (err) {
      if (si) clearInterval(si); if (ti) clearInterval(ti);
      setError(`Pipeline error: ${err.message}`); setScreen("upload");
    }
  };

  const resetAll = () => {
    setScreen("upload"); setResults(null); setResumeText(""); setResumeFileName("");
    setResumeFile(null); setUploadFormat("txt"); setJobUrl(""); setJobText(""); setActiveTab("resume");
    setGapModal(null); setAddedBullets([]); setAddedSkills([]); setOutcomeReported(false);
  };

  // Merge added bullets/skills into the tailored resume for display and download
  const getEnrichedResume = () => {
    if (!results) return null;
    const base = results.tailored_resume || {};
    const enriched = JSON.parse(JSON.stringify(base));
    // Inject added bullets into the right section (create section if needed)
    for (const b of addedBullets) {
      const targetName = b.section || "Additional Experience";
      let section = (enriched.sections || []).find(s => s.name === targetName);
      if (!section) {
        section = { name: targetName, entries: [{ title: "Additional Qualifications", company: "", dates: "", bullets: [] }] };
        enriched.sections = enriched.sections || [];
        enriched.sections.push(section);
      }
      // Add to first entry in that section
      if (!section.entries || !section.entries.length) {
        section.entries = [{ title: "Additional Qualifications", company: "", dates: "", bullets: [] }];
      }
      section.entries[0].bullets = section.entries[0].bullets || [];
      section.entries[0].bullets.push(b.bullet);
    }
    // Merge added skills
    if (addedSkills.length) {
      enriched.skills = [...(enriched.skills || []), ...addedSkills.filter(s => !(enriched.skills || []).includes(s))];
    }
    return enriched;
  };

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap";
    link.rel = "stylesheet"; document.head.appendChild(link);
  }, []);

  const base = { fontFamily: "'DM Sans', sans-serif", background: BG, color: TEXT, minHeight: "100vh", position: "relative", overflow: "hidden" };

  // ===== UPLOAD =====
  if (screen === "upload") return (
    <div style={base}>
      <div style={{ position: "absolute", top: "-200px", left: "50%", transform: "translateX(-50%)", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "60px 24px", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <Ghost size={36} color={ACCENT} strokeWidth={1.5} />
            <h1 style={{ margin: 0, fontSize: "32px", fontWeight: 800, letterSpacing: "-1px" }}>
              Ghost<span style={{ color: ACCENT }}>Resume</span><span style={{ color: MUTED, fontWeight: 300 }}>.ai</span>
            </h1>
          </div>
          <p style={{ color: MUTED, fontSize: "16px", margin: 0, lineHeight: 1.6 }}>
            We reverse-engineer what the recruiter wants to see.<br/>Then we make your resume say exactly that.
          </p>
        </div>

        {/* Resume upload */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: MUTED, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Your Resume</label>
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${dragOver ? ACCENT : BORDER}`, borderRadius: "12px", padding: "40px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.3s", background: dragOver ? ACCENT_DIM : CARD }}>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" hidden onChange={(e) => handleFile(e.target.files[0])} />
            {resumeFileName ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                <FileText size={24} color={SUCCESS} />
                <span style={{ fontSize: "15px", fontWeight: 500 }}>{resumeFileName}</span>
                <button onClick={(e) => { e.stopPropagation(); setResumeFileName(""); setResumeText(""); setResumeFile(null); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}><X size={16} color={MUTED} /></button>
              </div>
            ) : (<>
              <Upload size={32} color={MUTED} style={{ marginBottom: "12px" }} />
              <p style={{ margin: 0, color: MUTED, fontSize: "14px" }}>Drag & drop your resume here, or <span style={{ color: ACCENT }}>browse</span></p>
              <p style={{ margin: "8px 0 0", color: MUTED, fontSize: "12px", opacity: 0.6 }}>PDF, DOCX, or TXT</p>
            </>)}
          </div>
          {!resumeFileName && (
            <details style={{ marginTop: "12px" }}>
              <summary style={{ fontSize: "13px", color: MUTED, cursor: "pointer" }}>Or paste your resume text</summary>
              <textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste your resume content here..."
                style={{ width: "100%", minHeight: "160px", marginTop: "8px", padding: "14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, fontFamily: "'Space Mono', monospace", fontSize: "12px", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </details>
          )}
        </div>

        {/* Voice Mode Toggle */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: MUTED, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>Writing Style</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setVoiceMode("match")} style={{
              flex: 1, padding: "12px 16px", border: `1px solid ${voiceMode === "match" ? "#c084fc" : BORDER}`,
              borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              background: voiceMode === "match" ? "rgba(192,132,252,0.1)" : CARD,
              transition: "all 0.2s", textAlign: "left",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: voiceMode === "match" ? "#c084fc" : TEXT, marginBottom: "2px" }}>Match My Voice</div>
              <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.4 }}>Output sounds like you wrote it — preserves your natural tone and style</div>
            </button>
            <button onClick={() => setVoiceMode("professional")} style={{
              flex: 1, padding: "12px 16px", border: `1px solid ${voiceMode === "professional" ? ACCENT : BORDER}`,
              borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              background: voiceMode === "professional" ? ACCENT_DIM : CARD,
              transition: "all 0.2s", textAlign: "left",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: voiceMode === "professional" ? ACCENT : TEXT, marginBottom: "2px" }}>Professional Tone</div>
              <div style={{ fontSize: "11px", color: MUTED, lineHeight: 1.4 }}>Polished, formal output regardless of how your current resume reads</div>
            </button>
          </div>
        </div>

        {/* Job URL */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: MUTED, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Job Posting URL</label>
          <div style={{ position: "relative" }}>
            <Link size={16} color={MUTED} style={{ position: "absolute", left: "14px", top: "15px" }} />
            <input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://jobs.lever.co/company/role..."
              disabled={jobText.length > 0}
              style={{ width: "100%", padding: "14px 14px 14px 40px", background: jobText.length > 0 ? "#0a0a12" : CARD, border: `1px solid ${BORDER}`, borderRadius: "8px", color: jobText.length > 0 ? MUTED : TEXT, fontFamily: "'DM Sans', sans-serif", fontSize: "14px", outline: "none", boxSizing: "border-box", opacity: jobText.length > 0 ? 0.4 : 1 }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{ flex: 1, height: "1px", background: BORDER }} />
          <span style={{ fontSize: "12px", color: MUTED, fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: "1px", background: BORDER }} />
        </div>

        {/* Job description paste */}
        <div style={{ marginBottom: "32px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: MUTED, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Paste Full Job Description</label>
          <textarea value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder="Paste the full job description here..."
            disabled={jobUrl.length > 0}
            style={{ width: "100%", minHeight: "140px", padding: "14px", background: jobUrl.length > 0 ? "#0a0a12" : CARD, border: `1px solid ${BORDER}`, borderRadius: "8px", color: jobUrl.length > 0 ? MUTED : TEXT, fontFamily: "'Space Mono', monospace", fontSize: "12px", resize: "vertical", outline: "none", boxSizing: "border-box", opacity: jobUrl.length > 0 ? 0.4 : 1 }} />
        </div>

        {error && <div style={{ background: "rgba(239,68,68,0.1)", border: `1px solid ${DANGER}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: DANGER }}>{error}</div>}

        <button onClick={runPipeline} style={{ width: "100%", padding: "16px", border: "none", borderRadius: "10px", background: `linear-gradient(135deg, ${ACCENT}, #0099cc)`, color: "#000", fontSize: "16px", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px", boxShadow: "0 0 30px rgba(0,212,255,0.2)", transition: "all 0.3s" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}><Zap size={18} /> Tailor My Resume</span>
        </button>

        <div style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          {[{ icon: <Ghost size={20} />, title: "Ghost Resume", desc: "We build the ideal candidate first — the blueprint for what this recruiter wants to see" },
            { icon: <Target size={20} />, title: "Reality Map", desc: "Your real experience reframed to match, not generic keyword stuffing" },
            { icon: <Shield size={20} />, title: "Your Voice", desc: "Output sounds like you on your best day — not like AI wrote it" }
          ].map((item, i) => (
            <div key={i} style={{ padding: "20px 16px", background: CARD, borderRadius: "10px", border: `1px solid ${BORDER}`, textAlign: "center" }}>
              <div style={{ color: ACCENT, marginBottom: "8px", display: "flex", justifyContent: "center" }}>{item.icon}</div>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>{item.title}</div>
              <div style={{ fontSize: "12px", color: MUTED }}>{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Methodology Section */}
        <div style={{ marginTop: "48px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", textAlign: "center" }}>
            Not another <span style={{ textDecoration: "line-through", color: MUTED }}>keyword stuffer</span>
          </h2>
          <p style={{ fontSize: "14px", color: MUTED, textAlign: "center", marginBottom: "28px", lineHeight: 1.6 }}>
            Most resume tools rewrite your bullets with the posting's words and call it "tailored." We do something different.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2px" }}>
            {[
              { step: "1", title: "We decode WHY they're hiring", desc: "Every open role is a business problem someone's paying to solve. We identify the CEO's pain — not just what they want, but what's keeping them up at night.", color: WARNING },
              { step: "2", title: "We build the perfect candidate", desc: "Before touching your resume, we create a 'ghost' — what the ideal applicant's resume would look like for THIS specific role. Structure, emphasis, keywords, tone.", color: ACCENT },
              { step: "3", title: "We map YOUR story onto it", desc: "Your real accomplishments get reframed to fit the ghost's blueprint. Same truth, different framing. We never fabricate — we translate.", color: SUCCESS },
              { step: "4", title: "We match YOUR voice", desc: "We analyze how you naturally write and make sure the output sounds like you. Short punchy sentences? Kept. Technical jargon? Kept. The result reads like your best day, not a stranger's.", color: "#c084fc" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", padding: "16px", background: CARD, borderRadius: i === 0 ? "10px 10px 0 0" : i === 3 ? "0 0 10px 10px" : "0", border: `1px solid ${BORDER}` }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `${s.color}15`, color: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "14px", flexShrink: 0 }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{s.title}</div>
                  <div style={{ fontSize: "12px", color: MUTED, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Objection Killer */}
        <div style={{ marginTop: "32px", background: CARD, borderRadius: "10px", border: `1px solid ${BORDER}`, padding: "20px 24px" }}>
          <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px", color: TEXT }}>
            "Won't it sound like AI wrote it?"
          </p>
          <p style={{ fontSize: "13px", color: MUTED, margin: 0, lineHeight: 1.7 }}>
            That's the exact problem we engineered against. GhostResume extracts your <span style={{ color: ACCENT }}>voice print</span> before rewriting anything — your sentence rhythm, vocabulary, formality level, even whether you lead with results or context. The output is constrained to match. If you read it and think "I wouldn't say it like that," the tool failed. Most people read it and think "I wish I'd written it that way." That's the target.
          </p>
        </div>
      </div>
    </div>
  );

  // ===== PROCESSING =====
  if (screen === "processing") return (
    <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)", pointerEvents: "none", animation: "pulse 3s ease-in-out infinite" }} />
      <style>{`@keyframes pulse{0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign: "center", position: "relative", padding: "24px" }}>
        <Ghost size={48} color={ACCENT} strokeWidth={1.5} style={{ marginBottom: "24px", opacity: 0.8 }} />
        <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700 }}>Building your ghost resume...</h2>
        <p style={{ margin: "0 0 8px", color: MUTED, fontSize: "14px" }}>This typically takes 1–2 minutes</p>
        <p style={{ margin: "0 0 32px", fontFamily: "'Space Mono', monospace", fontSize: "22px", color: ACCENT, fontWeight: 700 }}>
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </p>
        <div style={{ maxWidth: "400px", margin: "0 auto", textAlign: "left" }}>
          {PIPELINE_STEPS.map((step, i) => {
            const done = i < currentStep; const active = i === currentStep;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderRadius: "8px", marginBottom: "4px", background: active ? ACCENT_DIM : "transparent", opacity: done ? 0.5 : active ? 1 : 0.25, transition: "all 0.4s", animation: active ? "fadeIn 0.4s ease" : "none" }}>
                <span style={{ fontSize: "18px", width: "28px", textAlign: "center" }}>{done ? "✓" : step.icon}</span>
                <span style={{ fontSize: "14px", fontWeight: active ? 600 : 400, color: done ? MUTED : active ? TEXT : MUTED }}>{step.label}</span>
                {active && <Loader2 size={14} color={ACCENT} style={{ marginLeft: "auto", animation: "spin 1s linear infinite" }} />}
              </div>
            );
          })}
        </div>
        {currentStep >= PIPELINE_STEPS.length - 2 && (
          <p style={{ marginTop: "24px", fontSize: "13px", color: MUTED, animation: "fadeIn 0.5s ease" }}>Almost there — finalizing your documents...</p>
        )}
      </div>
    </div>
  );

  // ===== RESULTS =====
  if (screen === "results" && results) {
    const r = results;
    const recColor = r.recommendation === "strong_apply" ? SUCCESS : r.recommendation === "apply_with_strategy" ? WARNING : DANGER;
    const s = slug(r.company, r.role);

    return (
      <div style={base}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <Ghost size={24} color={ACCENT} /><span style={{ fontSize: "14px", fontWeight: 600, color: MUTED }}>GhostResume.ai</span>
              </div>
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>{r.role}</h1>
              <p style={{ margin: "4px 0 0", color: MUTED, fontSize: "14px" }}>{r.company} · {r.location}</p>
            </div>
            <button onClick={resetAll} style={{ padding: "10px 20px", border: `1px solid ${BORDER}`, borderRadius: "8px", background: CARD, color: TEXT, fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>New Application</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "32px" }}>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>ATS Score</div>
              <GradeCircle score={r.ats_score || 0} />
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>Viability</div>
              <GradeCircle score={r.viability_score || 0} />
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "24px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px", textAlign: "center" }}>Assessment</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: recColor }} />
                <span style={{ fontSize: "14px", fontWeight: 600, color: recColor }}>{(r.recommendation || "").replace(/_/g, " ").toUpperCase()}</span>
              </div>
              <p style={{ fontSize: "13px", color: MUTED, textAlign: "center", margin: "0 0 12px", lineHeight: 1.5 }}>{r.ceo_pain}</p>
              <div>
                {(r.red_flags || []).slice(0, 2).map((f, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: DANGER, marginBottom: "4px" }}><AlertTriangle size={12} /> {f.flag}</div>))}
                {(r.green_flags || []).slice(0, 2).map((f, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: SUCCESS, marginBottom: "4px" }}><CheckCircle size={12} /> {f.flag}</div>))}
              </div>
            </div>
          </div>

          {/* Voice Print */}
          {r.voice_print && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "16px 20px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: voiceMode === "professional" ? ACCENT : "#c084fc", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {voiceMode === "professional" ? "Professional Tone" : "Voice Print"}
                </div>
                <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: voiceMode === "professional" ? ACCENT_DIM : "rgba(192,132,252,0.1)", color: voiceMode === "professional" ? ACCENT : "#c084fc" }}>
                  {voiceMode === "professional" ? "OVERRIDE" : "MATCHED"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { label: r.voice_print.sentence_style, icon: "✏️" },
                  { label: r.voice_print.formality, icon: "🎯" },
                  { label: r.voice_print.vocabulary_level, icon: "📚" },
                  { label: `leads with ${r.voice_print.leads_with}`, icon: "→" },
                ].map((v, i) => (
                  <span key={i} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "20px", background: voiceMode === "professional" ? ACCENT_DIM : "rgba(192,132,252,0.1)", color: voiceMode === "professional" ? ACCENT : "#c084fc", fontWeight: 500 }}>
                    {v.icon} {v.label}
                  </span>
                ))}
              </div>
              {r.voice_print.personality_notes && (
                <p style={{ fontSize: "12px", color: MUTED, margin: 0, fontStyle: "italic", flex: "1 1 100%" }}>
                  {r.voice_print.personality_notes}
                </p>
              )}
            </div>
          )}

          <div style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: "24px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <TabButton active={activeTab === "resume"} onClick={() => setActiveTab("resume")}><FileText size={14} style={{marginRight:6,verticalAlign:"middle"}} />Resume</TabButton>
            <TabButton active={activeTab === "cover"} onClick={() => setActiveTab("cover")}><MessageSquare size={14} style={{marginRight:6,verticalAlign:"middle"}} />Cover Letter</TabButton>
            <TabButton active={activeTab === "interview"} onClick={() => setActiveTab("interview")}><BookOpen size={14} style={{marginRight:6,verticalAlign:"middle"}} />Interview Prep</TabButton>
            <TabButton active={activeTab === "gaps"} onClick={() => setActiveTab("gaps")}><Target size={14} style={{marginRight:6,verticalAlign:"middle"}} />Gap Report</TabButton>
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "0 12px 12px 12px", padding: "28px" }}>

            {activeTab === "resume" && r.tailored_resume && (() => {
              const enriched = getEnrichedResume();
              const hasAdditions = addedBullets.length > 0 || addedSkills.length > 0;
              return (<div>
              {hasAdditions && (<div style={{ background: "rgba(34,197,94,0.08)", border: `1px solid rgba(34,197,94,0.2)`, borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "12px", color: SUCCESS }}>
                ✓ {addedBullets.length} bullet{addedBullets.length !== 1 ? "s" : ""} and {addedSkills.length} skill{addedSkills.length !== 1 ? "s" : ""} added from Gap Report
              </div>)}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                {uploadFormat === "txt" ? (
                  <DlBtn onClick={() => dlText(fmtResume({ ...r, tailored_resume: enriched }), `Resume_${s}.txt`)}>Download as TXT</DlBtn>
                ) : (
                  <>
                    <DlBtn onClick={() => downloadDocument("resume", uploadFormat, enriched, r.company, r.role, r.contact)}>
                      Download as {uploadFormat.toUpperCase()}
                    </DlBtn>
                    <DlBtn onClick={() => downloadDocument("resume", uploadFormat === "pdf" ? "docx" : "pdf", enriched, r.company, r.role, r.contact)}>
                      Also as {uploadFormat === "pdf" ? "DOCX" : "PDF"}
                    </DlBtn>
                  </>
                )}
              </div>
              <div style={{ background: BG, borderRadius: "8px", padding: "24px", border: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: TEXT, margin: "0 0 20px", fontStyle: "italic" }}>{enriched.summary}</p>
                {(enriched.sections || []).map((sec, si) => (<div key={si} style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "12px" }}>{sec.name}</h3>
                  {(sec.entries || []).map((en, ei) => (<div key={ei} style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600 }}>{en.title}{en.company ? ` — ${en.company}` : ""}</span>
                      <span style={{ fontSize: "12px", color: MUTED }}>{en.dates}</span>
                    </div>
                    {(en.bullets || []).map((b, bi) => {
                      const isAdded = addedBullets.some(ab => ab.bullet === b);
                      return (
                        <div key={bi} style={{ display: "flex", gap: "8px", marginBottom: "4px", fontSize: "13px", color: "#c4c4cc", lineHeight: 1.6 }}>
                          <span style={{ color: isAdded ? SUCCESS : ACCENT, flexShrink: 0 }}>•</span>
                          <span>{b}{isAdded && <span style={{ fontSize: "10px", color: SUCCESS, marginLeft: "6px", fontWeight: 600 }}>ADDED</span>}</span>
                        </div>
                      );
                    })}
                  </div>))}
                </div>))}
                {enriched.skills && (<div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "10px" }}>Skills</h3>
                  <p style={{ fontSize: "13px", color: "#c4c4cc", lineHeight: 1.8 }}>
                    {(enriched.skills || []).map((sk, ski) => {
                      const isAdded = addedSkills.includes(sk);
                      return <span key={ski} style={{ color: isAdded ? SUCCESS : "#c4c4cc", fontWeight: isAdded ? 600 : 400 }}>{sk}{ski < enriched.skills.length - 1 ? "  ·  " : ""}</span>;
                    })}
                  </p>
                </div>)}
                {enriched.education && enriched.education.length > 0 && (<div style={{ marginTop: "16px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "10px" }}>Education</h3>
                  {enriched.education.map((edu, edi) => (
                    <div key={edi} style={{ marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: TEXT }}>{edu.degree || ""}</span>
                      <span style={{ fontSize: "13px", color: "#c4c4cc" }}> — {edu.institution || ""}</span>
                      {edu.dates && <span style={{ fontSize: "12px", color: MUTED, marginLeft: "8px" }}>{edu.dates}</span>}
                    </div>
                  ))}
                </div>)}
              </div>
            </div>);})()}

            {activeTab === "cover" && r.cover_letter && (<div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                {uploadFormat === "txt" ? (
                  <DlBtn onClick={() => dlText(r.cover_letter.full_text || "", `CoverLetter_${s}.txt`)}>Download as TXT</DlBtn>
                ) : (
                  <>
                    <DlBtn onClick={() => downloadDocument("cover_letter", uploadFormat, r.cover_letter, r.company, r.role, r.contact)}>
                      Download as {uploadFormat.toUpperCase()}
                    </DlBtn>
                    <DlBtn onClick={() => downloadDocument("cover_letter", uploadFormat === "pdf" ? "docx" : "pdf", r.cover_letter, r.company, r.role, r.contact)}>
                      Also as {uploadFormat === "pdf" ? "DOCX" : "PDF"}
                    </DlBtn>
                  </>
                )}
              </div>
              {r.cover_letter.original_first_line && (<div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: DANGER, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Original opening (replaced)</div>
                <p style={{ fontSize: "13px", color: MUTED, margin: 0, textDecoration: "line-through" }}>{r.cover_letter.original_first_line}</p>
              </div>)}
              {r.cover_letter.hook_line && (<div style={{ background: ACCENT_DIM, border: "1px solid rgba(0,212,255,0.2)", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Company-Situation Hook</div>
                <p style={{ fontSize: "15px", fontWeight: 600, color: TEXT, margin: 0 }}>{r.cover_letter.hook_line}</p>
              </div>)}
              <div style={{ background: BG, borderRadius: "8px", padding: "24px", border: `1px solid ${BORDER}`, whiteSpace: "pre-wrap", fontSize: "14px", lineHeight: 1.8, color: "#c4c4cc" }}>{r.cover_letter.full_text}</div>
            </div>)}

            {activeTab === "interview" && r.interview_prep && (<div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                <DlBtn onClick={() => dlText(fmtPrep(r.interview_prep, r.company, r.role), `InterviewPrep_${s}.txt`)}>Download Interview Prep</DlBtn>
              </div>
              {r.interview_prep.two_min_pitch && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "8px" }}>Your 2-Minute Pitch</h3>
                <div style={{ background: BG, borderRadius: "8px", padding: "16px", border: `1px solid ${BORDER}`, fontSize: "14px", lineHeight: 1.7, color: "#c4c4cc" }}>{r.interview_prep.two_min_pitch}</div>
              </div>)}
              {(r.interview_prep.gap_questions || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Gap Questions</h3>
                {r.interview_prep.gap_questions.map((gq, i) => (<div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: WARNING, margin: "0 0 6px" }}>Q: {gq.question}</p>
                  <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{gq.answer}</p>
                </div>))}
              </div>)}
              {(r.interview_prep.behavioral_stars || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Behavioral STAR Stories</h3>
                {r.interview_prep.behavioral_stars.map((bs, i) => (<div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 8px" }}>Q: {bs.question}</p>
                  <div style={{ fontSize: "12px", color: "#c4c4cc", lineHeight: 1.6 }}>
                    <p style={{margin:"0 0 4px"}}><span style={{color:ACCENT,fontWeight:600}}>S:</span> {bs.situation}</p>
                    <p style={{margin:"0 0 4px"}}><span style={{color:ACCENT,fontWeight:600}}>T:</span> {bs.task}</p>
                    <p style={{margin:"0 0 4px"}}><span style={{color:ACCENT,fontWeight:600}}>A:</span> {bs.action}</p>
                    <p style={{margin:0}}><span style={{color:ACCENT,fontWeight:600}}>R:</span> {bs.result}</p>
                  </div>
                </div>))}
              </div>)}
              {(r.interview_prep.technical_questions || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Technical Questions</h3>
                {r.interview_prep.technical_questions.map((tq, i) => (<div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 6px" }}>Q: {tq.question}</p>
                  <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{tq.answer}</p>
                </div>))}
              </div>)}
              {(r.interview_prep.questions_to_ask || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Questions to Ask Them</h3>
                {r.interview_prep.questions_to_ask.map((qa, i) => (<div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 4px" }}>{qa.question}</p>
                  <p style={{ fontSize: "12px", color: SUCCESS, margin: 0 }}>Why: {qa.why}</p>
                </div>))}
              </div>)}
              {r.interview_prep.salary && (<div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Salary Negotiation</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  {[{l:"Floor",v:r.interview_prep.salary.floor,c:DANGER},{l:"Target",v:r.interview_prep.salary.target,c:WARNING},{l:"Stretch",v:r.interview_prep.salary.stretch,c:SUCCESS}].map((x, i) => (
                    <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: x.c, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>{x.l}</div>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>)}
            </div>)}

            {activeTab === "gaps" && r.gap_report && (<div>
              {(r.gap_report.advantages || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: SUCCESS, marginBottom: "12px" }}>Your Advantages</h3>
                {r.gap_report.advantages.map((a, i) => (<div key={i} style={{ background: "rgba(34,197,94,0.06)", borderRadius: "8px", padding: "14px", border: "1px solid rgba(34,197,94,0.15)", marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: SUCCESS, margin: "0 0 4px" }}>{a.strength}</p>
                  <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0 }}>{a.pitch}</p>
                </div>))}
              </div>)}
              {(r.gap_report.critical_gaps || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: WARNING, marginBottom: "6px" }}>Gaps to Address</h3>
                <p style={{ fontSize: "12px", color: MUTED, marginBottom: "12px" }}>Tap any gap to add experience, translate existing skills, or start a discovery questionnaire.</p>
                {r.gap_report.critical_gaps.map((g, i) => (<button key={i}
                  onClick={() => setGapModal({ gap: g.gap, strategy: g.strategy, mode: "choose" })}
                  style={{ width: "100%", textAlign: "left", background: "rgba(245,158,11,0.06)", borderRadius: "8px", padding: "14px", border: "1px solid rgba(245,158,11,0.15)", marginBottom: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(245,158,11,0.12)"}
                  onMouseOut={e => e.currentTarget.style.background = "rgba(245,158,11,0.06)"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: WARNING, margin: "0 0 4px" }}>{g.gap}</p>
                      <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0 }}>{g.strategy}</p>
                    </div>
                    <span style={{ fontSize: "11px", color: WARNING, fontWeight: 600, whiteSpace: "nowrap" }}>Tap to address →</span>
                  </div>
                </button>))}
              </div>)}
              {(r.gap_report.gap_closers || []).length > 0 && (<div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Gap Closer Actions</h3>
                {r.gap_report.gap_closers.map((gc, i) => (<div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", background: ACCENT_DIM, color: ACCENT, whiteSpace: "nowrap", flexShrink: 0 }}>{gc.tier}</span>
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 4px" }}>{gc.gap}</p>
                    <p style={{ fontSize: "13px", color: "#c4c4cc", margin: "0 0 2px" }}>{gc.action}</p>
                    <p style={{ fontSize: "11px", color: MUTED, margin: 0 }}>Time: {gc.time}</p>
                  </div>
                </div>))}
              </div>)}

              {/* SKILL TRANSLATOR — Optional */}
              {(r.gap_report.skill_translations || []).length > 0 && (<div style={{ borderTop: `1px dashed ${BORDER}`, paddingTop: "20px", marginTop: "8px" }}>
                <button onClick={() => setShowSkillTranslator(!showSkillTranslator)} style={{
                  width: "100%", padding: "12px 16px", background: "rgba(245,158,11,0.06)",
                  border: `1px solid rgba(245,158,11,0.2)`, borderRadius: "8px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontFamily: "'DM Sans', sans-serif", color: TEXT, fontSize: "14px", fontWeight: 600,
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: WARNING }}>⚖</span>
                    Skill Translator <span style={{ fontSize: "11px", color: MUTED, fontWeight: 400 }}>({r.gap_report.skill_translations.length} translations available)</span>
                  </span>
                  <span style={{ color: MUTED, fontSize: "12px" }}>{showSkillTranslator ? "Hide ▲" : "Show ▼"}</span>
                </button>

                {showSkillTranslator && (<div style={{ marginTop: "16px" }}>
                  <div style={{ background: "rgba(245,158,11,0.04)", border: `1px solid rgba(245,158,11,0.15)`, borderRadius: "8px", padding: "14px", marginBottom: "16px", fontSize: "12px", color: "#c4c4cc", lineHeight: 1.6 }}>
                    <p style={{ margin: "0 0 8px", fontWeight: 600, color: WARNING }}>How to use this ethically:</p>
                    <p style={{ margin: 0 }}>
                      These translations reframe real activities into professional language — you did the thing, we're just describing it in terms a recruiter understands. Use these in a "Personal Projects" section or in interview conversations. <strong>Never invent job titles or paid employment that didn't exist.</strong> The context_note shows where each translation honestly belongs.
                    </p>
                  </div>
                  {r.gap_report.skill_translations.map((st, i) => (<div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>What You Did</div>
                      <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0 }}>{st.source_activity}</p>
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Professional Translation</div>
                      <p style={{ fontSize: "13px", color: TEXT, margin: 0, fontWeight: 500 }}>{st.professional_translation}</p>
                    </div>
                    {st.skills_demonstrated && st.skills_demonstrated.length > 0 && (<div style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: SUCCESS, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Skills Demonstrated <span style={{ color: MUTED, fontWeight: 400, fontSize: "10px" }}>(tap to add to resume)</span></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {st.skills_demonstrated.map((s, si) => {
                          const added = addedSkills.includes(s);
                          return (
                            <button key={si}
                              onClick={() => {
                                if (added) setAddedSkills(addedSkills.filter(x => x !== s));
                                else setAddedSkills([...addedSkills, s]);
                              }}
                              style={{
                                fontSize: "11px", padding: "3px 8px", borderRadius: "4px",
                                background: added ? SUCCESS : "rgba(34,197,94,0.1)",
                                color: added ? "#000" : SUCCESS,
                                fontWeight: added ? 700 : 500, cursor: "pointer",
                                border: "none", fontFamily: "'DM Sans', sans-serif",
                              }}>
                              {added ? "✓ " : "+ "}{s}
                            </button>
                          );
                        })}
                      </div>
                    </div>)}
                    <div style={{ marginBottom: "10px" }}>
                      <button onClick={() => {
                        const bullet = st.professional_translation;
                        const alreadyAdded = addedBullets.some(b => b.bullet === bullet);
                        if (alreadyAdded) {
                          setAddedBullets(addedBullets.filter(b => b.bullet !== bullet));
                        } else {
                          setAddedBullets([...addedBullets, { bullet, section: "Additional Experience", source: "skill_translator" }]);
                        }
                      }} style={{
                        fontSize: "12px", padding: "6px 12px", borderRadius: "6px",
                        border: `1px solid ${ACCENT}`, background: addedBullets.some(b => b.bullet === st.professional_translation) ? ACCENT : "transparent",
                        color: addedBullets.some(b => b.bullet === st.professional_translation) ? "#000" : ACCENT,
                        fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {addedBullets.some(b => b.bullet === st.professional_translation) ? "✓ Added to Resume" : "+ Add Bullet to Resume"}
                      </button>
                    </div>
                    {st.context_note && (<div style={{ background: "rgba(113,113,122,0.1)", borderLeft: `2px solid ${MUTED}`, padding: "8px 12px", borderRadius: "0 4px 4px 0" }}>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "2px" }}>Context</div>
                      <p style={{ fontSize: "12px", color: MUTED, margin: 0, fontStyle: "italic" }}>{st.context_note}</p>
                    </div>)}
                  </div>))}
                </div>)}
              </div>)}
            </div>)}

          </div>
        </div>

        {/* OUTCOME REPORTING */}
        <div style={{ maxWidth: "900px", margin: "24px auto 0", padding: "0 24px" }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "20px 24px" }}>
            {outcomeReported ? (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: SUCCESS, fontWeight: 600, margin: 0 }}>Thanks for reporting back — this helps everyone.</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 4px", color: TEXT }}>After you apply, let us know what happened</p>
                <p style={{ fontSize: "12px", color: MUTED, margin: "0 0 14px" }}>This helps us improve the tool and show real results to other users.</p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { label: "Got an Interview", value: "got_interview", color: SUCCESS },
                    { label: "Got an Offer", value: "got_offer", color: ACCENT },
                    { label: "Rejected", value: "rejected", color: DANGER },
                    { label: "No Response", value: "no_response", color: MUTED },
                  ].map((o, i) => (
                    <button key={i} onClick={async () => {
                      try {
                        await fetch(`${API_BASE}/api/report-outcome`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ session_id: r.session_id || "", company: r.company, role: r.role, outcome: o.value }),
                        });
                        setOutcomeReported(true);
                      } catch (e) { setOutcomeReported(true); }
                    }} style={{
                      padding: "8px 16px", border: `1px solid ${o.color}30`, borderRadius: "6px",
                      background: `${o.color}10`, color: o.color, fontSize: "12px", fontWeight: 600,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}>{o.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* GAP MODAL */}
        {gapModal && <GapModal
          gapModal={gapModal}
          setGapModal={setGapModal}
          vault={r.vault || {}}
          role={r.role || ""}
          company={r.company || ""}
          onAddBullet={(bullet, section) => {
            setAddedBullets(prev => [...prev, { bullet, section: section || "Additional Experience", source: "gap_closer" }]);
          }}
          onAddSkill={(skill) => {
            setAddedSkills(prev => prev.includes(skill) ? prev : [...prev, skill]);
          }}
        />}
      </div>
    );
  }
  return null;
}

// ============================================================
// GAP MODAL COMPONENT
// ============================================================
function GapModal({ gapModal, setGapModal, vault, role, company, onAddBullet, onAddSkill }) {
  const { gap, strategy, mode } = gapModal;
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [addManualBullet, setAddManualBullet] = useState("");
  const [addManualSection, setAddManualSection] = useState("Professional Experience");
  const [qConversation, setQConversation] = useState([]);
  const [qCurrent, setQCurrent] = useState(null);
  const [qAnswer, setQAnswer] = useState("");
  const [qResult, setQResult] = useState(null);

  const close = () => setGapModal(null);
  const setMode = (m) => setGapModal({ ...gapModal, mode: m });

  const runTranslate = async () => {
    setLoading(true);
    try {
      const res = await apiGapTranslate(gap, strategy, vault, role, company);
      setTranslations(res.translations || []);
      setQResult({ can_be_bridged: res.can_be_bridged, reasoning: res.reasoning });
    } catch (err) {
      alert("Failed: " + err.message);
    }
    setLoading(false);
  };

  const startQuestionnaire = async () => {
    setLoading(true);
    try {
      const res = await apiQuestionnaireStart(gap, strategy, role, company);
      setQCurrent(res);
      setQConversation([]);
    } catch (err) {
      alert("Failed: " + err.message);
    }
    setLoading(false);
  };

  const submitAnswer = async () => {
    if (!qAnswer.trim()) return;
    const newConv = [...qConversation, { question: qCurrent.question, answer: qAnswer }];
    setQConversation(newConv);
    setQAnswer("");
    setLoading(true);
    try {
      const res = await apiQuestionnaireContinue(gap, role, company, newConv, newConv.length);
      if (res.action === "ask_question") {
        setQCurrent(res);
      } else {
        setQCurrent(null);
        setQResult(res);
        setTranslations(res.translations || []);
      }
    } catch (err) {
      alert("Failed: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div onClick={close} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: "20px", overflow: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px",
        padding: "28px", maxWidth: "640px", width: "100%", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Addressing Gap</p>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: WARNING, margin: 0 }}>{gap}</h3>
          </div>
          <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: "4px" }}><X size={20} /></button>
        </div>

        {/* MODE: CHOOSE */}
        {mode === "choose" && (
          <div>
            <p style={{ fontSize: "13px", color: "#c4c4cc", marginBottom: "20px", lineHeight: 1.6 }}>
              How do you want to address this gap? Choose the option that matches your actual situation.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <ChoiceButton onClick={() => setMode("manual")} icon="✍" title="I actually have this experience" subtitle="Type it out — I'll add it to the right resume section" />
              <ChoiceButton onClick={() => { setMode("translate"); runTranslate(); }} icon="🔄" title="Translate from my existing skills" subtitle="AI looks at your vault for real experience that maps to this gap" />
              <ChoiceButton onClick={() => { setMode("questionnaire"); startQuestionnaire(); }} icon="💬" title="Start a discovery questionnaire" subtitle="Lawyer-style interview — AI asks questions to surface real experience" />
            </div>
          </div>
        )}

        {/* MODE: MANUAL */}
        {mode === "manual" && (
          <div>
            <button onClick={() => setMode("choose")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: "12px", marginBottom: "12px", padding: 0 }}>← Back</button>
            <p style={{ fontSize: "13px", color: "#c4c4cc", marginBottom: "16px", lineHeight: 1.6 }}>
              Describe this experience in your own words. Use concrete details and numbers when possible.
            </p>
            <label style={{ fontSize: "11px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>Your bullet point</label>
            <textarea value={addManualBullet} onChange={e => setAddManualBullet(e.target.value)}
              placeholder="e.g. Led weekly sales meetings that resulted in 15% revenue increase..."
              style={{ width: "100%", minHeight: "100px", padding: "12px", background: BG, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: "12px" }} />
            <label style={{ fontSize: "11px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>Section to add to</label>
            <select value={addManualSection} onChange={e => setAddManualSection(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", background: BG, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, fontSize: "13px", outline: "none", marginBottom: "16px" }}>
              <option>Professional Experience</option>
              <option>Projects</option>
              <option>Additional Experience</option>
              <option>Skills</option>
            </select>
            <button onClick={() => {
              if (!addManualBullet.trim()) return;
              onAddBullet(addManualBullet.trim(), addManualSection);
              close();
            }} style={{ width: "100%", padding: "12px", border: "none", borderRadius: "8px", background: ACCENT, color: "#000", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Add to Resume</button>
          </div>
        )}

        {/* MODE: TRANSLATE */}
        {mode === "translate" && (
          <div>
            <button onClick={() => setMode("choose")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: "12px", marginBottom: "12px", padding: 0 }}>← Back</button>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <Loader2 size={24} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />
                <p style={{ fontSize: "13px", color: MUTED, marginTop: "12px" }}>Analyzing your vault for relevant experience...</p>
              </div>
            ) : (
              <div>
                {qResult && !qResult.can_be_bridged && translations.length === 0 && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.2)`, borderRadius: "8px", padding: "14px", marginBottom: "12px" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: DANGER, margin: "0 0 6px" }}>No honest bridge found</p>
                    <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{qResult.reasoning}</p>
                  </div>
                )}
                {translations.map((t, i) => (
                  <TranslationCard key={i} t={t} onAdd={() => { onAddBullet(t.translated_bullet, t.section_to_add_to); close(); }} />
                ))}
                {!translations.length && !qResult && (
                  <p style={{ fontSize: "13px", color: MUTED }}>No results yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODE: QUESTIONNAIRE */}
        {mode === "questionnaire" && (
          <div>
            <button onClick={() => setMode("choose")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: "12px", marginBottom: "12px", padding: 0 }}>← Back</button>
            <p style={{ fontSize: "12px", color: MUTED, marginBottom: "16px", lineHeight: 1.6, fontStyle: "italic" }}>
              Answer honestly — I'll use only what you tell me. If the answers don't reveal real experience, I'll tell you so rather than fake it.
            </p>

            {/* Past conversation */}
            {qConversation.map((qa, i) => (
              <div key={i} style={{ marginBottom: "14px", paddingBottom: "14px", borderBottom: `1px dashed ${BORDER}` }}>
                <p style={{ fontSize: "12px", fontWeight: 600, color: ACCENT, margin: "0 0 4px" }}>Q{i + 1}: {qa.question}</p>
                <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{qa.answer}</p>
              </div>
            ))}

            {loading && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Loader2 size={20} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />
                <p style={{ fontSize: "12px", color: MUTED, marginTop: "8px" }}>Thinking...</p>
              </div>
            )}

            {/* Current question */}
            {!loading && qCurrent && (
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: TEXT, marginBottom: "12px" }}>Q{qConversation.length + 1}: {qCurrent.question}</p>
                {qCurrent.purpose && <p style={{ fontSize: "11px", color: MUTED, fontStyle: "italic", marginBottom: "10px" }}>({qCurrent.purpose})</p>}
                <textarea value={qAnswer} onChange={e => setQAnswer(e.target.value)}
                  placeholder="Your answer..."
                  style={{ width: "100%", minHeight: "90px", padding: "12px", background: BG, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: "10px" }} />
                <button onClick={submitAnswer} disabled={!qAnswer.trim()} style={{ width: "100%", padding: "10px", border: "none", borderRadius: "8px", background: qAnswer.trim() ? ACCENT : BORDER, color: qAnswer.trim() ? "#000" : MUTED, fontSize: "13px", fontWeight: 700, cursor: qAnswer.trim() ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif" }}>Submit Answer</button>
              </div>
            )}

            {/* Result */}
            {!loading && !qCurrent && qResult && (
              <div>
                {qResult.can_be_bridged ? (
                  <div>
                    <div style={{ background: "rgba(34,197,94,0.08)", border: `1px solid rgba(34,197,94,0.2)`, borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: SUCCESS, margin: "0 0 6px" }}>Real experience found</p>
                      <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{qResult.assessment}</p>
                    </div>
                    {translations.map((t, i) => (
                      <TranslationCard key={i} t={t} onAdd={() => { onAddBullet(t.translated_bullet, t.section_to_add_to); close(); }} />
                    ))}
                  </div>
                ) : (
                  <div>
                    <div style={{ background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.2)`, borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: DANGER, margin: "0 0 6px" }}>This gap can't be bridged honestly</p>
                      <p style={{ fontSize: "13px", color: "#c4c4cc", margin: "0 0 10px", lineHeight: 1.6 }}>{qResult.assessment}</p>
                      {qResult.recommendation && <p style={{ fontSize: "13px", color: TEXT, margin: 0, lineHeight: 1.6 }}><strong style={{ color: ACCENT }}>Recommendation:</strong> {qResult.recommendation}</p>}
                    </div>
                    <button onClick={close} style={{ width: "100%", padding: "10px", border: `1px solid ${BORDER}`, borderRadius: "8px", background: "transparent", color: TEXT, fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceButton({ onClick, icon, title, subtitle }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "14px 16px", background: BG, border: `1px solid ${BORDER}`,
      borderRadius: "8px", cursor: "pointer", textAlign: "left",
      fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
      display: "flex", gap: "12px", alignItems: "center",
    }}
    onMouseOver={e => e.currentTarget.style.borderColor = ACCENT}
    onMouseOut={e => e.currentTarget.style.borderColor = BORDER}>
      <span style={{ fontSize: "22px" }}>{icon}</span>
      <div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: TEXT, margin: "0 0 2px" }}>{title}</p>
        <p style={{ fontSize: "12px", color: MUTED, margin: 0, lineHeight: 1.4 }}>{subtitle}</p>
      </div>
    </button>
  );
}

function TranslationCard({ t, onAdd }) {
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "14px", marginBottom: "10px" }}>
      <div style={{ marginBottom: "10px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Source</p>
        <p style={{ fontSize: "12px", color: "#c4c4cc", margin: 0, lineHeight: 1.5 }}>{t.source_activity}</p>
      </div>
      <div style={{ marginBottom: "10px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Resume Bullet</p>
        <p style={{ fontSize: "13px", color: TEXT, margin: 0, fontWeight: 500, lineHeight: 1.5 }}>{t.translated_bullet}</p>
      </div>
      {t.context_note && (
        <div style={{ background: "rgba(113,113,122,0.1)", borderLeft: `2px solid ${MUTED}`, padding: "6px 10px", marginBottom: "10px", borderRadius: "0 4px 4px 0" }}>
          <p style={{ fontSize: "11px", color: MUTED, margin: 0, fontStyle: "italic", lineHeight: 1.4 }}>{t.context_note}</p>
        </div>
      )}
      <button onClick={onAdd} style={{ width: "100%", padding: "8px", border: `1px solid ${ACCENT}`, borderRadius: "6px", background: "transparent", color: ACCENT, fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          + Add to {t.section_to_add_to || "Resume"}
      </button>
    </div>
  );
}
