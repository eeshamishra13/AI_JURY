// deliberation.js
// Orchestrates parallel evaluation across the four AI jurors in Document Mode:
// Literalist (deterministic document evidence checking)
// Skeptic, Domain Expert, Context Judge (LLM / mocked evaluation with timeout & retry)
// Uses Promise.allSettled: failed jurors are dropped completely without placeholders.

const Anthropic = require("@anthropic-ai/sdk");
const { JUROR_BY_NAME } = require("./jurors");
const { normalizeJurorOutput, JurorOutputError } = require("./validation");
const { orderJurors } = require("./aggregate");
const {
  callWithRetry,
  tokenize,
  stem,
  splitSentences,
  splitIntoClauses,
  normalizeForSubstring,
  isRetryableError,
  escapeForTag,
} = require("./utils");

const JUROR_MODEL = process.env.JUROR_MODEL || process.env.MODEL || "claude-3-5-sonnet-20241022";
const JUROR_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || process.env.JUROR_TIMEOUT_MS || 15000);
const JUROR_MAX_RETRIES = Number(process.env.MAX_RETRIES || process.env.JUROR_MAX_RETRIES || 2);

// ---------------------------------------------------------------------------
// Literalist helpers
// ---------------------------------------------------------------------------

function bestMatchingSourceSentence(clauseWords, sourceSentences) {
  let best = { sentence: null, score: 0 };
  for (const sourceSentence of sourceSentences) {
    const sourceWords = new Set(tokenize(sourceSentence));
    if (sourceWords.size === 0) continue;
    const matched = clauseWords.filter((w) => sourceWords.has(w));
    const score = clauseWords.length ? matched.length / clauseWords.length : 0;
    if (score > best.score) best = { sentence: sourceSentence, score };
  }
  return best;
}

// Suffix stemmer: handles "refunds"<->"refund", "exchanges"<->"exchange",
// "cancellations"<->"cancellation", "processed"<->"process".
// Trailing silent-e variants handled by also checking stem+"e" == source stem.
// stemmedTokenSet: returns Set of stems, PLUS each stem+"e" so that
// "exchange" (stem=exchange) matches "exchang" (from "exchanges").
function stemmedTokenSet(text) {
  const stems = new Set();
  for (const w of tokenize(text)) {
    const s = stem(w);
    stems.add(s);
    stems.add(s + "e"); // silent-e restoration
  }
  return stems;
}

// Fraction of clause's stemmed tokens found in sourceSentenceText.
function stemmedOverlapScore(clauseText, sourceSentenceText) {
  const clauseStems = tokenize(clauseText).map(stem);
  if (clauseStems.length === 0) return 0;
  const sourceStems = stemmedTokenSet(sourceSentenceText);
  const matched = clauseStems.filter((s) => sourceStems.has(s) || sourceStems.has(s + "e"));
  return matched.length / clauseStems.length;
}
function bestStemmedScore(clauseText, sourceSentences) {
  let best = { sentence: null, score: 0 };
  for (const s of sourceSentences) {
    const score = stemmedOverlapScore(clauseText, s);
    if (score > best.score) best = { sentence: s, score };
  }
  return best;
}

// Canonical unit mapping for time and percentages.
// Preserves both numeric value and canonical unit, so:
//   "24 hours" == "24-hour" == "24 hrs"
//   "24 hours" != "24 days" (contradiction)
const UNIT_MAP = {
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour",
  day: "day", days: "day",
  week: "week", weeks: "week",
  month: "month", months: "month",
  year: "year", years: "year",
  minute: "minute", minutes: "minute", min: "minute", mins: "minute",
  second: "second", seconds: "second", sec: "second", secs: "second",
  "%": "%",
};

