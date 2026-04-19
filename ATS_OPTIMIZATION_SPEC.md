# ATS Optimization Engine — Implementation Spec for GhostResume.ai

## Mission

Integrate a full ATS optimization engine into the existing GhostResume.ai pipeline so that ATS-readiness is structural — baked into the Ghost generation itself — not a post-processing step. The output should beat keyword-matching ATS systems AND pass human recruiter pattern detection for AI-generated content.

---

## Architecture Overview

The ATS engine consists of 5 modules that plug into the existing Ghost Resume pipeline:

```
Job Posting Input
       ↓
[1] Keyword Extractor & Classifier
       ↓
[2] Semantic Cluster Engine
       ↓
[3] Ghost Generator (MODIFIED — now ATS-native)
       ↓
[4] Reality Mapper (MODIFIED — preserves ATS structure)
       ↓
[5] Phantom Score (ATS scoring + human-readability audit)
       ↓
Tailored Resume Output
```

---

## Module 1: Keyword Extractor & Classifier

### Purpose
Parse the job posting and extract every meaningful keyword, then classify each by importance tier. This replaces any flat keyword list approach.

### Input
- Raw job posting text (already parsed in existing Step 1)

### Logic

**Extraction Rules:**
- Pull all technical skills, tools, frameworks, languages, methodologies, certifications
- Pull soft skill phrases ("cross-functional collaboration", "stakeholder management")
- Pull domain-specific terminology ("CI/CD", "microservices", "agile ceremonies")
- Pull action verbs the posting uses repeatedly ("architect", "lead", "optimize")
- Ignore generic filler ("team player", "fast-paced environment") — these are noise, not keywords

**Classification Tiers (map to existing Step 1 requirement tiers):**

| Tier | Definition | Target Frequency in Resume |
|------|-----------|---------------------------|
| **Dealbreaker** | Explicitly required, auto-reject without it | 3-4 mentions (summary + skills + 2 bullets) |
| **Strong Signal** | Mentioned 2+ times or in prominent position | 2-3 mentions (skills + 1-2 bullets) |
| **Bonus** | "Preferred", "nice to have", listed at end | 1 mention (skills section only) |
| **Contextual** | Industry/domain terms not explicitly required but signal fluency | 1 mention woven naturally into a bullet |

**Frequency Rules:**
- Dealbreaker keywords appear in: Professional Summary, Key Skills section, and at least 2 experience bullet points
- Strong Signal keywords appear in: Key Skills section and at least 1 experience bullet point
- Bonus keywords appear in: Key Skills section only
- No keyword appears more than 4 times total across the entire resume
- Keywords are NEVER repeated in the same section

### Output
```json
{
  "keywords": [
    {
      "term": "React",
      "tier": "dealbreaker",
      "frequency_target": 4,
      "posting_mentions": 5,
      "semantic_cluster_id": "frontend_frameworks",
      "placement": ["summary", "skills", "bullet", "bullet"]
    },
    {
      "term": "TypeScript",
      "tier": "strong_signal",
      "frequency_target": 2,
      "posting_mentions": 3,
      "semantic_cluster_id": "frontend_languages",
      "placement": ["skills", "bullet"]
    }
  ]
}
```

### Implementation Notes
- Use the Claude API call that already powers Ghost generation to do extraction
- Add a system prompt section that instructs the model to classify by tier
- Store the keyword map as a JSON object that gets passed to all downstream modules

---

## Module 2: Semantic Cluster Engine

### Purpose
Group related keywords so the resume demonstrates depth, not just keyword matches. Modern ATS (Workday, Greenhouse, Lever, iCIMS) increasingly use semantic matching, not just exact strings.

### Logic

When a job posting says "CI/CD pipelines", the resume should also naturally surface related terms like "automated deployment", "GitHub Actions", "continuous integration", "Jenkins", "infrastructure as code" — but ONLY if the candidate has real experience with them (checked against the resume vault).

**Cluster Construction:**
- For each Dealbreaker and Strong Signal keyword, generate a cluster of 3-5 semantically related terms
- Cross-reference each cluster term against the user's resume vault
- Only include cluster terms the user actually has experience with
- Cluster terms get woven into bullet context, not listed as standalone skills

