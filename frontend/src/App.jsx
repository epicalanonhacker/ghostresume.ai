import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, Link, Zap, Download, ChevronRight, Ghost, Shield, Target, MessageSquare, BookOpen, AlertTriangle, CheckCircle, Loader2, X, Eye } from "lucide-react";

const ACCENT = "#00d4ff";
const ACCENT_DIM = "rgba(0,212,255,0.15)";
const BG = "#08080f";
const CARD = "#101018";
const CARD_HOVER = "#16161f";
const BORDER = "#1e1e2e";
const TEXT = "#e4e4e7";
const MUTED = "#71717a";
const SUCCESS = "#22c55e";
const WARNING = "#f59e0b";
const DANGER = "#ef4444";

const PIPELINE_STEPS = [
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

const API_BASE = "https://ghostresumeai-production.up.railway.app";

async function uploadResume(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload-resume`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

async function runBackendPipeline(resumeText, jobInput) {
  const isUrl = jobInput.trim().startsWith("http");
  const res = await fetch(`${API_BASE}/api/run-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume_text: resumeText,
      job_input: jobInput.trim(),
      job_is_url: isUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Pipeline failed");
  }
  return res.json();
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatResumeText(r, company, role) {
  const res = r.tailored_resume;
  if (!res) return "";
  const lines = [];
  const contact = r.contact || {};
  lines.push(contact.name || "");
  lines.push([contact.location, contact.email, contact.phone, contact.linkedin].filter(Boolean).join(" | "));
  lines.push("");
  lines.push("=".repeat(60));
  lines.push("PROFESSIONAL SUMMARY");
  lines.push("=".repeat(60));
  lines.push(res.summary || "");
  lines.push("");
  for (const section of (res.sections || [])) {
    lines.push("=".repeat(60));
    lines.push((section.name || "").toUpperCase());
    lines.push("=".repeat(60));
    for (const entry of (section.entries || [])) {
      lines.push("");
      lines.push(`${entry.title || ""}${entry.company ? " — " + entry.company : ""}${entry.dates ? "  |  " + entry.dates : ""}`);
      for (const bullet of (entry.bullets || [])) {
        lines.push(`  • ${bullet}`);
      }
    }
    lines.push("");
  }
  if (res.skills && res.skills.length) {
    lines.push("=".repeat(60));
    lines.push("SKILLS");
    lines.push("=".repeat(60));
    lines.push(res.skills.join("  |  "));
  }
  return lines.join("\n");
}

function formatInterviewPrepText(prep, company, role) {
  if (!prep) return "";
  const lines = [];
  lines.push(`INTERVIEW PREP — ${role} at ${company}`);
  lines.push("=".repeat(60));
  lines.push("");
  if (prep.two_min_pitch) {
    lines.push("YOUR 2-MINUTE PITCH");
    lines.push("-".repeat(40));
    lines.push(prep.two_min_pitch);
    lines.push("");
  }
  if (prep.gap_questions?.length) {
    lines.push("GAP QUESTIONS");
    lines.push("-".repeat(40));
    for (const gq of prep.gap_questions) {
      lines.push(`Q: ${gq.question}`);
      lines.push(`A: ${gq.answer}`);
      lines.push("");
    }
  }
  if (prep.behavioral_stars?.length) {
    lines.push("BEHAVIORAL STAR STORIES");
    lines.push("-".repeat(40));
    for (const bs of prep.behavioral_stars) {
      lines.push(`Q: ${bs.question}`);
      lines.push(`  S: ${bs.situation}`);
      lines.push(`  T: ${bs.task}`);
      lines.push(`  A: ${bs.action}`);
      lines.push(`  R: ${bs.result}`);
      lines.push("");
    }
  }
  if (prep.technical_questions?.length) {
    lines.push("TECHNICAL QUESTIONS");
    lines.push("-".repeat(40));
    for (const tq of prep.technical_questions) {
      lines.push(`Q: ${tq.question}`);
      lines.push(`A: ${tq.answer}`);
      lines.push("");
    }
  }
  if (prep.questions_to_ask?.length) {
    lines.push("QUESTIONS TO ASK THEM");
    lines.push("-".repeat(40));
    for (const qa of prep.questions_to_ask) {
      lines.push(`Q: ${qa.question}`);
      lines.push(`   Why: ${qa.why}`);
      lines.push("");
    }
  }
  if (prep.salary) {
    lines.push("SALARY NEGOTIATION");
    lines.push("-".repeat(40));
    lines.push(`Floor: ${prep.salary.floor}`);
    lines.push(`Target: ${prep.salary.target}`);
    lines.push(`Stretch: ${prep.salary.stretch}`);
  }
  return lines.join("\n");
}

export default function GhostResumeApp() {
  const [screen, setScreen] = useState("upload");
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [jobInput, setJobInput] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("resume");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const fileRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setResumeFileName(file.name);
    setResumeFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setResumeText(e.target.result);
    if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      reader.readAsText(file);
    } else {
      reader.readAsText(file, "utf-8");
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const runPipeline = async () => {
    if (!resumeText && !resumeFile) { setError("Drop your resume first."); return; }
    if (!jobInput.trim()) { setError("Paste a job posting URL or text."); return; }
    setError("");
    setScreen("processing");
    setCurrentStep(0);
    setElapsed(0);

    let stepInterval;
    let timerInterval;
    try {
      stepInterval = setInterval(() => {
        setCurrentStep(prev => Math.min(prev + 1, PIPELINE_STEPS.length - 1));
      }, 3000);
      timerInterval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);

      // Step 1: If we have a file (PDF/DOCX), upload it to extract text
      let finalResumeText = resumeText;
      if (resumeFile && (resumeFile.name.endsWith(".pdf") || resumeFile.name.endsWith(".docx") || resumeFile.name.endsWith(".doc"))) {
        const uploadResult = await uploadResume(resumeFile);
        finalResumeText = uploadResult.text;
      }

      // Step 2: Run the full pipeline via backend
      const parsed = await runBackendPipeline(finalResumeText, jobInput);

      clearInterval(stepInterval);
      clearInterval(timerInterval);
      setResults(parsed);
      setCurrentStep(PIPELINE_STEPS.length);
      setTimeout(() => setScreen("results"), 800);
    } catch (err) {
      if (stepInterval) clearInterval(stepInterval);
      if (timerInterval) clearInterval(timerInterval);
      setError(`Pipeline error: ${err.message}`);
      setScreen("upload");
    }
  };

  // Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  const baseStyle = {
    fontFamily: "'DM Sans', sans-serif",
    background: BG,
    color: TEXT,
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
  };

  // ===== UPLOAD SCREEN =====
  if (screen === "upload") {
    return (
      <div style={baseStyle}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: "-200px", left: "50%", transform: "translateX(-50%)",
          width: "600px", height: "600px", borderRadius: "50%",
          background: `radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)`,
          pointerEvents: "none"
        }} />

        <div style={{ maxWidth: "680px", margin: "0 auto", padding: "60px 24px", position: "relative" }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <Ghost size={36} color={ACCENT} strokeWidth={1.5} />
              <h1 style={{ margin: 0, fontSize: "32px", fontWeight: 800, letterSpacing: "-1px" }}>
                Ghost<span style={{ color: ACCENT }}>Resume</span><span style={{ color: MUTED, fontWeight: 300 }}>.ai</span>
              </h1>
            </div>
            <p style={{ color: MUTED, fontSize: "16px", margin: 0, lineHeight: 1.6 }}>
              We reverse-engineer what the recruiter wants to see.<br/>
              Then we make your resume say exactly that.
            </p>
          </div>

          {/* Resume Upload */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: MUTED, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Your Resume
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? ACCENT : BORDER}`,
                borderRadius: "12px", padding: "40px 24px", textAlign: "center",
                cursor: "pointer", transition: "all 0.3s",
                background: dragOver ? ACCENT_DIM : CARD,
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              {resumeFileName ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                  <FileText size={24} color={SUCCESS} />
                  <span style={{ fontSize: "15px", fontWeight: 500 }}>{resumeFileName}</span>
                  <button onClick={(e) => { e.stopPropagation(); setResumeFileName(""); setResumeText(""); setResumeFile(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
                    <X size={16} color={MUTED} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={32} color={MUTED} style={{ marginBottom: "12px" }} />
                  <p style={{ margin: 0, color: MUTED, fontSize: "14px" }}>
                    Drag & drop your resume here, or <span style={{ color: ACCENT }}>browse</span>
                  </p>
                  <p style={{ margin: "8px 0 0", color: MUTED, fontSize: "12px", opacity: 0.6 }}>
                    PDF, DOCX, or TXT
                  </p>
                </>
              )}
            </div>
            {/* Or paste text */}
            {!resumeFileName && (
              <details style={{ marginTop: "12px" }}>
                <summary style={{ fontSize: "13px", color: MUTED, cursor: "pointer" }}>
                  Or paste your resume text
                </summary>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume content here..."
                  style={{
                    width: "100%", minHeight: "160px", marginTop: "8px", padding: "14px",
                    background: CARD, border: `1px solid ${BORDER}`, borderRadius: "8px",
                    color: TEXT, fontFamily: "'Space Mono', monospace", fontSize: "12px",
                    resize: "vertical", outline: "none", boxSizing: "border-box",
                  }}
                />
              </details>
            )}
          </div>

          {/* Job Posting Input */}
          <div style={{ marginBottom: "32px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: MUTED, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Job Posting
            </label>
            <div style={{ position: "relative" }}>
              <Link size={16} color={MUTED} style={{ position: "absolute", left: "14px", top: "15px" }} />
              <input
                value={jobInput}
                onChange={(e) => setJobInput(e.target.value)}
                placeholder="Paste job posting URL or text..."
                style={{
                  width: "100%", padding: "14px 14px 14px 40px",
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: "8px",
                  color: TEXT, fontFamily: "'DM Sans', sans-serif", fontSize: "14px",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            {/* Or paste full text */}
            {!jobInput.startsWith("http") && (
              <details style={{ marginTop: "8px" }} open={jobInput.length > 0 && !jobInput.startsWith("http")}>
                <summary style={{ fontSize: "13px", color: MUTED, cursor: "pointer" }}>
                  Or paste the full job description
                </summary>
                <textarea
                  value={jobInput}
                  onChange={(e) => setJobInput(e.target.value)}
                  placeholder="Paste the full job description here..."
                  style={{
                    width: "100%", minHeight: "140px", marginTop: "8px", padding: "14px",
                    background: CARD, border: `1px solid ${BORDER}`, borderRadius: "8px",
                    color: TEXT, fontFamily: "'Space Mono', monospace", fontSize: "12px",
                    resize: "vertical", outline: "none", boxSizing: "border-box",
                  }}
                />
              </details>
            )}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: `1px solid ${DANGER}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: DANGER }}>
              {error}
            </div>
          )}

          {/* Launch Button */}
          <button onClick={runPipeline} style={{
            width: "100%", padding: "16px", border: "none", borderRadius: "10px",
            background: `linear-gradient(135deg, ${ACCENT}, #0099cc)`,
            color: "#000", fontSize: "16px", fontWeight: 700, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px",
            boxShadow: `0 0 30px rgba(0,212,255,0.2)`,
            transition: "all 0.3s",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Zap size={18} /> Tailor My Resume
            </span>
          </button>

          {/* How it works */}
          <div style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            {[
              { icon: <Ghost size={20} />, title: "Ghost Resume", desc: "We build the ideal candidate first" },
              { icon: <Target size={20} />, title: "Reality Map", desc: "Your real experience, reframed" },
              { icon: <Shield size={20} />, title: "ATS Optimized", desc: "Keyword-matched to beat the bots" },
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
  }

  // ===== PROCESSING SCREEN =====
  if (screen === "processing") {
    return (
      <div style={{ ...baseStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "500px", height: "500px", borderRadius: "50%",
          background: `radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)`,
          pointerEvents: "none",
          animation: "pulse 3s ease-in-out infinite",
        }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { to { transform: rotate(360deg); } }`}
        </style>

        <div style={{ textAlign: "center", position: "relative", padding: "24px" }}>
          <Ghost size={48} color={ACCENT} strokeWidth={1.5} style={{ marginBottom: "24px", opacity: 0.8 }} />
          <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700 }}>Building your ghost resume...</h2>
          <p style={{ margin: "0 0 8px", color: MUTED, fontSize: "14px" }}>This typically takes 30–60 seconds</p>
          <p style={{ margin: "0 0 40px", fontFamily: "'Space Mono', monospace", fontSize: "20px", color: ACCENT, fontWeight: 700 }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </p>

          <div style={{ maxWidth: "400px", margin: "0 auto", textAlign: "left" }}>
            {PIPELINE_STEPS.map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px",
                  borderRadius: "8px", marginBottom: "4px",
                  background: active ? ACCENT_DIM : "transparent",
                  opacity: done ? 0.5 : active ? 1 : 0.25,
                  transition: "all 0.4s",
                  animation: active ? "fadeIn 0.4s ease" : "none",
                }}>
                  <span style={{ fontSize: "18px", width: "28px", textAlign: "center" }}>
                    {done ? "✓" : step.icon}
                  </span>
                  <span style={{ fontSize: "14px", fontWeight: active ? 600 : 400, color: done ? MUTED : active ? TEXT : MUTED }}>
                    {step.label}
                  </span>
                  {active && <Loader2 size={14} color={ACCENT} style={{ marginLeft: "auto", animation: "spin 1s linear infinite" }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ===== RESULTS SCREEN =====
  if (screen === "results" && results) {
    const r = results;
    const recColor = r.recommendation === "strong_apply" ? SUCCESS : r.recommendation === "apply_with_strategy" ? WARNING : DANGER;

    return (
      <div style={baseStyle}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <Ghost size={24} color={ACCENT} />
                <span style={{ fontSize: "14px", fontWeight: 600, color: MUTED }}>GhostResume.ai</span>
              </div>
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>{r.role}</h1>
              <p style={{ margin: "4px 0 0", color: MUTED, fontSize: "14px" }}>{r.company} · {r.location}</p>
            </div>
            <button onClick={() => { setScreen("upload"); setResults(null); setResumeText(""); setResumeFileName(""); setResumeFile(null); setJobInput(""); }}
              style={{
                padding: "10px 20px", border: `1px solid ${BORDER}`, borderRadius: "8px",
                background: CARD, color: TEXT, fontSize: "13px", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif"
              }}>
              New Application
            </button>
          </div>

          {/* Score Cards */}
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
                <span style={{ fontSize: "14px", fontWeight: 600, color: recColor }}>
                  {(r.recommendation || "").replace(/_/g, " ").toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: "13px", color: MUTED, textAlign: "center", margin: "0 0 12px", lineHeight: 1.5 }}>
                {r.ceo_pain}
              </p>
              <div>
                {(r.red_flags || []).slice(0, 2).map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: DANGER, marginBottom: "4px" }}>
                    <AlertTriangle size={12} /> {f.flag}
                  </div>
                ))}
                {(r.green_flags || []).slice(0, 2).map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: SUCCESS, marginBottom: "4px" }}>
                    <CheckCircle size={12} /> {f.flag}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: "24px", display: "flex", gap: "4px" }}>
            <TabButton active={activeTab === "resume"} onClick={() => setActiveTab("resume")}><FileText size={14} style={{marginRight:6, verticalAlign:"middle"}} />Resume</TabButton>
            <TabButton active={activeTab === "cover"} onClick={() => setActiveTab("cover")}><MessageSquare size={14} style={{marginRight:6, verticalAlign:"middle"}} />Cover Letter</TabButton>
            <TabButton active={activeTab === "interview"} onClick={() => setActiveTab("interview")}><BookOpen size={14} style={{marginRight:6, verticalAlign:"middle"}} />Interview Prep</TabButton>
            <TabButton active={activeTab === "gaps"} onClick={() => setActiveTab("gaps")}><Target size={14} style={{marginRight:6, verticalAlign:"middle"}} />Gap Report</TabButton>
          </div>

          {/* Tab Content */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "0 12px 12px 12px", padding: "28px" }}>

            {/* RESUME TAB */}
            {activeTab === "resume" && r.tailored_resume && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                  <button onClick={() => downloadFile(formatResumeText(r, r.company, r.role), `Resume_${(r.company||"").replace(/\s/g,"_")}_${(r.role||"").replace(/\s/g,"_")}.txt`)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: CARD, color: ACCENT, fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    <Download size={14} /> Download Resume
                  </button>
                </div>
                <div style={{ background: BG, borderRadius: "8px", padding: "24px", border: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: "14px", lineHeight: 1.7, color: TEXT, margin: "0 0 20px", fontStyle: "italic" }}>
                    {r.tailored_resume.summary}
                  </p>
                  {(r.tailored_resume.sections || []).map((section, si) => (
                    <div key={si} style={{ marginBottom: "20px" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "12px" }}>
                        {section.name}
                      </h3>
                      {(section.entries || []).map((entry, ei) => (
                        <div key={ei} style={{ marginBottom: "16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                            <span style={{ fontSize: "14px", fontWeight: 600 }}>{entry.title}{entry.company ? ` — ${entry.company}` : ""}</span>
                            <span style={{ fontSize: "12px", color: MUTED }}>{entry.dates}</span>
                          </div>
                          {(entry.bullets || []).map((b, bi) => (
                            <div key={bi} style={{ display: "flex", gap: "8px", marginBottom: "4px", fontSize: "13px", color: "#c4c4cc", lineHeight: 1.6 }}>
                              <span style={{ color: ACCENT, flexShrink: 0 }}>•</span>
                              <span>{b}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                  {r.tailored_resume.skills && (
                    <div>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: "6px", marginBottom: "10px" }}>Skills</h3>
                      <p style={{ fontSize: "13px", color: "#c4c4cc", lineHeight: 1.8 }}>
                        {(r.tailored_resume.skills || []).join("  ·  ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* COVER LETTER TAB */}
            {activeTab === "cover" && r.cover_letter && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                  <button onClick={() => downloadFile(r.cover_letter.full_text || "", `CoverLetter_${(r.company||"").replace(/\s/g,"_")}_${(r.role||"").replace(/\s/g,"_")}.txt`)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: CARD, color: ACCENT, fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    <Download size={14} /> Download Cover Letter
                  </button>
                </div>
                {r.cover_letter.original_first_line && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.2)`, borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: DANGER, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Original opening (replaced)</div>
                    <p style={{ fontSize: "13px", color: MUTED, margin: 0, textDecoration: "line-through" }}>{r.cover_letter.original_first_line}</p>
                  </div>
                )}
                {r.cover_letter.hook_line && (
                  <div style={{ background: ACCENT_DIM, border: `1px solid rgba(0,212,255,0.2)`, borderRadius: "8px", padding: "12px 16px", marginBottom: "20px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Hook Line</div>
                    <p style={{ fontSize: "15px", fontWeight: 600, color: TEXT, margin: 0 }}>{r.cover_letter.hook_line}</p>
                  </div>
                )}
                <div style={{ background: BG, borderRadius: "8px", padding: "24px", border: `1px solid ${BORDER}`, whiteSpace: "pre-wrap", fontSize: "14px", lineHeight: 1.8, color: "#c4c4cc" }}>
                  {r.cover_letter.full_text}
                </div>
              </div>
            )}

            {/* INTERVIEW PREP TAB */}
            {activeTab === "interview" && r.interview_prep && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                  <button onClick={() => downloadFile(formatInterviewPrepText(r.interview_prep, r.company, r.role), `InterviewPrep_${(r.company||"").replace(/\s/g,"_")}_${(r.role||"").replace(/\s/g,"_")}.txt`)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: CARD, color: ACCENT, fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    <Download size={14} /> Download Interview Prep
                  </button>
                </div>
                {r.interview_prep.two_min_pitch && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "8px" }}>Your 2-Minute Pitch</h3>
                    <div style={{ background: BG, borderRadius: "8px", padding: "16px", border: `1px solid ${BORDER}`, fontSize: "14px", lineHeight: 1.7, color: "#c4c4cc" }}>
                      {r.interview_prep.two_min_pitch}
                    </div>
                  </div>
                )}
                {(r.interview_prep.gap_questions || []).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Gap Questions (Where They'll Probe)</h3>
                    {r.interview_prep.gap_questions.map((gq, i) => (
                      <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: WARNING, margin: "0 0 6px" }}>Q: {gq.question}</p>
                        <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{gq.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
                {(r.interview_prep.behavioral_stars || []).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Behavioral STAR Stories</h3>
                    {r.interview_prep.behavioral_stars.map((bs, i) => (
                      <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 8px" }}>Q: {bs.question}</p>
                        <div style={{ fontSize: "12px", color: "#c4c4cc", lineHeight: 1.6 }}>
                          <p style={{margin: "0 0 4px"}}><span style={{color: ACCENT, fontWeight: 600}}>S:</span> {bs.situation}</p>
                          <p style={{margin: "0 0 4px"}}><span style={{color: ACCENT, fontWeight: 600}}>T:</span> {bs.task}</p>
                          <p style={{margin: "0 0 4px"}}><span style={{color: ACCENT, fontWeight: 600}}>A:</span> {bs.action}</p>
                          <p style={{margin: 0}}><span style={{color: ACCENT, fontWeight: 600}}>R:</span> {bs.result}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(r.interview_prep.technical_questions || []).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Technical Questions</h3>
                    {r.interview_prep.technical_questions.map((tq, i) => (
                      <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 6px" }}>Q: {tq.question}</p>
                        <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0, lineHeight: 1.6 }}>{tq.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
                {(r.interview_prep.questions_to_ask || []).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Questions to Ask Them</h3>
                    {r.interview_prep.questions_to_ask.map((qa, i) => (
                      <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 4px" }}>{qa.question}</p>
                        <p style={{ fontSize: "12px", color: SUCCESS, margin: 0 }}>Why this impresses: {qa.why}</p>
                      </div>
                    ))}
                  </div>
                )}
                {r.interview_prep.salary && (
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Salary Negotiation</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                      {[
                        { label: "Floor", value: r.interview_prep.salary.floor, color: DANGER },
                        { label: "Target", value: r.interview_prep.salary.target, color: WARNING },
                        { label: "Stretch", value: r.interview_prep.salary.stretch, color: SUCCESS },
                      ].map((s, i) => (
                        <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, textAlign: "center" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: s.color, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>{s.label}</div>
                          <div style={{ fontSize: "14px", fontWeight: 600 }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GAP REPORT TAB */}
            {activeTab === "gaps" && r.gap_report && (
              <div>
                {(r.gap_report.advantages || []).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: SUCCESS, marginBottom: "12px" }}>Your Advantages (Differentiators)</h3>
                    {r.gap_report.advantages.map((a, i) => (
                      <div key={i} style={{ background: "rgba(34,197,94,0.06)", borderRadius: "8px", padding: "14px", border: `1px solid rgba(34,197,94,0.15)`, marginBottom: "8px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: SUCCESS, margin: "0 0 4px" }}>{a.strength}</p>
                        <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0 }}>{a.pitch}</p>
                      </div>
                    ))}
                  </div>
                )}
                {(r.gap_report.critical_gaps || []).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: WARNING, marginBottom: "12px" }}>Gaps to Address</h3>
                    {r.gap_report.critical_gaps.map((g, i) => (
                      <div key={i} style={{ background: "rgba(245,158,11,0.06)", borderRadius: "8px", padding: "14px", border: `1px solid rgba(245,158,11,0.15)`, marginBottom: "8px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: WARNING, margin: "0 0 4px" }}>{g.gap}</p>
                        <p style={{ fontSize: "13px", color: "#c4c4cc", margin: 0 }}>{g.strategy}</p>
                      </div>
                    ))}
                  </div>
                )}
                {(r.gap_report.gap_closers || []).length > 0 && (
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: ACCENT, marginBottom: "12px" }}>Gap Closer Actions</h3>
                    {r.gap_report.gap_closers.map((gc, i) => (
                      <div key={i} style={{ background: BG, borderRadius: "8px", padding: "14px", border: `1px solid ${BORDER}`, marginBottom: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                        <span style={{
                          fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px",
                          background: ACCENT_DIM, color: ACCENT, whiteSpace: "nowrap", flexShrink: 0
                        }}>{gc.tier}</span>
                        <div>
                          <p style={{ fontSize: "13px", fontWeight: 600, color: TEXT, margin: "0 0 4px" }}>{gc.gap}</p>
                          <p style={{ fontSize: "13px", color: "#c4c4cc", margin: "0 0 2px" }}>{gc.action}</p>
                          <p style={{ fontSize: "11px", color: MUTED, margin: 0 }}>Time: {gc.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
