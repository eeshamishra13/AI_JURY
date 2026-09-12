// validation.js
// Validation helpers for Document Mode requests, juror outputs, and final API responses.

const { extractJSONCandidate } = require("./utils");
const {
  askRequestSchema,
  jurorSchema,
  rawJurorOutputSchema,
  askResponseSchema,
  juryUnavailableResponseSchema,
  formatZodError,
} = require("./schemas");

class ValidationError extends Error {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.retryable = false;
  }
}

class JurorOutputError extends Error {
  constructor(message, { rawText } = {}) {
    super(message);
    this.name = "JurorOutputError";
    this.rawText = rawText;
    this.retryable = true;
  }
}

// Validates the inbound POST /ask body (question, documentId)
function validateAskRequest(body) {
  const result = askRequestSchema.safeParse(body || {});
  if (!result.success) {
    throw new ValidationError(formatZodError(result.error), "VALIDATION_ERROR");
  }
  return result.data;
}

// Maps arbitrary or legacy verdict strings into "trust" | "flag" | "uncertain"
function normalizeVerdict(rawVerdict) {
  const v = String(rawVerdict || "").toLowerCase().trim();

  if (v === "trust" || v === "trusted") return "trust";
  if (v === "flag" || v === "flagged") return "flag";
  if (v === "uncertain") return "uncertain";

  // Mappings from legacy verdict enums
  if (["supported", "robust", "correct", "mostly_correct", "directly_addresses"].includes(v)) {
    return "trust";
  }
  if (
    [
      "contradicted",
      "unsupported",
      "major_concerns",
      "critical_concerns",
      "misleading",
      "incorrect",
      "misaligned",
      "evasive",
    ].includes(v)
  ) {
    return "flag";
  }
  if (
    [
      "partially_supported",
      "minor_concerns",
      "partially_addresses",
      "no_source",
      "insufficient_context",
    ].includes(v)
  ) {
    return "uncertain";
  }

  if (v.includes("trust") || v.includes("support") || v.includes("correct")) return "trust";
  if (v.includes("flag") || v.includes("concern") || v.includes("mislead") || v.includes("contradict")) return "flag";
  return "uncertain";
}

// Truncates text to at most maxWords words, appending '…' if truncated
function truncateToMaxWords(text, maxWords = 15) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Evaluation completed.";
  const words = cleaned.split(" ");
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(" ").replace(/[,.;:!?]+$/, "") + "…";
}

// Normalizes and validates any juror output against the contract
function normalizeJurorOutput({ rawOutput, jurorName, validSourceIds = [] }) {
  let parsed;
  if (typeof rawOutput === "string") {
    try {
      const candidate = extractJSONCandidate(rawOutput);
      parsed = rawJurorOutputSchema.parse(candidate);
    } catch (err) {
      throw new JurorOutputError(`Failed to parse juror JSON: ${err.message}`, { rawText: rawOutput });
    }
  } else if (rawOutput && typeof rawOutput === "object") {
    parsed = rawJurorOutputSchema.parse(rawOutput);
  } else {
    throw new JurorOutputError("Invalid juror output type: expected object or JSON string.");
  }

  const verdict = normalizeVerdict(parsed.verdict);
  const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence) || 0)));
  const reasoning = truncateToMaxWords(parsed.reasoning, 15);

  let disputedClaim = null;
  let disputedClaims = [];
  let evidenceChunkId = null;

  if (verdict === "flag") {
    if (parsed.disputedClaim && typeof parsed.disputedClaim === "string" && parsed.disputedClaim.trim().length > 0) {
      disputedClaim = parsed.disputedClaim.trim();
    } else {
      disputedClaim = "Claim requires verification.";
    }
    disputedClaims = Array.isArray(parsed.disputedClaims)
      ? parsed.disputedClaims.filter((claim) => typeof claim === "string" && claim.trim()).slice(0, 3).map((claim) => claim.trim())
      : [disputedClaim];
    if (!disputedClaims.includes(disputedClaim)) disputedClaims.unshift(disputedClaim);
    disputedClaims = disputedClaims.slice(0, 3);

    if (parsed.evidenceChunkId && typeof parsed.evidenceChunkId === "string") {
      const candidateId = parsed.evidenceChunkId.trim();
      if (validSourceIds.includes(candidateId)) {
        evidenceChunkId = candidateId;
      } else {
        // Match chunk prefix or case-insensitive match
        const matched = validSourceIds.find(
          (id) => id.toLowerCase() === candidateId.toLowerCase() || candidateId.includes(id)
        );
        evidenceChunkId = matched || null;
      }
    }
  }

  const normalized = {
    name: jurorName,
    verdict,
    confidence,
    reasoning,
    disputedClaim,
    disputedClaims,
    evidenceChunkId,
  };

  return jurorSchema.parse(normalized);
}

// Validates the full response before sending
function validateAskResponse(response) {
  return askResponseSchema.parse(response);
}

// Validates the structured JURY_UNAVAILABLE 503 response
function validateJuryUnavailableResponse(response) {
  return juryUnavailableResponseSchema.parse(response);
}

module.exports = {
  ValidationError,
  JurorOutputError,
  validateAskRequest,
  normalizeVerdict,
  truncateToMaxWords,
  normalizeJurorOutput,
  validateAskResponse,
  validateJuryUnavailableResponse,
};
