// documentStore.js
// In-memory document storage for hackathon MVP.
// Maps documentId -> document record.

const crypto = require("crypto");
const documents = new Map();
const MAX_DOCUMENTS = Math.max(1, Number(process.env.MAX_DOCUMENTS || 50));
const DOCUMENT_TTL_MS = Math.max(1_000, Number(process.env.DOCUMENT_TTL_MS || 3_600_000));
const DOCUMENT_CLEANUP_INTERVAL_MS = Math.max(1_000, Number(process.env.DOCUMENT_CLEANUP_INTERVAL_MS || 60_000));

function generateDocumentId() {
  return crypto.randomUUID();
}

function saveDocument({ documentId, fileName, fileType, extractedText, chunks }) {
  const id = documentId || generateDocumentId();
  const now = new Date();
  const record = {
    documentId: id,
    fileName,
    fileType,
    extractedText,
    chunks,
    createdAt: now.toISOString(),
    lastAccessedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DOCUMENT_TTL_MS).toISOString(),
  };
  documents.set(id, record);
  // Map preserves insertion order, so its first key is the oldest document.
  while (documents.size > MAX_DOCUMENTS) {
    documents.delete(documents.keys().next().value);
  }
  return record;
}

function getDocument(documentId) {
  const record = documents.get(documentId);
  if (!record) return null;
  const now = Date.now();
  if (new Date(record.expiresAt).getTime() <= now) {
    documents.delete(documentId);
    return null;
  }
  record.lastAccessedAt = new Date(now).toISOString();
  record.expiresAt = new Date(now + DOCUMENT_TTL_MS).toISOString();
  // Refresh Map insertion order so the capacity cap evicts the least-recently
  // accessed document rather than merely the oldest created document.
  documents.delete(documentId);
  documents.set(documentId, record);
  return record;
}

function cleanupExpiredDocuments(now = Date.now()) {
  let removed = 0;
  for (const [id, record] of documents) {
    if (new Date(record.expiresAt).getTime() <= now) {
      documents.delete(id);
      removed += 1;
    }
  }
  return removed;
}

const cleanupTimer = setInterval(cleanupExpiredDocuments, DOCUMENT_CLEANUP_INTERVAL_MS);
// The timer must not keep a CLI process alive after Express has shut down.
cleanupTimer.unref();

function stopDocumentCleanup() {
  clearInterval(cleanupTimer);
}

function deleteDocument(documentId) {
  return documents.delete(documentId);
}

function clearAllDocuments() {
  documents.clear();
}

function countDocuments() {
  return documents.size;
}

module.exports = {
  documents,
  generateDocumentId,
  saveDocument,
  getDocument,
  deleteDocument,
  clearAllDocuments,
  countDocuments,
  MAX_DOCUMENTS,
  DOCUMENT_TTL_MS,
  cleanupExpiredDocuments,
  stopDocumentCleanup,
};
