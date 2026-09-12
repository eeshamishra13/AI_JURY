// aggregate.js
// Plain JavaScript aggregation and summaryReason generator.
// Computes overall verdict and summary text strictly according to the API contract.
// NO LLM calls.

const JUROR_ORDER = ["Literalist", "Skeptic", "Domain Expert", "Context Judge"];

// Sorts jurors array according to the fixed contract ordering:
// Literalist -> Skeptic -> Domain Expert -> Context Judge
function orderJurors(jurors) {
  return [...jurors].sort((a, b) => {
    const idxA = JUROR_ORDER.indexOf(a.name);
    const idxB = JUROR_ORDER.indexOf(b.name);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
}

// Aggregates juror verdicts using plain code rules:
// When 4 jurors present:
//   TRUSTED if trust count >= 3
//   FLAGGED if flag count >= 2
//   MIXED otherwise
// Three jurors use a cautious majority. One or two jurors are explicitly
// insufficient and never produce a strong verdict.
function aggregateVerdicts(jurors) {
  const N = jurors.length;
  if (N === 0) return null;

  const trustCount = jurors.filter((j) => j.verdict === "trust").length;
  const flagCount = jurors.filter((j) => j.verdict === "flag").length;

  if (N === 4) {
    if (trustCount >= 3) return "TRUSTED";
    if (flagCount >= 2) return "FLAGGED";
    return "MIXED";
  }

  if (N <= 2) return "MIXED";

  // Three jurors present
  if (trustCount > N / 2) return "TRUSTED";
  if (flagCount >= N / 2) return "FLAGGED";
  return "MIXED";
}

function getJuryAvailability(jurors, expectedJurors = 4) {
  const availableJurors = jurors.length;
  if (availableJurors === 0) {
    return { juryStatus: "JURY_UNAVAILABLE", availableJurors, expectedJurors, overallVerdict: null };
  }
  if (availableJurors <= 2) {
    return { juryStatus: "INSUFFICIENT_JURY", availableJurors, expectedJurors, overallVerdict: "MIXED" };
  }
  return {
    juryStatus: availableJurors === expectedJurors ? "FULL_JURY" : "PARTIAL_JURY",
    availableJurors,
    expectedJurors,
    overallVerdict: aggregateVerdicts(jurors),
  };
}

// Generates summaryReason using plain code rules:
// Rule 1: No flags, no uncertain -> "All {N} jurors trust this answer."
// Rule 2: At least one flag -> "{trustCount} of {N} jurors trust this, but {firstFlaggedJuror.name} flagged: {firstFlaggedJuror.reasoning}"
//         (first flagged juror strictly follows fixed order Literalist -> Skeptic -> Domain Expert -> Context Judge)
// Rule 3: No flags, but uncertainty exists -> "{trustCount} of {N} jurors trust this; {uncertainCount} remain uncertain."
// Word cap: Target approximately 20 words maximum. Truncate quoted reasoning with '…' if needed.
function buildSummaryReason(jurors, availability = getJuryAvailability(jurors)) {
  const N = jurors.length;
  if (availability.juryStatus === "JURY_UNAVAILABLE") return "No jurors were available to evaluate the answer.";
  if (availability.juryStatus === "INSUFFICIENT_JURY") {
    return `Evaluation is inconclusive: only ${N} of ${availability.expectedJurors} expected jurors were available.`;
  }
  if (availability.juryStatus === "PARTIAL_JURY") {
    const verdict = availability.overallVerdict;
    if (verdict === "TRUSTED") {
      return `Partial jury: ${N} of ${availability.expectedJurors} expected jurors completed evaluation. The available jurors found the answer supported by the evidence.`;
    }
    if (verdict === "FLAGGED") {
      return `Partial jury: ${N} of ${availability.expectedJurors} expected jurors completed evaluation. The available jurors flagged concerns about the answer.`;
    }
    return `Partial jury: ${N} of ${availability.expectedJurors} expected jurors completed evaluation. The available jurors reached a mixed or inconclusive result.`;
  }

  const trustCount = jurors.filter((j) => j.verdict === "trust").length;
  const flaggedJurors = jurors.filter((j) => j.verdict === "flag");
  const uncertainCount = jurors.filter((j) => j.verdict === "uncertain").length;

  // Rule 1: All trust
  if (flaggedJurors.length === 0 && uncertainCount === 0) {
    return `All ${N} jurors trust this answer.`;
  }

  // Rule 2: At least one flag
  if (flaggedJurors.length > 0) {
    // Sort flagged jurors to find the first one in fixed contract order
    const sortedFlags = [...flaggedJurors].sort((a, b) => {
      const idxA = JUROR_ORDER.indexOf(a.name);
      const idxB = JUROR_ORDER.indexOf(b.name);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    const firstFlagged = sortedFlags[0];

    const prefix = `${trustCount} of ${N} jurors trust this, but ${firstFlagged.name} flagged: `;
    const prefixWords = prefix.trim().split(/\s+/).length;
    const maxReasonWords = Math.max(5, 20 - prefixWords);

    const reasoningWords = (firstFlagged.reasoning || "").trim().split(/\s+/);
    let reasoningText = firstFlagged.reasoning || "";
    if (reasoningWords.length > maxReasonWords) {
      reasoningText = reasoningWords.slice(0, maxReasonWords).join(" ").replace(/[,.;:!?]+$/, "") + "…";
    }

    return `${prefix}${reasoningText}`;
  }

  // Rule 3: No flags, but uncertainty exists
  return `${trustCount} of ${N} jurors trust this; ${uncertainCount} remain uncertain.`;
}

module.exports = {
  JUROR_ORDER,
  orderJurors,
  aggregateVerdicts,
  getJuryAvailability,
  buildSummaryReason,
};
