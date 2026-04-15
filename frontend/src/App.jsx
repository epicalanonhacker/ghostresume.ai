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

async function runBackendPipeline(resumeText, jobInput, jobIsUrl) {
  const res = await fetch(`${API_BASE}/api/run-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText, job_input: jobInput, job_is_url: jobIsUrl }),
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
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("resume");
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
      const parsed = await runBackendPipeline(txt, jobInput, hasUrl);

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
          {[{ icon: <Ghost size={20} />, title: "Ghost Resume", desc: "We build the ideal candidate first" },
            { icon: <Target size={20} />, title: "Reality Map", desc: "Your real experience, reframed" },
            { icon: <Shield size={20} />, title: "ATS Optimized", desc: "Keyword-matched to beat the bots" }
          ].map((item, i) => (
            <div key={i} style={{ padding: "20px 16px", background: CARD, borderRadius: "10px", border: `1px solid ${BORDER}`, textAlign: "center" }}>
              <div style={{ color: ACCENT, marginBottom: "8px", display: "flex", justifyContent: "center" }}>{item.icon}</div>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>{item.title}</div>
              <div style={{ fontSize: "12px", color: MUTED }}>{item.desc}</div>
            </div>
          ))}
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
        <p style={{ margin: "0 0 8px", color: MUTED, fontSize: "14px" }}>This typically takes 30–60 seconds</p>
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

          <div style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: "24px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <TabButton active={activeTab === "resume"} onClick={() => setActiveTab("resume")}><FileText size={14} style={{marginRight:6,verticalAlign:"middle"}} />Resume</TabButton>
            <TabButton active={activeTab === "cover"} onClick={() => setActiveTab("cover")}><MessageSquare size={14} style={{marginRight:6,verticalAlign:"middle"}} />Cover Letter</TabButton>
            <TabButton active={activeTab === "interview"} onClick={() => setActiveTab("interview")}><BookOpen size={14} style={{marginRight:6,verticalAlign:"middle"}} />Interview Prep</TabButton>
            <TabButton active={activeTab === "gaps"} onClick={() => setActiveTab("gaps")}><Target size={14} style={{marginRight:6,verticalAlign:"middle"}} />Gap Report</TabButton>
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "0 12px 12px 12px", padding: "28px" }}>

            {activeTab === "resume" && r.tailored_resume && (<div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                {uploadFormat === "txt" ? (
                  <DlBtn onClick={() => dlText(fmtResume(r), `Resume_${s}.txt`)}>Download as TXT</DlBtn>
                ) : (
                  <>
                    <DlBtn onClick={() => downloadDocument("resume", uploadFormat, r.tailored_resume, r.company, r.role, r.contact)}>
                      Download as {uploadFormat.toUpperCase()}
                    </DlBtn>
                    <DlBtn onClick={() => downloadDocument("resume", uploadFormat === "pdf" ? "docx" : "pdf", r.tailored_resume, r.company, r.role, r.contact)}>
                      Also as {uploadFormat === "pdf" ? "DOCX" : "PDF"}
                    </DlBtn>
                  </>
                )}
              </div>
              <div style={{ background: BG, borderRadius: "8px", padding: "24px", border: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: TEXT, margin: "0 0 20px", fontStyle: "italic" }}>{r.tailored_resume.summary}</p>
                {(r.tailored_resume.sections || []).map((sec, si) => (<div key={si} style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "12px" }}>{sec.name}</h3>
                  {(sec.entries || []).map((en, ei) => (<div key={ei} style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600 }}>{en.title}{en.company ? ` — ${en.company}` : ""}</span>
                      <span style={{ fontSize: "12px", color: MUTED }}>{en.dates}</span>
                    </div>
                    {(en.bullets || []).map((b, bi) => (<div key={bi} style={{ display: "flex", gap: "8px", marginBottom: "4px", fontSize: "13px", color: "#c4c4cc", lineHeight: 1.6 }}><span style={{ color: ACCENT, flexShrink: 0 }}>•</span><span>{b}</span></div>))}
                  </div>))}
                </div>))}
                {r.tailored_resume.skills && (<div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "10px" }}>Skills</h3>
                  <p style={{ fontSize: "13px", color: "#c4c4cc", lineHeight: 1.8 }}>{(r.tailored_resume.skills || []).join("  ·  ")}</p>
                </div>)}
              </div>
            </div>)}

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
                <div style={{ fontSize: "11px", fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Hook Line</div>
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
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: WARNING, marginBottom: "12px" }}>Gaps to Address</h3>
                {r.gap_report.critical_gaps.map((g, i) => (<div key={i} style={{ background: "rgba(245,158,11,0.06)", borderRadius: "8px", padding: "14px", border: "1px solid rgba(245,158,11,0.15)", marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: WARNING, margin: "0 0 4px" }}>{g.gap}</p>
                  <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0 }}>{g.strategy}</p>
                </div>))}
              </div>)}
              {(r.gap_report.gap_closers || []).length > 0 && (<div>
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
            </div>)}

          </div>
        </div>
      </div>
    );
  }
  return null;
}