function extractQuantities(text) {
  if (!text) return [];
  const quantities = [];
  const regex = /(\d+(?:\.\d+)?)\s*(%?)(?:[\s-]*([a-zA-Z]+))?(?:[\s-]+([a-zA-Z]+))?/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const val = m[1];
    const pct = m[2];
    const word1 = (m[3] || "").toLowerCase();
    const word2 = (m[4] || "").toLowerCase();
    const precedingText = text.slice(Math.max(0, m.index - 18), m.index).toLowerCase();
    const followingText = text.slice(regex.lastIndex, regex.lastIndex + 18).toLowerCase();

    // Section/page/reference labels, years, and currency values are usually
    // identifiers or metadata, not factual claim quantities.
    if (/\$\s*$|(?:section|page|policy|reference|ref|id|year)\s*#?\s*$/.test(precedingText)) continue;
    if (Number(val) >= 1900 && Number(val) <= 2100 && /\b(?:year|dated|copyright)\b/.test(precedingText + followingText)) continue;

    let unit = null;
    if (pct === "%") {
      unit = "%";
    } else if (word1 && UNIT_MAP[word1]) {
      unit = UNIT_MAP[word1];
    } else if (word2 && UNIT_MAP[word2]) {
      unit = UNIT_MAP[word2];
    }
    // Bare values (including prices and reference numbers) are too ambiguous
    // for deterministic contradiction checking. Only compare explicit units.
    if (!unit) continue;
    quantities.push({
      value: val,
      unit: unit || null,
      key: val + (unit ? "_" + unit : ""),
    });
  }
  return quantities;
}

function quantitiesEqual(q1, q2) {
  if (q1.value !== q2.value) return false;
  if (q1.unit && q2.unit) return q1.unit === q2.unit;
  if (!q1.unit && !q2.unit) return true;
  return false;
}

// Numeric contradiction: requires >=3 shared content words to confirm same topic.
// Checks if the claim contains quantities that contradict source quantities:
// e.g. 24 hours vs 48 hours (same unit, different value)
// or 24 hours vs 24 days (same value, different unit)
function checkNumericContradiction(clauseText, sourceSentences) {
  const clauseQuantities = extractQuantities(clauseText);
  if (clauseQuantities.length === 0) return null;
  const clauseWords = new Set(tokenize(clauseText));

  for (const sourceSentence of sourceSentences) {
    const sourceWords = new Set(tokenize(sourceSentence));
    const sharedWords = [...clauseWords].filter((w) => sourceWords.has(w));
    if (sharedWords.length < 3) continue;

    const sourceQuantities = extractQuantities(sourceSentence);
    if (sourceQuantities.length === 0) continue;

    const hasDisagreement = clauseQuantities.some((cq) => {
      const exactMatch = sourceQuantities.some((sq) => quantitiesEqual(cq, sq));
      if (exactMatch) return false;
      return sourceQuantities.some((sq) => {
        if (cq.unit && sq.unit && cq.unit === sq.unit && cq.value !== sq.value) return true;
        if (cq.value === sq.value && cq.unit !== sq.unit) return true;
        return false;
      });
    });

    if (hasDisagreement) {
      return { sourceSentence, claimQuantities: clauseQuantities, sourceQuantities };
    }
  }
  return null;
}

// Extended negation: catches "not/never/...", standalone "no" (not followed by digits/abbr),
// "without/neither/nor/none", "non-"/"un-" prefix forms, and antonym pairs.
const NEGATION_PATTERN = /\b(not|never|no longer|cannot|can't|isn't|wasn't|doesn't|didn't|won't|without|neither|nor|none|no(?!\s*[\.\:]?\s*\d))\b|\bnon-?\w+|\bunavailable\b|\bunauthorized\b|\bdisallowed\b/i;

const ANTONYM_PAIRS = [
  ["available", "unavailable"],
  ["allowed", "disallowed"],
  ["authorized", "unauthorized"],
  ["refundable", "nonrefundable"],
  ["refundable", "non-refundable"],
];

function hasExtendedNegationMismatch(clauseText, sourceSentence) {
  const claimNeg = NEGATION_PATTERN.test(clauseText);
  const sourceNeg = NEGATION_PATTERN.test(sourceSentence);
  if (claimNeg !== sourceNeg) return true;

  const lowerClaim = clauseText.toLowerCase();
  const lowerSource = sourceSentence.toLowerCase();

  for (const [pos, neg] of ANTONYM_PAIRS) {
    const claimHasPos = new RegExp(`\\b${pos}\\b`).test(lowerClaim);
    const claimHasNeg = new RegExp(`\\b${neg}\\b`).test(lowerClaim);
    const sourceHasPos = new RegExp(`\\b${pos}\\b`).test(lowerSource);
    const sourceHasNeg = new RegExp(`\\b${neg}\\b`).test(lowerSource);

    if ((claimHasPos && sourceHasNeg) || (claimHasNeg && sourceHasPos)) {
      return true;
    }
  }

  return false;
}