**Example Cluster:**
```json
{
  "cluster_id": "cicd_pipeline",
  "primary_keyword": "CI/CD",
  "tier": "dealbreaker",
  "related_terms": [
    {"term": "GitHub Actions", "in_vault": true},
    {"term": "automated deployment", "in_vault": true},
    {"term": "continuous integration", "in_vault": true},
    {"term": "Jenkins", "in_vault": false},
    {"term": "infrastructure as code", "in_vault": false}
  ]
}
```

### Implementation Notes
- This runs as part of the existing Claude API call during Ghost generation
- Add to the system prompt: "For each dealbreaker keyword, identify 3-5 semantically related terms that a strong candidate would naturally reference"
- The cluster map feeds into both the Ghost Generator and Reality Mapper

---

## Module 3: Ghost Generator (Modified)

### Purpose
The Ghost resume is already the ideal candidate. This modification ensures the Ghost is constructed as an ATS-native document from the start — not optimized after the fact.

### Modifications to Existing Ghost Generation (Step 4)

**Current behavior:** Ghost is generated as an ideal resume, then ATS is scored separately in Step 10.

**New behavior:** Ghost generation prompt includes explicit ATS structural rules:

**Professional Summary Rules:**
- 3-4 sentences max
- First sentence contains the candidate's title + years of experience + 2 Dealbreaker keywords
- Second sentence contains 1-2 Strong Signal keywords in context of an achievement
- Third sentence contains a domain-specific accomplishment with a metric
- No buzzwords without substance ("passionate", "results-driven", "innovative")
- Example structure: "[Title] with [X] years of experience in [Dealbreaker 1] and [Dealbreaker 2]. [Achievement using Strong Signal keyword with metric]. [Domain-specific value statement]."

**Key Skills Section Rules:**
- Mirror the EXACT language from the job posting (not synonyms)
- Order skills by tier: Dealbreakers first, Strong Signals second, Bonus last
- Group into logical categories if 8+ skills (e.g., "Languages", "Frameworks", "Tools")
- Format as comma-separated within categories, NOT bullet points (ATS parses this more reliably)
- No skill appears here that isn't backed by vault experience

**Experience Bullet Point Rules (CAR Method — Challenge, Action, Result):**
- Lead with a strong action verb, NOT a keyword mini-title
- The keyword is embedded WITHIN the action clause, not prefixed before it
- Each bullet follows: [Action verb] + [keyword in context] + [specific metric]
- Metrics follow the believability hierarchy (see Module 5)
- No dashes (—, –, -) at the start of bullets — use proper bullet formatting only
- No colons after bolded keywords — this is an AI pattern flag
- Vary sentence structure across bullets — not every bullet should follow identical syntax

**BAD bullet (AI-detectable pattern):**
```
**React Development:** Built and maintained 15+ React components, improving load time by 40%
```

**GOOD bullet (human-passing, ATS-optimized):**
```
Architected a React component library serving 15 internal teams, reducing page load times from 3.2s to 1.1s
```

**Formatting Rules (ATS-Safe):**
- No tables, columns, or multi-column layouts
- No headers/footers with critical info (ATS often skips these)
- No images, icons, or graphical elements
- Section headers use standard labels: "Professional Summary", "Experience", "Key Skills", "Education", "Certifications"
- Dates in MM/YYYY format, right-aligned
- Company name and job title on the same line or clearly associated
- No special characters beyond standard ASCII (no em dashes, smart quotes, or unicode)

### Implementation Notes
- Modify the Ghost generation system prompt to include all rules above
- Pass the keyword map from Module 1 and cluster map from Module 2 into the prompt
- The Ghost output should include keyword placement annotations so the Reality Mapper knows which keywords are in which positions

---

## Module 4: Reality Mapper (Modified)

### Purpose
Map real experience onto the Ghost structure while preserving ATS optimization. This is the existing Step 5, modified to maintain keyword integrity during substitution.

### Modifications

**Keyword Preservation Check:**
When swapping Ghost content for real vault content, verify:
1. Every Dealbreaker keyword still appears at its target frequency
2. No keyword was lost during the swap
3. If a swap removes a keyword, the system flags it and suggests where to reinsert it
4. Semantic cluster terms from Module 2 are woven into bullet context where the vault supports them

**Voice Print Preservation:**
- The existing voice print extraction (Step 1.5) still applies
- BUT: voice print cannot override ATS keyword placement
- If the candidate's natural voice would drop a critical keyword, the keyword wins and the voice adapts around it

**Anti-AI Detection Rules:**
These rules apply during reality mapping to ensure the output passes human review:

1. **No dash-prefixed bullets** — use proper list formatting only
2. **No keyword:description pattern** — no bolded keyword followed by colon
3. **Vary bullet length** — mix of 1-line and 2-line bullets, not uniform
4. **Vary sentence starters** — no more than 2 bullets in a row starting with the same verb tense
5. **No "leveraged", "utilized", "spearheaded"** — these are AI-flagged verbs. Use: built, shipped, cut, grew, ran, led, designed, launched, automated, migrated, reduced, created
6. **Include one "imperfect" detail per section** — a challenge faced, a constraint worked around, a creative workaround. Perfect resumes read as fabricated.
7. **Numbers should be specific, not round** — "143 customers" not "150+ customers", "$2.3M" not "$2M+", "12 minutes" not "15 minutes"

### Implementation Notes
- Add a post-mapping validation step that checks keyword frequency against targets
- If any Dealbreaker keyword is below target frequency, trigger an auto-fix that suggests specific insertion points
- Output a diff showing what changed from Ghost to Reality-mapped version

---

## Module 5: Phantom Score

### Purpose
Score the final tailored resume on both ATS match quality and human-readability. This replaces the existing Step 10 with a more comprehensive scoring system.

### Scoring Dimensions

**1. Keyword Match Score (0-100)**
```
For each keyword in the map:
  - Present at target frequency = full points
  - Present but below target = partial points
  - Missing entirely = 0 points
  
  Weight by tier:
  - Dealbreaker keywords: 3x weight
  - Strong Signal keywords: 2x weight
  - Bonus keywords: 1x weight
  
  Score = (weighted points earned / weighted points possible) * 100
```

**2. Semantic Depth Score (0-100)**
```
For each semantic cluster:
  - Primary keyword present = 40 points
  - 1+ related terms present naturally = 30 points
  - Related terms backed by vault experience = 30 points
  
  Score = average across all clusters
```

**3. Metric Believability Score (0-100)**
Classify every metric in the resume:

| Metric Type | Believability Tier | Points |
|-------------|-------------------|--------|
| Dollar amounts ($2.3M revenue) | Tier 1 — Most believable | 100 |
| Time savings (reduced from 4hrs to 12min) | Tier 1 | 100 |
| Specific counts (143 customers, 12 microservices) | Tier 1 | 100 |
| User/customer scale (serving 50K DAU) | Tier 2 | 80 |
| Team/org scale (led 8-person team) | Tier 2 | 80 |
| Percentages with context (reduced errors 34% by implementing X) | Tier 3 | 60 |
| Naked percentages without context (improved efficiency 30%) | Tier 4 — Least believable | 30 |
| No metric at all | Tier 5 — Flag for rewrite | 0 |

```
Score = average tier score across all bullets
Flag any Tier 4-5 bullets for rewrite suggestions
```

**4. AI Detection Risk Score (0-100, higher = more human-passing)**
Check for these patterns and deduct points:

| Pattern | Deduction |
|---------|-----------|
| Keyword:description bullet format | -15 per instance |
| Dash-prefixed bullets | -10 per instance |
| "Leveraged/utilized/spearheaded" | -5 per instance |
| 3+ bullets with identical structure | -10 |
| All metrics are round numbers | -10 |
| Every bullet same length (±5 words) | -10 |
| No imperfect/challenge details anywhere | -5 |
| Em dashes or smart quotes in text | -5 per instance |

```
Score = 100 - total deductions (floor at 0)
```

**5. Composite Phantom Score**
```
Phantom Score = (
  Keyword Match * 0.35 +
  Semantic Depth * 0.20 +
  Metric Believability * 0.20 +
  AI Detection Risk * 0.25
)
```

**Score Interpretation:**
- 90-100: Ghost-tier — submit with confidence
- 75-89: Strong — minor tweaks suggested
- 60-74: Needs work — specific fixes listed
- Below 60: Major gaps — consider if role is viable

### Output Format
```json
{
  "phantom_score": 87,
  "breakdown": {
    "keyword_match": 92,
    "semantic_depth": 85,
    "metric_believability": 78,
    "ai_detection_risk": 90
  },
  "flags": [
    {
      "type": "metric_weak",
      "location": "Experience bullet 3, Role 1",
      "current": "Improved deployment speed by 40%",
      "suggestion": "Reduced deployment time from 45 minutes to 12 minutes by automating the CI/CD pipeline with GitHub Actions"
    },
    {
      "type": "keyword_below_target",
      "keyword": "TypeScript",
      "target_frequency": 2,
      "current_frequency": 1,
      "suggestion": "Add TypeScript context to Experience bullet 2 where you describe the frontend rebuild"
    }
  ],
  "auto_fixes_available": true
}
```

