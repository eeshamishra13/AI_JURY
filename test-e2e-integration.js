// test-e2e-integration.js
// Comprehensive End-to-End Integration Test for AI Jury.
// Validates Backend APIs, Frontend Bundle, and Full User Flows.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND_PORT = 8011;
const BASE_URL = `http://localhost:${BACKEND_PORT}`;

// Colors
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ${GREEN}PASS${RESET}: ${message}`);
    passedCount++;
  } else {
    console.error(`  ${RED}FAIL${RESET}: ${message}`);
    failedCount++;
  }
}

function makeRequest(endpoint, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const reqOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on("error", reject);

    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === "string") {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function buildMultipartFormData(fields, fileField, filename, fileBuffer, contentType) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    )
  );
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const totalBuffer = Buffer.concat(chunks);
  return {
    boundary,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": totalBuffer.length,
    },
    buffer: totalBuffer,
  };
}

async function runTests() {
  console.log(`\n${CYAN}==================================================${RESET}`);
  console.log(`${CYAN}AI JURY COMPLETE END-TO-END INTEGRATION TEST${RESET}`);
  console.log(`${CYAN}==================================================${RESET}\n`);

  // 1. Check frontend production bundle
  console.log(`${YELLOW}1. VERIFYING FRONTEND PRODUCTION BUILD${RESET}`);
  const distHtmlPath = path.join(__dirname, "frontend", "dist", "public", "index.html");
  assert(fs.existsSync(distHtmlPath), "Frontend dist/public/index.html exists");

  const distAssetsDir = path.join(__dirname, "frontend", "dist", "public", "assets");
  assert(fs.existsSync(distAssetsDir), "Frontend dist/public/assets directory exists");

  const assetFiles = fs.readdirSync(distAssetsDir);
  const jsBundle = assetFiles.find((f) => f.endsWith(".js"));
  assert(Boolean(jsBundle), `Frontend JS bundle generated: ${jsBundle}`);

  if (jsBundle) {
    const bundleContent = fs.readFileSync(path.join(distAssetsDir, jsBundle), "utf8");
    assert(bundleContent.includes("/documents"), "Bundle contains real API endpoint /documents");
    assert(bundleContent.includes("/ask"), "Bundle contains real API endpoint /ask");
    assert(bundleContent.includes("/api/health"), "Bundle contains real API endpoint /api/health");
    assert(!bundleContent.includes("Attention Is All You Need"), "Hardcoded mock transformer answer successfully removed from frontend bundle");
  }

  // 2. Start backend server process
  console.log(`\n${YELLOW}2. STARTING AI JURY BACKEND (Port ${BACKEND_PORT})${RESET}`);
  const backendEnv = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    MOCK_ANTHROPIC: "true",
  };

  const backendProcess = spawn("node", ["server.js"], {
    cwd: path.join(__dirname, "backend"),
    env: backendEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverReady = false;
  backendProcess.stdout.on("data", (d) => {
    const msg = d.toString();
    if (msg.includes("running on http://localhost:") || msg.includes("listening")) {
      serverReady = true;
    }
  });

  // Wait for server to start
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const ping = await makeRequest("/api/health");
      if (ping.status === 200) {
        serverReady = true;
        break;
      }
    } catch {
      // waiting
    }
  }

  assert(serverReady, "Backend server started and responding to HTTP requests");

  try {
    // 3. Health Check
    console.log(`\n${YELLOW}3. TESTING GET /api/health${RESET}`);
    const health = await makeRequest("/api/health");
    assert(health.status === 200, "GET /api/health returns HTTP 200");
    assert(health.body.status === "ok", "health.status === 'ok'");
    assert(health.body.service === "AI Jury", "health.service === 'AI Jury'");
    assert(health.body.mode === "document", "health.mode === 'document'");
    assert(health.body.evaluationMode === "MOCK", "health.evaluationMode === 'MOCK'");

    // 4. Document Upload (TXT)
    console.log(`\n${YELLOW}4. TESTING POST /documents (TXT, DOCX, PDF)${RESET}`);
    const txtPath = path.join(__dirname, "backend", "fixtures", "refund-policy.txt");
    const txtBuffer = fs.readFileSync(txtPath);
    const txtMultipart = buildMultipartFormData({}, "file", "refund-policy.txt", txtBuffer, "text/plain");

    const txtUpload = await makeRequest("/documents", { method: "POST", headers: txtMultipart.headers }, txtMultipart.buffer);
    assert(txtUpload.status === 201, "TXT upload returns HTTP 201 Created");
    assert(typeof txtUpload.body.documentId === "string", "Returns documentId string");
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(txtUpload.body.documentId), "documentId is valid UUID v4");
    assert(txtUpload.body.fileName === "refund-policy.txt", "fileName preserved");
    assert(txtUpload.body.chunkCount > 0, `chunkCount > 0 (${txtUpload.body.chunkCount} chunks)`);

    const documentId = txtUpload.body.documentId;

    // PDF Upload
    const pdfPath = path.join(__dirname, "backend", "fixtures", "sample.pdf");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfMultipart = buildMultipartFormData({}, "file", "sample.pdf", pdfBuffer, "application/pdf");
    const pdfUpload = await makeRequest("/documents", { method: "POST", headers: pdfMultipart.headers }, pdfMultipart.buffer);
    assert(pdfUpload.status === 201, "PDF upload returns HTTP 201 Created");
    assert(pdfUpload.body.chunkCount > 0, `PDF chunkCount: ${pdfUpload.body.chunkCount}`);

    // DOCX Upload
    const docxPath = path.join(__dirname, "backend", "fixtures", "sample.docx");
    const docxBuffer = fs.readFileSync(docxPath);
    const docxMultipart = buildMultipartFormData({}, "file", "sample.docx", docxBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const docxUpload = await makeRequest("/documents", { method: "POST", headers: docxMultipart.headers }, docxMultipart.buffer);
    assert(docxUpload.status === 201, "DOCX upload returns HTTP 201 Created");
    assert(docxUpload.body.chunkCount > 0, `DOCX chunkCount: ${docxUpload.body.chunkCount}`);

    // 5. Invalid Document Uploads
    console.log(`\n${YELLOW}5. TESTING DOCUMENT UPLOAD ERROR HANDLING${RESET}`);
    // Empty file
    const emptyMultipart = buildMultipartFormData({}, "file", "empty.txt", Buffer.from(""), "text/plain");
    const emptyUpload = await makeRequest("/documents", { method: "POST", headers: emptyMultipart.headers }, emptyMultipart.buffer);
    assert(emptyUpload.status === 400, "Empty document rejected with HTTP 400");
    assert(emptyUpload.body.error === "EMPTY_DOCUMENT", "error === 'EMPTY_DOCUMENT'");

    // Unsupported extension
    const exeMultipart = buildMultipartFormData({}, "file", "malware.exe", Buffer.from("binary"), "application/octet-stream");
    const exeUpload = await makeRequest("/documents", { method: "POST", headers: exeMultipart.headers }, exeMultipart.buffer);
    assert(exeUpload.status === 400, "Unsupported file extension rejected with HTTP 400");
    assert(exeUpload.body.error === "UNSUPPORTED_FILE_TYPE", "error === 'UNSUPPORTED_FILE_TYPE'");

    // 6. Question & Answer Flow (POST /ask)
    console.log(`\n${YELLOW}6. TESTING POST /ask (RELEVANT QUESTION & JURY DELIBERATION)${RESET}`);
    const askPayload = {
      documentId,
      question: "What is the refund policy for cancellations within 24 hours?",
    };

    const askRes = await makeRequest(
      "/ask",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify(askPayload)
    );

    assert(askRes.status === 200, "POST /ask returns HTTP 200 OK");
    assert(typeof askRes.body.answer === "string" && askRes.body.answer.length > 10, "Real answer returned");
    assert(Array.isArray(askRes.body.sources) && askRes.body.sources.length > 0, "Retrieved sources returned");
    assert(askRes.body.sources[0].id && askRes.body.sources[0].text, "Source chunk has id and text");
    assert(Array.isArray(askRes.body.jurors) && askRes.body.jurors.length === 4, "All 4 jurors present in response");
    assert(askRes.body.jurorsEvaluated === 4, "jurorsEvaluated === 4");
    assert(askRes.body.juryStatus === "FULL_JURY", "juryStatus === 'FULL_JURY'");
    assert(askRes.body.overallVerdict === "TRUSTED", "overallVerdict === 'TRUSTED'");
    assert(typeof askRes.body.summaryReason === "string", `summaryReason: "${askRes.body.summaryReason}"`);
    assert(askRes.body.evaluationMode === "MOCK", "evaluationMode === 'MOCK'");

    // Check individual jurors
    const jurorNames = askRes.body.jurors.map((j) => j.name);
    assert(jurorNames.includes("Literalist"), "Literalist juror evaluated");
    assert(jurorNames.includes("Skeptic"), "Skeptic juror evaluated");
    assert(jurorNames.includes("Domain Expert"), "Domain Expert juror evaluated");
    assert(jurorNames.includes("Context Judge"), "Context Judge juror evaluated");

    // 7. Testing Unrelated Question & Flagged Verdict Handling
    console.log(`\n${YELLOW}7. TESTING UNRELATED QUESTION & JURY FLAGGING${RESET}`);
    const unrelatedAsk = await makeRequest(
      "/ask",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify({
        documentId,
        question: "How do quantum gravitational fluctuations affect photosynthesizing chloroplasts?",
      })
    );
    assert(unrelatedAsk.status === 200, "Unrelated question returns HTTP 200");
    assert(unrelatedAsk.body.overallVerdict === "FLAGGED", "Ungrounded / unrelated claim correctly results in FLAGGED verdict");
    assert(unrelatedAsk.body.jurors.some((j) => j.verdict === "flag"), "At least one juror flagged the ungrounded claim");

    // 8. TESTING POST /ask ERROR HANDLING
    console.log(`\n${YELLOW}8. TESTING POST /ask ERROR HANDLING${RESET}`);
    // Non-existent document
    const missingDoc = await makeRequest(
      "/ask",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify({ documentId: "00000000-0000-4000-8000-000000000000", question: "Valid question here?" })
    );
    assert(missingDoc.status === 404, "Unknown documentId returns HTTP 404");
    assert(missingDoc.body.error === "DOCUMENT_NOT_FOUND", "error === 'DOCUMENT_NOT_FOUND'");

    // Empty question
    const emptyQ = await makeRequest(
      "/ask",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify({ documentId, question: "" })
    );
    assert(emptyQ.status === 400, "Empty question returns HTTP 400");
    assert(emptyQ.body.error === "VALIDATION_ERROR", "error === 'VALIDATION_ERROR'");

    // 9. Strict Configuration Policy (Missing API key + MOCK_ANTHROPIC=false)
    console.log(`\n${YELLOW}9. TESTING EXPLICIT CONFIGURATION POLICY (NO SILENT MOCK)${RESET}`);
    // Spawn server with MOCK_ANTHROPIC=false and empty API key on port 8012
    const livePort = 8012;
    const liveProcess = spawn("node", ["server.js"], {
      cwd: path.join(__dirname, "backend"),
      env: {
        ...process.env,
        PORT: String(livePort),
        MOCK_ANTHROPIC: "false",
        ANTHROPIC_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const liveHealthUrl = `http://127.0.0.1:${livePort}/api/health`;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const p = await new Promise((resolve, reject) => {
          const req = http.get(liveHealthUrl, (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
          });
          req.on("error", reject);
        });
        if (p.status === 200) {
          assert(p.body.evaluationMode === "LIVE", "When MOCK_ANTHROPIC=false, health reports LIVE evaluationMode");
          break;
        }
      } catch {}
    }

    liveProcess.kill();

  } finally {
    backendProcess.kill();
  }

  console.log(`\n${CYAN}==================================================${RESET}`);
  console.log(`${CYAN}INTEGRATION TEST TOTALS${RESET}`);
  console.log(`Passed: ${GREEN}${passedCount}${RESET}`);
  console.log(`Failed: ${failedCount > 0 ? RED : GREEN}${failedCount}${RESET}`);
  console.log(`${CYAN}==================================================${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