function checkNegationContradiction(clauseText, sourceSentences) {
  const clauseWords = new Set(tokenize(clauseText));
  for (const sourceSentence of sourceSentences) {
    const sourceWords = new Set(tokenize(sourceSentence));
    const sharedWords = [...clauseWords].filter((w) => sourceWords.has(w));
    const overlapRatio = clauseWords.size ? sharedWords.length / clauseWords.size : 0;
    if (overlapRatio >= 0.5 && hasExtendedNegationMismatch(clauseText, sourceSentence)) {
      return { sourceSentence };
    }
  }
  return null;
}

// Multi-sentence synthesis: checks if a text's stems are collectively covered
// across ALL source sentences combined.
function computeSynthesisCoverage(text, sourceSentences) {
  const textStems = tokenize(text).map(stem);
  if (textStems.length === 0) return 1;
  const allSourceStems = stemmedTokenSet(sourceSentences.join(" "));
  const covered = textStems.filter(
    (s) => allSourceStems.has(s) || allSourceStems.has(s + "e")
  );
  return covered.length / textStems.length;
}

// Unsupported numeric addition: clause introduces a quantity not present anywhere
// in the document (catches "within 7 business days" when source only has "24 hours",
// or "24 days" when source only has "24 hours").
function hasUnsupportedNumericAddition(clauseText, allSourceText) {
  const clauseQuantities = extractQuantities(clauseText);
  if (clauseQuantities.length === 0) return false;
  const sourceQuantities = extractQuantities(allSourceText);
  return clauseQuantities.some((cq) => !sourceQuantities.some((sq) => quantitiesEqual(cq, sq)));
}

