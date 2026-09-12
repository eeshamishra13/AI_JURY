// client-example.js
// Demonstrates Document Mode workflow:
// 1. Upload a document (multipart/form-data) to POST /documents
// 2. Receive documentId
// 3. Ask question to POST /ask with question & documentId
// 4. Print answer, sources, jurors, overallVerdict, summaryReason

const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:8000";

async function uploadDocument(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(absolutePath);
  const fileBuffer = fs.readFileSync(absolutePath);

  console.log(`1. Uploading document: ${fileName}...`);

  // Build multipart/form-data boundary and body
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
  const mimeType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : fileName.endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "text/plain";

  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header, "utf-8"),
    fileBuffer,
    Buffer.from(footer, "utf-8"),
  ]);

  const res = await fetch(`${BASE_URL}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Upload failed (${res.status}): ${err.message || err.error || "Unknown error"}`);
  }

  const uploadResult = await res.json();
  console.log(`✓ Document uploaded successfully:`);
  console.log(`  Document ID : ${uploadResult.documentId}`);
  console.log(`  File Name   : ${uploadResult.fileName}`);
  console.log(`  Chunks      : ${uploadResult.chunkCount}\n`);

  return uploadResult.documentId;
}

async function askJuryQuestion(documentId, question) {
  console.log(`2. Asking question: "${question}"...`);

  const res = await fetch(`${BASE_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, documentId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Ask failed (${res.status}): ${err.message || err.error || "Unknown error"}`);
  }

  const data = await res.json();

  console.log("\n==================================================");
  console.log("AI JURY (DOCUMENT MODE) VERDICT");
  console.log("==================================================");
  console.log(`Overall Verdict : ${data.overallVerdict}`);
  console.log(`Summary Reason  : ${data.summaryReason}\n`);

  console.log("--- ANSWER ---");
  console.log(data.answer, "\n");

  console.log("--- RETRIEVED DOCUMENT EVIDENCE (SOURCES) ---");
  data.sources.forEach((src) => {
    console.log(`[${src.id}]: ${src.text}`);
  });
  console.log();

  console.log("--- JUROR EVALUATIONS ---");
  data.jurors.forEach((j) => {
    console.log(`- ${j.name}:`);
    console.log(`    Verdict        : ${j.verdict}`);
    console.log(`    Confidence     : ${j.confidence}%`);
    console.log(`    Reasoning      : ${j.reasoning}`);
    if (j.disputedClaim) {
      console.log(`    Disputed Claim : ${j.disputedClaim}`);
    }
    if (j.evidenceChunkId) {
      console.log(`    Evidence Chunk : ${j.evidenceChunkId}`);
    }
  });

  return data;
}

async function main() {
  try {
    const fixturePath = path.join(__dirname, "fixtures", "refund-policy.txt");
    const documentId = await uploadDocument(fixturePath);
    await askJuryQuestion(documentId, "What is the refund policy for late cancellations?");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  uploadDocument,
  askJuryQuestion,
};
