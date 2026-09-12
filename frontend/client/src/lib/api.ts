// client/src/lib/api.ts
// Centralized API client for AI Jury backend integration.

export interface HealthResponse {
  status: string;
  service: string;
  mode: string;
  evaluationMode: "LIVE" | "MOCK";
}

export interface DocumentUploadResponse {
  documentId: string;
  fileName: string;
  fileType: string;
  chunkCount: number;
}

export interface SourceChunk {
  id: string;
  text: string;
}

export type JurorVerdict = "trust" | "flag" | "uncertain";

export interface JurorResult {
  name: "Literalist" | "Skeptic" | "Domain Expert" | "Context Judge" | string;
  verdict: JurorVerdict;
  confidence: number;
  reasoning: string;
  disputedClaim: string | null;
  evidenceChunkId: string | null;
}

export type OverallVerdict = "TRUSTED" | "FLAGGED" | "MIXED";
export type JuryStatus = "FULL_JURY" | "PARTIAL_JURY" | "INSUFFICIENT_JURY" | "JURY_UNAVAILABLE";

export interface AskResponse {
  answer: string;
  sources: SourceChunk[];
  jurors: JurorResult[];
  jurorsEvaluated: number;
  juryStatus: JuryStatus;
  availableJurors: number;
  expectedJurors: number;
  overallVerdict: OverallVerdict;
  summaryReason: string;
  evaluationMode: "LIVE" | "MOCK";
}

export interface JuryUnavailableResponse {
  error: "JURY_UNAVAILABLE";
  message: string;
  jurorsEvaluated: 0;
  juryStatus: "JURY_UNAVAILABLE";
  availableJurors: 0;
  expectedJurors: 4;
  overallVerdict: null;
  summaryReason: string;
  evaluationMode: "LIVE" | "MOCK";
}

export class ApiError extends Error {
  public code: string;
  public status: number;
  public juryData?: JuryUnavailableResponse;

  constructor(message: string, code = "API_ERROR", status = 500, juryData?: JuryUnavailableResponse) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.juryData = juryData;
  }
}

export function getApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "http://localhost:8000";
}

/**
 * Check backend connectivity and retrieve evaluation mode.
 */
export async function checkBackendHealth(): Promise<HealthResponse> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new ApiError(`Health check failed with status ${res.status}`, "HEALTH_CHECK_FAILED", res.status);
    }
    return (await res.json()) as HealthResponse;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Unable to reach AI Jury backend at " + baseUrl, "BACKEND_UNREACHABLE", 0);
  }
}

/**
 * Upload a document to POST /documents.
 * Sends multipart/form-data. Browser automatically sets boundary.
 */
export async function uploadDocument(file: File): Promise<DocumentUploadResponse> {
  const baseUrl = getApiBaseUrl();

  // Basic client-side validation
  const lowerName = file.name.toLowerCase();
  const isSupported =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".txt") ||
    file.type === "application/pdf" ||
    file.type === "text/plain" ||
    file.type.includes("wordprocessingml");

  if (!isSupported) {
    throw new ApiError("Unsupported file type. Please upload a PDF, DOCX, or TXT file.", "UNSUPPORTED_FILE_TYPE", 400);
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${baseUrl}/documents`, {
      method: "POST",
      body: formData,
      // NOTE: Do NOT set Content-Type header so fetch sets boundary correctly
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(
        data.message || `Document upload failed with status ${res.status}`,
        data.error || "UPLOAD_FAILED",
        res.status
      );
    }

    return data as DocumentUploadResponse;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Failed to upload document", "NETWORK_ERROR", 0);
  }
}

/**
 * Ask a question about an uploaded document.
 * Calls POST /ask with JSON payload { question, documentId }.
 */
export async function askQuestion(documentId: string, question: string): Promise<AskResponse> {
  const baseUrl = getApiBaseUrl();

  if (!documentId) {
    throw new ApiError("Please upload a document before asking a question.", "MISSING_DOCUMENT", 400);
  }

  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length < 3) {
    throw new ApiError("Question must be at least 3 characters.", "VALIDATION_ERROR", 400);
  }

  try {
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        documentId,
        question: trimmedQuestion,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 503 && data.error === "JURY_UNAVAILABLE") {
      throw new ApiError(
        data.message || "All jurors failed to complete evaluation.",
        "JURY_UNAVAILABLE",
        503,
        data as JuryUnavailableResponse
      );
    }

    if (!res.ok) {
      throw new ApiError(
        data.message || `Request failed with status ${res.status}`,
        data.error || "REQUEST_FAILED",
        res.status
      );
    }

    return data as AskResponse;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Failed to communicate with AI Jury backend", "NETWORK_ERROR", 0);
  }
}