// ---------------------------------------------------------------------------
// Literalist — main entry point
// ---------------------------------------------------------------------------
function runLiteralistDeterministic({ answer, sources = [] }) {
  const validSourceIds = sources.map((s) => s.id);

  if (!sources || sources.length === 0) {
    return normalizeJurorOutput({
      rawOutput: {
        verdict: "uncertain",
        confidence: 100,
        reasoning: "No document evidence provided.",
        disputedClaim: null,
        evidenceChunkId: null,
      },
      jurorName: "Literalist",
      validSourceIds,
    });
  }

  const sourceSentenceMap = [];
  for (const src of sources) {
    const sents = splitSentences(src.text);
    for (const sent of sents) {
      sourceSentenceMap.push({ chunkId: src.id, sentence: sent });
    }
  }

  const allSourceSentences = sourceSentenceMap.map((s) => s.sentence);
  const combinedSourceText = sources.map((s) => s.text).join(" ");
  const normalizedSource = normalizeForSubstring(combinedSourceText);

  const answerSentences = splitSentences(answer);
  const flags = [];
  const claimVerdicts = [];

  answerSentences.forEach((sentence) => {
    // === WHOLE-SENTENCE SYNTHESIS CHECK ===
    // Before splitting into clauses, test if the entire sentence (as a unit)
    // is collectively covered by multiple document sentences.
    // This catches multi-chunk synthesis like:
    //   "You can exchange within 30 days and refunds go to original payment method"
    // where each half maps to a different source sentence.
    const sentenceClauses = splitIntoClauses(sentence);
    const sentenceSynthesisCoverage = computeSynthesisCoverage(sentence, allSourceSentences);
    // Synthesis is only safe for separate, independently-supported clauses.
    // A single relational claim must have strong support in one source sentence.
    const independentlySupported = sentenceClauses.length > 1 && sentenceClauses.every(
      (clause) => bestStemmedScore(clause, allSourceSentences).score >= 0.65
    );
    if (independentlySupported && sentenceSynthesisCoverage >= 0.70) {
      // Also make sure there's no numeric or negation contradiction at sentence level
      const sentNumContra = checkNumericContradiction(sentence, allSourceSentences);
      const sentNegContra = checkNegationContradiction(sentence, allSourceSentences);
      if (!sentNumContra && !sentNegContra && !hasUnsupportedNumericAddition(sentence, combinedSourceText)) {
        claimVerdicts.push("SUPPORTED");
        return; // entire sentence supported via synthesis
      }
    }

    const clauses = splitIntoClauses(sentence);
    clauses.forEach((clause) => {
      // 1. Numeric contradiction (normalized numbers, sharedWords threshold=3)
      const numContradiction = checkNumericContradiction(clause, allSourceSentences);
      if (numContradiction) {
        const match = sourceSentenceMap.find(
          (s) => s.sentence === numContradiction.sourceSentence
        );
        claimVerdicts.push("CONTRADICTED");
        flags.push({
          claim: clause,
          issue: `Numeric contradiction with ${match?.chunkId || "document"}.`,
          chunkId: match?.chunkId || validSourceIds[0],
        });
        return;
      }

      // 2. Unsupported numeric addition (new number not in document)
      if (hasUnsupportedNumericAddition(clause, combinedSourceText)) {
        claimVerdicts.push("UNSUPPORTED");
        flags.push({
          claim: clause,
          issue: `Claim introduces numeric value not found in document.`,
          chunkId: validSourceIds[0],
        });
        return;
      }

      // 3. Negation contradiction (including "non-" prefix)
      const negContradiction = checkNegationContradiction(clause, allSourceSentences);
      if (negContradiction) {
        const match = sourceSentenceMap.find(
          (s) => s.sentence === negContradiction.sourceSentence
        );
        claimVerdicts.push("CONTRADICTED");
        flags.push({
          claim: clause,
          issue: `Polarity conflict with ${match?.chunkId || "document"}.`,
          chunkId: match?.chunkId || validSourceIds[0],
        });
        return;
      }

      // 4. Verbatim substring
      const normClause = normalizeForSubstring(clause);
      if (normClause.length > 15 && normalizedSource.includes(normClause)) {
        claimVerdicts.push("SUPPORTED");
        return;
      }

      // 5. Stemmed single-sentence overlap (paraphrase detection, threshold 0.60)
      const bestStemmed = bestStemmedScore(clause, allSourceSentences);
      if (bestStemmed.score >= 0.60) {
        claimVerdicts.push("SUPPORTED");
        return;
      }

      // 6. Raw token single-sentence overlap (threshold 0.65)
      const clauseWords = tokenize(clause);
      if (clauseWords.length === 0) {
        claimVerdicts.push("SUPPORTED");
        return;
      }
      const bestRaw = bestMatchingSourceSentence(clauseWords, allSourceSentences);
      if (bestRaw.score >= 0.65) {
        claimVerdicts.push("SUPPORTED");
        return;
      }

      // 7. Partial support — flag if substantial unmatched content (>0.25).
      // We intentionally do not union tokens from unrelated source sentences
      // here: that can fabricate a relationship the document never states.
      if (bestStemmed.score >= 0.35 || bestRaw.score >= 0.35) {
        claimVerdicts.push("PARTIALLY_SUPPORTED");
        const clauseStems = tokenize(clause).map(stem);
        const allSourceStems = stemmedTokenSet(allSourceSentences.join(" "));
        const unmatched = clauseStems.filter(
          (s) => !allSourceStems.has(s) && !allSourceStems.has(s + "e")
        );
        if (clauseStems.length > 0 && unmatched.length / clauseStems.length > 0.25) {
          const match = sourceSentenceMap.find(
            (s) =>
              s.sentence === bestStemmed.sentence || s.sentence === bestRaw.sentence
          );
          flags.push({
            claim: clause,
            issue: `Claim contains additions not found in document.`,
            chunkId: match?.chunkId || validSourceIds[0],
          });
        }
        return;
      }

      // 8. Unsupported
      claimVerdicts.push("UNSUPPORTED");
      const match = sourceSentenceMap.find(
        (s) => s.sentence === bestRaw.sentence || s.sentence === bestStemmed.sentence
      );
      flags.push({
        claim: clause,
        issue: `Claim lacks document evidence.`,
        chunkId: match?.chunkId || validSourceIds[0],
      });
    });
  });

  const supportedCount = claimVerdicts.filter((v) => v === "SUPPORTED").length;
  const partialCount = claimVerdicts.filter((v) => v === "PARTIALLY_SUPPORTED").length;
  const coverage = claimVerdicts.length ? supportedCount / claimVerdicts.length : 1;
  const confidence = Math.round(75 + coverage * 25);

  let verdict = "trust";
  let reasoning = "Directly supported by document evidence.";
  let disputedClaim = null;
  let disputedClaims = [];
  let evidenceChunkId = null;

  if (flags.length > 0) {
    verdict = "flag";
    const f = flags[0];
    disputedClaim = f.claim;
    disputedClaims = [...new Set(flags.map((flag) => flag.claim))].slice(0, 3);
    evidenceChunkId = validSourceIds.includes(f.chunkId) ? f.chunkId : validSourceIds[0];
    reasoning = `Claim not supported by ${evidenceChunkId}.`;
  } else if (partialCount > 0 && supportedCount === 0) {
    verdict = "uncertain";
    reasoning = "Only partially supported by document chunks.";
  }

  return normalizeJurorOutput({
    rawOutput: {
      verdict,
      confidence,
      reasoning,
      disputedClaim,
      disputedClaims,
      evidenceChunkId,
    },
    jurorName: "Literalist",
    validSourceIds,
  });
}

