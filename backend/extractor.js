// extractor.js
// Document text extraction and deterministic chunking for PDF, DOCX, and TXT files.

const path = require("path");
const mammoth = require("mammoth");
const { withTimeout, TimeoutError } = require("./utils");

const EXTRACTION_TIMEOUT_MS = Math.max(1_000, Number(process.env.EXTRACTION_TIMEOUT_MS || 15_000));

class ExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
  }
}

// Supported MIME types and extensions
const SUPPORTED_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/octet-stream", // Fallback for some clients sending files
]);

function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== "string") return "document.txt";
  const base = path.basename(fileName).replace(/[\0\r\n]/g, "").trim();
  return base || "document.txt";
}

function isSupportedFile(fileName, mimeType) {
  if (!fileName) return false;
  const cleanName = sanitizeFileName(fileName);
  const lowerName = cleanName.toLowerCase();
  const lastDot = lowerName.lastIndexOf(".");
  if (lastDot === -1) return false;
  const ext = lowerName.slice(lastDot);
  if (!SUPPORTED_EXTENSIONS.has(ext)) return false;

  // If MIME type provided, it should not contradict supported types
  if (mimeType && mimeType !== "application/octet-stream" && !SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return false;
  }
  return true;
}

function hasExpectedFileSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  // DOCX is a ZIP package. This is intentionally only a lightweight check,
  // not proof that a ZIP contains a valid Word document.
  if (extension === ".docx") return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  return true;
}

async function extractTextFromPDF(buffer) {
  const pdfModule = require("pdf-parse");
  if (typeof pdfModule === "function") {
    const data = await pdfModule(buffer);
    return data.text || "";
  }
  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      return typeof res === "string" ? res : res.text || "";
    } finally {
      if (typeof parser.destroy === "function") {
        await parser.destroy().catch(() => {});
      }
    }
  }
  throw new Error("Unable to initialize PDF parser.");
}

async function extractTextFromDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function extractTextFromTXT(buffer) {
  return buffer.toString("utf-8");
}

async function extractTextFromFile({ buffer, fileName, mimeType }) {
  if (!isSupportedFile(fileName, mimeType)) {
    throw new ExtractionError(
      "UNSUPPORTED_FILE_TYPE",
      "Only PDF, DOCX, and TXT files are supported."
    );
  }

  const lowerName = (fileName || "").toLowerCase();
  const extension = path.extname(lowerName);
  if (!hasExpectedFileSignature(buffer, extension)) {
    throw new ExtractionError("INVALID_FILE_CONTENT", "The uploaded file content does not match its declared type.");
  }
  let text = "";

  try {
    if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
      text = await withTimeout(() => extractTextFromPDF(buffer), EXTRACTION_TIMEOUT_MS);
    } else if (
      lowerName.endsWith(".docx") ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      text = await withTimeout(() => extractTextFromDOCX(buffer), EXTRACTION_TIMEOUT_MS);
    } else if (lowerName.endsWith(".txt") || mimeType === "text/plain") {
      text = extractTextFromTXT(buffer);
    } else {
      // Best-effort fallback by checking magic bytes / string
      text = buffer.toString("utf-8");
    }
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    if (err instanceof TimeoutError) {
      throw new ExtractionError("EXTRACTION_TIMEOUT", "Document processing timed out.");
    }
    throw new ExtractionError("EXTRACTION_FAILED", "Unable to process the uploaded document.");
  }

  const cleanedText = (text || "").trim();
  if (!cleanedText) {
    throw new ExtractionError(
      "EMPTY_DOCUMENT",
      "No readable text was found in the uploaded document."
    );
  }

  return cleanedText;
}

// Deterministic chunking: splits by paragraphs and sentences, aiming for 500-1000 characters per chunk
function chunkDocumentText(text, options = {}) {
  const { minChunkSize = 300, maxChunkSize = 1000 } = options;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units = [];
  for (const para of paragraphs) {
    if (para.length <= maxChunkSize) {
      units.push(para);
    } else {
      // Split large paragraph into sentences
      const sentences = para.split(/(?<=[.!?])\s+/).filter(Boolean);
      let currentSentenceGroup = "";
      for (const sent of sentences) {
        if (currentSentenceGroup.length + sent.length + 1 <= maxChunkSize) {
          currentSentenceGroup = currentSentenceGroup
            ? `${currentSentenceGroup} ${sent}`
            : sent;
        } else {
          if (currentSentenceGroup) units.push(currentSentenceGroup);
          currentSentenceGroup = sent;
        }
      }
      if (currentSentenceGroup) units.push(currentSentenceGroup);
    }
  }

  // Combine small units into chunks of target size
  const chunks = [];
  let currentChunkText = "";

  for (const unit of units) {
    if (!currentChunkText) {
      currentChunkText = unit;
    } else if (currentChunkText.length + unit.length + 2 <= maxChunkSize) {
      currentChunkText += `\n\n${unit}`;
    } else {
      chunks.push(currentChunkText);
      currentChunkText = unit;
    }
  }

  if (currentChunkText) {
    chunks.push(currentChunkText);
  }

  // If no chunks were created, put the whole text in chunk 1
  if (chunks.length === 0 && text.trim().length > 0) {
    chunks.push(text.trim());
  }

  return chunks.map((chunkText, index) => ({
    id: `chunk_${index + 1}`,
    text: chunkText,
    index,
  }));
}

module.exports = {
  ExtractionError,
  isSupportedFile,
  sanitizeFileName,
  extractTextFromFile,
  chunkDocumentText,
  hasExpectedFileSignature,
  EXTRACTION_TIMEOUT_MS,
};