### Implementation Notes
- Phantom Score runs as a final validation step after reality mapping
- If score is below 75, trigger automatic fix suggestions
- If score is below 60, flag the role as potentially not viable (feeds into existing Gap Report)
- Display the score breakdown in the frontend with visual indicators
- Store scores historically so the user can see which roles they're strongest for

---

## Integration Points with Existing Pipeline

### Where each module plugs in:

| Existing Step | Module Integration |
|--------------|-------------------|
| Step 1: Parse Job Posting | → Module 1 (Keyword Extractor) runs here |
| Step 1 (continued) | → Module 2 (Semantic Clusters) runs here |
| Step 4: Generate Ghost | → Module 3 (ATS-native Ghost) replaces this |
| Step 5: Reality Mapping | → Module 4 (keyword-preserving mapping) replaces this |
| Step 10: ATS Score | → Module 5 (Phantom Score) replaces this |

### New API Endpoints (if applicable)

If the backend exposes these as separate endpoints:

```
POST /api/extract-keywords
  Input: { job_posting_text: string }
  Output: { keywords: KeywordMap[], clusters: SemanticCluster[] }

POST /api/phantom-score
  Input: { resume_text: string, keyword_map: KeywordMap[] }
  Output: { phantom_score: number, breakdown: ScoreBreakdown, flags: Flag[] }
```

Or these can remain internal functions called within the existing `/api/generate-resume` pipeline.

---

## Frontend Changes

### Phantom Score Display
- After resume generation, show the Phantom Score prominently
- Use a circular gauge or progress bar with color coding (green 90+, yellow 75-89, orange 60-74, red below 60)
- Expandable breakdown showing all 4 sub-scores
- Clickable flags that highlight the specific resume section needing attention

### Keyword Map Visualization (Optional / Future)
- Show which keywords were found, their tier, and where they were placed
- Visual diff between "keywords needed" and "keywords placed"
- Toggle to see the semantic clusters

---

## Anti-Patterns to Avoid

These are things the system should NEVER do:

1. **Never stuff keywords into a "Keywords" section at the bottom** — this is a 2015 tactic that modern ATS and recruiters both penalize
2. **Never use white-text hidden keywords** — ATS systems detect and penalize this
3. **Never repeat the exact same phrase** — "managed cross-functional teams" appearing 4 times is keyword stuffing
4. **Never use keyword mini-titles** — "React: Built components" is an AI pattern that recruiters flag
5. **Never use identical bullet structure across all entries** — vary the CAR pattern (some bullets can lead with result, some with challenge)
6. **Never use em dashes, en dashes, or smart quotes in the output** — use standard hyphens and straight quotes only
7. **Never generate metrics the vault doesn't support** — reframe yes, fabricate never

---

## Testing Checklist

Before shipping, validate against these scenarios:

- [ ] Job posting with 20+ required skills (tests keyword prioritization)
- [ ] Job posting with vague requirements (tests semantic clustering)
- [ ] Role where user has 80%+ match (should score 85+)
- [ ] Role where user has 40% match (should flag as low viability)
- [ ] Resume output passes Jobscan ATS check at 80%+ match
- [ ] Resume output does NOT trigger common AI detection patterns
- [ ] All metrics in output trace back to vault entries
- [ ] Keyword frequency matches tier targets within ±1
- [ ] No keyword appears more than 4 times total
- [ ] Professional summary contains at least 2 Dealbreaker keywords
- [ ] Key Skills section mirrors job posting language exactly
- [ ] No dashes, colons-after-bold, or uniform bullet structures in output

---

## Summary

This spec transforms ATS optimization from a post-processing checklist into the structural DNA of the Ghost Resume itself. The Ghost is born ATS-native. The Reality Mapper preserves that structure. The Phantom Score validates it. The result is a resume that ranks high in ATS systems while passing human review as authentically written.

The competitive moat: no other resume tool generates an ideal candidate first, then reverse-engineers the real person into that shape while scoring across 4 dimensions. That's the Ghost Resume methodology — this spec just makes sure ATS optimization is inseparable from it.