// ---------------------------------------------------------------------------
// Mock Juror (test / no-API-key mode)
// ---------------------------------------------------------------------------
function runMockJuror(juror, { question, answer, sources = [] }) {
  const validSourceIds = sources.map((s) => s.id);
  const aLower = answer.toLowerCase();
  const sourcesText = sources.map((s) => s.text).join(" ").toLowerCase();

  const aTokens = tokenize(answer).map(stem);
  const sourcesTokens = new Set(tokenize(sourcesText).map(stem));
  const overlapTokens = aTokens.filter((t) => sourcesTokens.has(t));
  const isCompletelyUngrounded = aTokens.length > 0 && overlapTokens.length === 0;

  // Mock Jury Safety Guard:
  // If an answer has ZERO grounded content tokens in the document evidence
  // (e.g. "The sky is green because of quantum photosynthesis"), mock jurors must NOT
  // blindly return canned "trust" votes that overpower the Literalist and fabricate consensus.
  if (isCompletelyUngrounded) {
    if (juror.name === "Skeptic") {
      return normalizeJurorOutput({
        rawOutput: {
          verdict: "flag",
          confidence: 85,
          reasoning: "Answer is completely ungrounded in document evidence.",
          disputedClaim: answer,
          evidenceChunkId: validSourceIds[0] || null,
        },
        jurorName: juror.name,
        validSourceIds,
      });
    }
    if (juror.name === "Domain Expert") {
      return normalizeJurorOutput({
        rawOutput: {
          verdict: "flag",
          confidence: 85,
          reasoning: "Answer introduces concepts completely absent from document.",
          disputedClaim: answer,
          evidenceChunkId: validSourceIds[0] || null,
        },
        jurorName: juror.name,
        validSourceIds,
      });
    }
    if (juror.name === "Context Judge") {
      return normalizeJurorOutput({
        rawOutput: {
          verdict: "flag",
          confidence: 80,
          reasoning: "Answer fails to provide relevant document facts for the question.",
          disputedClaim: answer,
          evidenceChunkId: validSourceIds[0] || null,
        },
        jurorName: juror.name,
        validSourceIds,
      });
    }
  }

  if (juror.name === "Skeptic") {
    const hasCancellationException =
      sourcesText.includes("late cancellations") ||
      sourcesText.includes("non-refundable") ||
      sourcesText.includes("after the 24-hour");
    const answerOmitsException =
      !aLower.includes("non-refundable") &&
      !aLower.includes("after the 24-hour window");

    if (hasCancellationException && answerOmitsException && sources.length > 1) {
      const exceptionChunk = sources.find(
        (s) =>
          s.text.toLowerCase().includes("non-refundable") ||
          s.text.toLowerCase().includes("after")
      );
      return normalizeJurorOutput({
        rawOutput: {
          verdict: "flag",
          confidence: 65,
          reasoning: "Omits late cancellation exception in source 2.",
          disputedClaim: "Refunds are processed in full.",
          evidenceChunkId: exceptionChunk
            ? exceptionChunk.id
            : validSourceIds[1] || validSourceIds[0],
        },
        jurorName: juror.name,
        validSourceIds,
      });
    }
    return normalizeJurorOutput({
      rawOutput: {
        verdict: "trust",
        confidence: 82,
        reasoning: "Robustly grounded in document evidence.",
        disputedClaim: null,
        evidenceChunkId: null,
      },
      jurorName: juror.name,
      validSourceIds,
    });
  }

  if (juror.name === "Domain Expert") {
    return normalizeJurorOutput({
      rawOutput: {
        verdict: "trust",
        confidence: 85,
        reasoning: "Accurately reflects document policy.",
        disputedClaim: null,
        evidenceChunkId: null,
      },
      jurorName: juror.name,
      validSourceIds,
    });
  }

  if (juror.name === "Context Judge") {
    return normalizeJurorOutput({
      rawOutput: {
        verdict: "trust",
        confidence: 90,
        reasoning: "Directly answers the question asked.",
        disputedClaim: null,
        evidenceChunkId: null,
      },
      jurorName: juror.name,
      validSourceIds,
    });
  }

  return normalizeJurorOutput({
    rawOutput: {
      verdict: "trust",
      confidence: 80,
      reasoning: "Evaluation complete.",
      disputedClaim: null,
      evidenceChunkId: null,
    },
    jurorName: juror.name,
    validSourceIds,
  });
}

