// server.js
// AI Jury Document Mode Server.
// Evaluates AI answers against evidence inside user-uploaded documents.
// Pure JSON API on port 8000, open CORS, no SSE, no WebSockets.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const { validateAskRequest, validateAskResponse, ValidationError } = require("./validation");
const { getDocument, saveDocument, stopDocumentCleanup } = require("./documentStore");
const { extractTextFromFile, chunkDocumentText, ExtractionError, sanitizeFileName } = require("./extractor");
const { retrieveRelevantChunksWithConfidence } = require("./retrieval");
const { generateDocumentAnswer, ConfigurationError } = require("./generator");
const { runJuryEvaluation } = require("./deliberation");
const { getJuryAvailability, buildSummaryReason } = require("./aggregate");

const app = express();

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 20);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length === 0 ? undefined : {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "1mb" }));

// Dependency-free fixed-window limiter: protects the API budget while keeping
// the hackathon deployment simple. Configure per route via environment vars.
function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map();
  const cleanup = (currentTime = now()) => {
    for (const [key, entry] of hits) {
      if (currentTime - entry.startedAt >= windowMs) hits.delete(key);
    }
  };
  const middleware = (req, res, next) => {
    const currentTime = now();
    cleanup(currentTime);
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const entry = hits.get(key);
    const current = !entry || currentTime - entry.startedAt >= windowMs
      ? { startedAt: currentTime, count: 0 }
      : entry;
    current.count += 1;
    hits.set(key, current);
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (currentTime - current.startedAt)) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "RATE_LIMITED", message: "Too many requests. Please try again shortly." });
    }
    next();
  };
  middleware.cleanup = cleanup;
  middleware.size = () => hits.size;
  return middleware;
}
const rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const askRateLimiter = createRateLimiter({ windowMs: rateWindowMs, max: Number(process.env.ASK_RATE_LIMIT || 10) });
const documentRateLimiter = createRateLimiter({ windowMs: rateWindowMs, max: Number(process.env.DOCUMENT_RATE_LIMIT || 10) });
const rateLimitCleanupTimer = setInterval(() => {
  askRateLimiter.cleanup();
  documentRateLimiter.cleanup();
}, rateWindowMs);
rateLimitCleanupTimer.unref();

function stopRateLimitCleanup() {
  clearInterval(rateLimitCleanupTimer);
}

// ---------------------------------------------------------------------------
// Health check endpoint
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AI Jury",
    mode: "document",
    evaluationMode: process.env.MOCK_ANTHROPIC === "true" ? "MOCK" : "LIVE",
  });
});

// ---------------------------------------------------------------------------
// POST /documents — Upload and chunk a document (PDF, DOCX, TXT)
// ---------------------------------------------------------------------------
app.post("/documents", documentRateLimiter, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "FILE_TOO_LARGE",
          message: `File exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB.`,
        });
      }
      return res.status(400).json({
        error: "UPLOAD_ERROR",
        message: "Unable to upload the document.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "file is required in multipart form-data.",
      });
    }

    try {
      const fileName = sanitizeFileName(req.file.originalname || "document.txt");
      const mimeType = req.file.mimetype || "application/octet-stream";
      const buffer = req.file.buffer;

      // Extract raw text
      const extractedText = await extractTextFromFile({ buffer, fileName, mimeType });

      // Chunk the extracted text
      const chunks = chunkDocumentText(extractedText);

      // Store in memory
      const record = saveDocument({
        fileName,
        fileType: mimeType,
        extractedText,
        chunks,
      });

      return res.status(201).json({
        documentId: record.documentId,
        fileName: record.fileName,
        fileType: record.fileType,
        chunkCount: record.chunks.length,
      });
    } catch (extractionErr) {
      if (extractionErr instanceof ExtractionError) {
        return res.status(400).json({
          error: extractionErr.code,
          message: extractionErr.message,
        });
      }

      console.error("[server] Document extraction error:", extractionErr);
      return res.status(500).json({
        error: "EXTRACTION_FAILED",
        message: "Failed to process document.",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /ask — Ask question against an uploaded document
// ---------------------------------------------------------------------------
app.post("/ask", askRateLimiter, async (req, res) => {
  try {
    // 1. Request validation
    const { question, documentId } = validateAskRequest(req.body);

    // 2. Document retrieval from in-memory store
    const document = getDocument(documentId);
    if (!document) {
      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND",
        message: "The requested document was not found.",
      });
    }

    // 3. Retrieve relevant chunks from the document
    const retrieval = retrieveRelevantChunksWithConfidence(question, document.chunks);
    const relevantChunks = retrieval.chunks;
    const sources = relevantChunks.map((c) => ({
      id: c.id,
      text: c.text,
    }));

    // 4. Generate grounded answer using ONLY document evidence
    const answer = retrieval.confidence === "none"
      ? "The provided document does not contain enough information to answer this question."
      : await generateDocumentAnswer({ question, chunks: relevantChunks });

    // 5. Parallel juror evaluation across document chunks
    const evaluationMode = process.env.MOCK_ANTHROPIC === "true" ? "MOCK" : "LIVE";
    const jurors = await runJuryEvaluation({ question, answer, sources });
    if (jurors.length === 0) {
      return res.status(503).json({
        error: "JURY_UNAVAILABLE",
        message: "No jurors were available to evaluate this answer.",
        jurorsEvaluated: 0,
        juryStatus: "JURY_UNAVAILABLE",
        availableJurors: 0,
        expectedJurors: 4,
        overallVerdict: null,
        summaryReason: "No jurors were available to evaluate the answer.",
        evaluationMode,
      });
    }

    // 6. Plain code aggregation (no LLM), with explicit availability metadata.
    const jury = getJuryAvailability(jurors);

    // 7. Plain code summaryReason (no LLM)
    const summaryReason = buildSummaryReason(jurors, jury);

    // 8. Assemble response and validate against API contract
    const responsePayload = {
      answer,
      sources,
      jurors,
      jurorsEvaluated: jurors.length,
      juryStatus: jury.juryStatus,
      availableJurors: jury.availableJurors,
      expectedJurors: jury.expectedJurors,
      overallVerdict: jury.overallVerdict,
      summaryReason,
      evaluationMode,
    };

    const validatedResponse = validateAskResponse(responsePayload);
    return res.status(200).json(validatedResponse);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({
        error: err.code || "VALIDATION_ERROR",
        message: err.message,
      });
    }

    if (err instanceof ConfigurationError) {
      return res.status(500).json({
        error: err.code || "CONFIGURATION_ERROR",
        message: err.message,
      });
    }

    console.error("[server] Unhandled error during /ask processing:", err);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Internal server error.",
    });
  }
});

const PORT = Number(process.env.PORT || 8000);

let serverInstance = null;
if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`AI Jury (Document Mode) listening on http://localhost:${PORT}`);
    console.log(`POST /documents and POST /ask endpoints ready`);
  });
}

function shutdown(signal) {
  if (!serverInstance) return;
  console.log(`[server] Received ${signal}; closing connections.`);
  const timeout = setTimeout(() => process.exit(1), Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000));
  timeout.unref();
  serverInstance.close(() => {
    stopDocumentCleanup();
    stopRateLimitCleanup();
    process.exit(0);
  });
}

if (require.main === module) {
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = { app, serverInstance, createRateLimiter, stopRateLimitCleanup };
