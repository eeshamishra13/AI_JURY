# AI Jury — Multi-Agent AI Answer Verification and Deliberation System

AI Jury is an evidence-grounded AI answer verification system. Instead of relying on a single opaque model, an AI answer is cross-examined against extracted document evidence by four independent juror personas, producing a transparent deliberation and verdict.

---

## Workspace Structure

```text
AI-JURY/
├── backend/                  # Node.js Express verification backend (Port 8000)
│   ├── fixtures/             # Verified test documents (TXT, DOCX, PDF)
│   ├── aggregate.js          # Plain code consensus aggregation & summary rules
│   ├── deliberation.js       # Parallel LLM jurors (Skeptic, Domain Expert, Context Judge)
│   ├── documentStore.js      # Sliding TTL & LRU document store
│   ├── extractor.js          # PDF, DOCX, and TXT parsing & chunking
│   ├── generator.js          # Grounded answer generator with retry & timeout
│   ├── jurors.js             # Deterministic Literalist provenance & contradiction check
│   ├── retrieval.js          # Lexical RAG with topic-keyword qualification
│   ├── schemas.js            # Strict Zod schemas for requests & responses
│   ├── server.js             # Express API server (POST /documents, POST /ask, GET /api/health)
│   ├── test.js               # 90-test verification suite
│   ├── .env.example          # Backend configuration reference
│   └── README.md             # Backend technical documentation
│
├── frontend/                 # React 19 + Vite 7 + Tailwind CSS UI (Port 3000)
│   ├── client/               # Frontend source code
│   │   ├── src/
│   │   │   ├── components/   # Radix UI primitives & theme providers
│   │   │   ├── lib/api.ts    # Centralized typed API client
│   │   │   ├── pages/Home.tsx# Main multi-screen tribunal application
│   │   │   └── index.css     # Design system & typography
│   ├── .env.example          # Frontend configuration reference
│   └── package.json          # Frontend dependencies & build scripts
│
└── README.md                 # This unified guide
```

---

## Quick Start

### 1. Prerequisites
- **Node.js**: v18+ (tested on v20 and v24)
- **npm**: v9+

---

### 2. Running the Backend

In a terminal window:

```bash
cd backend
npm install
```

#### Configure Environment:
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

To run offline with deterministic mock evaluation (no API key required):
```env
MOCK_ANTHROPIC=true
```

To run with live Anthropic Claude evaluation:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
MOCK_ANTHROPIC=false
```

#### Run Backend Tests:
```bash
npm test
```
*(All 90 automated tests across 4 test suites will execute and pass.)*

#### Start the Backend Server:
```bash
npm start
```
*Backend runs on `http://localhost:8000`.*

---

### 3. Running the Frontend

In a second terminal window:

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

Open your browser to `http://localhost:3000`.

---

## The Four Jurors

1. **The Literalist** (Deterministic, no LLM):
   - Audits exact phrase-level evidence provenance and clause alignment.
   - Detects numeric contradictions (with canonical unit matching), negation mismatches (e.g. `non-refundable` vs `refundable`, standalone `no`), and unsupported leaps.
2. **The Skeptic** (Adversarial LLM):
   - Audits for omissions, overclaims, unstated assumptions, and missing policy exceptions.
3. **The Domain Expert** (Technical LLM):
   - Checks technical terminology, domain nuance, and policy correctness strictly against document text.
4. **The Context Judge** (Fit LLM):
   - Evaluates whether the generated answer directly addresses the user's question without evasion or distortion.

---

## API Endpoints (Backend Source of Truth)

### `GET /api/health`
Health check and evaluation mode detection:
```json
{
  "status": "ok",
  "service": "AI Jury",
  "mode": "document",
  "evaluationMode": "LIVE"
}
```

### `POST /documents`
Multipart form upload (`file: <File>`) for `.pdf`, `.docx`, or `.txt`:
```json
{
  "documentId": "48b6f3c0-7f21-4f18-a6da-602931a7b8e1",
  "fileName": "refund-policy.txt",
  "fileType": "text/plain",
  "chunkCount": 3
}
```

### `POST /ask`
Submit question evaluated against document evidence:
```json
{
  "documentId": "48b6f3c0-7f21-4f18-a6da-602931a7b8e1",
  "question": "What is the policy for late cancellations?"
}
```

Returns HTTP 200:
```json
{
  "answer": "Late cancellations after the 24-hour window are non-refundable.",
  "sources": [
    { "id": "chunk_0", "text": "Cancellations made within 24 hours receive a full refund." },
    { "id": "chunk_1", "text": "Late cancellations after the 24-hour window are non-refundable." }
  ],
  "jurors": [
    {
      "name": "Literalist",
      "verdict": "trust",
      "confidence": 92,
      "reasoning": "Directly supported by document evidence.",
      "disputedClaim": null,
      "evidenceChunkId": null
    }
  ],
  "jurorsEvaluated": 4,
  "juryStatus": "FULL_JURY",
  "availableJurors": 4,
  "expectedJurors": 4,
  "overallVerdict": "TRUSTED",
  "summaryReason": "All 4 jurors trust this answer.",
  "evaluationMode": "LIVE"
}
```

Returns HTTP 503 if jurors are unavailable:
```json
{
  "error": "JURY_UNAVAILABLE",
  "message": "All jurors failed to complete evaluation. No verdicts could be formed.",
  "jurorsEvaluated": 0,
  "juryStatus": "JURY_UNAVAILABLE",
  "availableJurors": 0,
  "expectedJurors": 4,
  "overallVerdict": null,
  "summaryReason": "Jury unavailable: no jurors were able to complete evaluation.",
  "evaluationMode": "LIVE"
}
```
