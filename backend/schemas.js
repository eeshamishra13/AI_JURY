// schemas.js
// Zod schemas for request validation, juror outputs, and final response contract in Document Mode.

const { z } = require("zod");

// Inbound POST /ask request
const askRequestSchema = z.object({
  question: z
    .string({
      required_error: "question is required.",
      invalid_type_error: "question must be a string.",
    })
    .trim()
    .min(1, "question is required.")
    .max(4000, "question must be at most 4000 characters."),
  documentId: z
    .string({
      required_error: "documentId is required.",
      invalid_type_error: "documentId must be a string.",
    })
    .trim()
    .min(1, "documentId is required."),
});

// Single source structure (corresponds directly to an extracted document chunk)
const sourceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

// Juror output contract
const jurorSchema = z.object({
  name: z.enum(["Literalist", "Skeptic", "Domain Expert", "Context Judge"]),
  verdict: z.enum(["trust", "flag", "uncertain"]),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
  disputedClaim: z.string().nullable(),
  disputedClaims: z.array(z.string().min(1)).max(3).optional(),
  evidenceChunkId: z.string().nullable(),
});

// Raw juror output schema for model response parsing
const rawJurorOutputSchema = z.object({
  verdict: z.string(),
  confidence: z.coerce.number().optional().default(75),
  reasoning: z.string().optional().default("Evaluation completed."),
  disputedClaim: z.string().nullable().optional().default(null),
  disputedClaims: z.array(z.string()).max(3).optional(),
  evidenceChunkId: z.string().nullable().optional().default(null),
});

// Full POST /ask response contract
const askResponseSchema = z.object({
  answer: z.string().min(1),
  sources: z.array(sourceSchema),
  jurors: z.array(jurorSchema),
  jurorsEvaluated: z.number().int().min(0).max(4),
  juryStatus: z.enum(["FULL_JURY", "PARTIAL_JURY", "INSUFFICIENT_JURY", "JURY_UNAVAILABLE"]),
  availableJurors: z.number().int().min(0).max(4),
  expectedJurors: z.literal(4),
  overallVerdict: z.enum(["TRUSTED", "FLAGGED", "MIXED"]).nullable(),
  summaryReason: z.string().min(1),
  evaluationMode: z.enum(["LIVE", "MOCK"]).optional().default("LIVE"),
});

// Structured 503 JURY_UNAVAILABLE response contract
const juryUnavailableResponseSchema = z.object({
  error: z.literal("JURY_UNAVAILABLE"),
  message: z.string().min(1),
  jurorsEvaluated: z.literal(0),
  juryStatus: z.literal("JURY_UNAVAILABLE"),
  availableJurors: z.literal(0),
  expectedJurors: z.literal(4),
  overallVerdict: z.null(),
  summaryReason: z.string().min(1),
  evaluationMode: z.enum(["LIVE", "MOCK"]).optional(),
});

// Formats a ZodError into a clean string
function formatZodError(zodError) {
  return zodError.issues
    .map((issue) => issue.message)
    .join("; ");
}

module.exports = {
  askRequestSchema,
  sourceSchema,
  jurorSchema,
  rawJurorOutputSchema,
  askResponseSchema,
  juryUnavailableResponseSchema,
  formatZodError,
};
