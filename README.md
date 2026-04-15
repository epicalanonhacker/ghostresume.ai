# GhostResume.ai

**We reverse-engineer what the recruiter wants to see. Then we make your resume say exactly that.**

A full-stack web app that uses the "Ghost Resume" methodology to tailor resumes for any job posting. Upload your resume, paste a job link, get a tailored resume + cover letter + interview prep in under 60 seconds.

## How It Works

1. **Upload** your resume (PDF, DOCX, or paste text)
2. **Paste** a job posting URL or text
3. **GhostResume** runs a 13-step pipeline:
   - Parses the job posting and classifies requirements by priority
   - Analyzes the CEO's pain — WHY they're hiring
   - Researches the company via Perplexity (recent news, funding, culture)
   - Generates a "ghost resume" — the ideal candidate for this specific role
   - Maps your real experience onto the ghost's structure
   - Scores your ATS keyword match
   - Writes a cover letter with a hook-first opening line
   - Generates a full interview prep package
4. **Download** your tailored resume, cover letter, and interview battle plan

## Architecture

```
ghostresume/
├── backend/              # FastAPI production API
│   ├── main.py           # API endpoints + pipeline
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/             # React app (deploy to Vercel)
│   └── ghostresume.jsx   # Full app component
└── railway.toml          # Railway deployment config
```

## Quick Start (Local Development)

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
python main.py
# Server runs at http://localhost:8000
```

### Frontend
The React component (`ghostresume.jsx`) can be:
- Dropped into any React project (Next.js, Vite, CRA)
- Deployed to Vercel with a simple wrapper

## Deployment

### Option 1: Railway (backend) + Vercel (frontend)

**Backend on Railway:**
1. Push to GitHub
2. Connect repo to Railway
3. Set environment variables: `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`
4. Deploy — Railway reads the `railway.toml`

**Frontend on Vercel:**
1. Wrap `ghostresume.jsx` in a Next.js or Vite project
2. Set the API base URL to your Railway backend
3. Deploy to Vercel

### Option 2: Single Docker deployment
```bash
docker build -t ghostresume -f backend/Dockerfile backend/
docker run -p 8000:8000 \
  -e ANTHROPIC_API_KEY=your_key \
  -e PERPLEXITY_API_KEY=your_key \
  ghostresume
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/api/upload-resume` | Upload PDF/DOCX, returns extracted text |
| POST | `/api/run-pipeline` | Run full Ghost Resume pipeline |
| GET | `/api/session/{id}` | Retrieve previous session results |

### Example: Run Pipeline
```bash
curl -X POST http://localhost:8000/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "resume_text": "Brandon Thomas, Flutter Developer...",
    "job_input": "https://jobs.lever.co/company/role",
    "job_is_url": true
  }'
```

## API Costs

Each pipeline run: ~$0.15-0.35
- Claude Sonnet: ~$0.10-0.25 (1 large call with web search)
- Perplexity Sonar Pro: ~$0.05-0.10 (company research)

## Monetization (when ready)

- **Free tier**: 1 tailored resume per month, preview only
- **Pro** ($9.99/mo): Unlimited applications, full downloads, interview prep
- **Per-use** ($4.99): Single application with everything included

The vault concept (returning users build up their experience data) creates natural retention.