// ---------------------------------------------------------------------------
// LLM Juror evaluation
// ---------------------------------------------------------------------------
async function runLLMJuror(juror, { question, answer, sources = [] }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const isMockMode = process.env.MOCK_ANTHROPIC === "true";

  if (isMockMode) {
    return runMockJuror(juror, { question, answer, sources });
  }

  if (!apiKey || apiKey.trim() === "" || apiKey === "your_api_key_here") {
    // Deliberate configuration error — do NOT silently fall back to mock.
    // The caller (Promise.allSettled) will drop this juror cleanly.
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Set MOCK_ANTHROPIC=true for offline/test mode."
    );
  }

  const validSourceIds = sources.map((s) => s.id);
  // escapeForTag prevents closing tags inside user-supplied content from
  // prematurely ending our XML-ish prompt boundaries.
  const evidenceText = sources
    .map((s) => `[${escapeForTag(s.id)}]: ${escapeForTag(s.text)}`)
    .join("\n\n");

  const userContent = [
    `<DOCUMENT_EVIDENCE>\n${evidenceText}\n</DOCUMENT_EVIDENCE>`,
    "",
    `<QUESTION>\n${escapeForTag(question)}\n</QUESTION>`,
    "",
    `<ANSWER>\n${escapeForTag(answer)}\n</ANSWER>`,
    "",
    "Evaluate the content inside <ANSWER> strictly according to your assigned juror role. Respond with ONLY the required JSON object.",
  ].join("\n");

  const anthropic = new Anthropic({ apiKey });

  return callWithRetry(
    async () => {
      const response = await anthropic.messages.create({
        model: juror.model || JUROR_MODEL,
        max_tokens: 400,
        system: juror.systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });
      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return normalizeJurorOutput({
        rawOutput: rawText,
        jurorName: juror.name,
        validSourceIds,
      });
    },
    {
      retries: JUROR_MAX_RETRIES,
      timeoutMs: JUROR_TIMEOUT_MS,
      isRetryable: (err) => isRetryableError(err) || err instanceof JurorOutputError,
    }
  );
}

// ---------------------------------------------------------------------------
// Parallel Jury Evaluation with Promise.allSettled
// ---------------------------------------------------------------------------
async function runJuryEvaluation({ question, answer, sources = [] }) {
  const tasks = [
    Promise.resolve().then(() => runLiteralistDeterministic({ answer, sources })),
    runLLMJuror(JUROR_BY_NAME["Skeptic"], { question, answer, sources }),
    runLLMJuror(JUROR_BY_NAME["Domain Expert"], { question, answer, sources }),
    runLLMJuror(JUROR_BY_NAME["Context Judge"], { question, answer, sources }),
  ];

  const results = await Promise.allSettled(tasks);
  const successfulJurors = [];
  const jurorNames = ["Literalist", "Skeptic", "Domain Expert", "Context Judge"];

  results.forEach((outcome, idx) => {
    if (outcome.status === "fulfilled" && outcome.value) {
      successfulJurors.push(outcome.value);
    } else {
      console.warn(
        `[deliberation] Juror "${jurorNames[idx]}" failed and was dropped:`,
        outcome.reason?.message || outcome.reason
      );
    }
  });

  return orderJurors(successfulJurors);
}

module.exports = {
  runLiteralistDeterministic,
  runLLMJuror,
  runMockJuror,
  runJuryEvaluation,
  extractQuantities,
  checkNumericContradiction,
  JUROR_MODEL,
  JUROR_TIMEOUT_MS,
  JUROR_MAX_RETRIES,
};
