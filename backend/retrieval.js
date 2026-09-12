// retrieval.js
// Lightweight lexical retrieval for document chunks.
// Extracts the most relevant document chunks based on question token matching.
// No vector database or complex RAG dependencies.

const { normalizeForMatching } = require("./utils");

const MIN_RELEVANCE_SCORE = 0.2;

// Conversational interrogatives and low-information query fillers that should
// not count as strong topic keywords on their own.
const WEAK_WORDS = new Set([
  "how", "what", "where", "when", "why", "who", "which", "whose",
  "can", "could", "would", "should", "will", "get", "got", "give",
  "work", "works", "tell", "say", "know", "think", "make", "take",
  "see", "come", "go", "appli", "appl", "use", "used", "find",
  "need", "want", "show", "help", "look", "much", "mani", "good",
  "well", "way", "time", "day", "case", "state", "type", "part",
]);

// Generic document structure / meta-words that appear as boilerplate or headers
// across many documents, but do not indicate a specific factual subject on their own.
const GENERIC_META_WORDS = new Set([
  "polici", "policy", "rule", "term", "terms", "condit", "condition", "conditions",
  "guidelin", "guideline", "guidelines", "document", "section", "page", "item",
  "inform", "detail", "general", "standard", "note", "notes",
]);

function isStrongKeyword(token) {
  return !WEAK_WORDS.has(token) && !GENERIC_META_WORDS.has(token) && token.length >= 3;
}

function analyzeChunkRelevance(questionTokens, chunkText) {
  if (questionTokens.length === 0) return { score: 0, matchedCount: 0, matchedTokens: [] };
  const chunkWords = normalizeForMatching(chunkText);
  if (chunkWords.length === 0) return { score: 0, matchedCount: 0, matchedTokens: [] };

  const chunkWordSet = new Set(chunkWords);
  const matchedTokens = [];
  let termFrequencyBonus = 0;

  for (const qToken of questionTokens) {
    if (chunkWordSet.has(qToken)) {
      matchedTokens.push(qToken);
      // Count frequency in chunk
      const freq = chunkWords.filter((w) => w === qToken).length;
      termFrequencyBonus += Math.min(freq, 3) * 0.1;
    }
  }

  // Compare normalized/stemmed token streams on both sides so punctuation,
  // casing, and suffix variants cannot make phrase scoring inconsistent.
  const normalizedChunk = chunkWords.join(" ");
  const normalizedQuestion = questionTokens.join(" ");
  let phraseBonus = 0;
  if (normalizedQuestion.length > 5 && normalizedChunk.includes(normalizedQuestion)) {
    phraseBonus = 0.5;
  }

  const baseScore = matchedTokens.length / questionTokens.length;
  return {
    score: baseScore + termFrequencyBonus + phraseBonus,
    matchedCount: matchedTokens.length,
    matchedTokens,
  };
}

function scoreChunkRelevance(questionTokens, chunkText) {
  return analyzeChunkRelevance(questionTokens, chunkText).score;
}

function retrieveRelevantChunksWithConfidence(question, chunks = [], options = {}) {
  const { maxChunks = 6 } = options;

  if (!chunks || chunks.length === 0) {
    return { chunks: [], confidence: "none" };
  }

  const questionTokens = normalizeForMatching(question);

  const scored = chunks.map((chunk) => {
    const { score, matchedCount, matchedTokens } = analyzeChunkRelevance(questionTokens, chunk.text);
    return {
      chunk,
      score,
      matchedCount,
      matchedTokens,
    };
  });

  // Sort descending by score, tie-break by original index
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.index - b.chunk.index;
  });

  // Precision/recall balance:
  // 1. Multi-word queries with >= 2 matching tokens qualify.
  // 2. Questions with a single match qualify IF that match is a strong topic keyword
  //    (e.g. "refund", "cancellation", "fee", "warranty"), preventing rejection of
  //    realistic queries like "How do refunds work?" or "Can I get a refund?".
  // 3. Questions matching only a weak operational verb (e.g. "applies", "works") or
  //    incidental meta-word are rejected unless the query was specifically asking about that word.
  const positiveMatches = scored.filter((s) => {
    if (s.score < MIN_RELEVANCE_SCORE) return false;
    const isMultiMatch = s.matchedCount >= 2;
    const hasStrongKeyword = s.matchedTokens.some(isStrongKeyword);
    const isDirectSingleQueryMatch = questionTokens.length === 1 && s.matchedCount === 1;
    return isMultiMatch || hasStrongKeyword || isDirectSingleQueryMatch;
  });
  let selected = [];

  if (positiveMatches.length > 0) {
    // Do not pad evidence with zero-relevance chunks. A smaller, relevant
    // evidence set is safer than a misleading "minimum" number of chunks.
    selected = positiveMatches.slice(0, maxChunks).map((s) => s.chunk);
  } else {
    // Do not pass arbitrary opening chunks to the generator as if they were
    // relevant evidence. The caller can return a grounded refusal instead.
    selected = [];
  }

  // Preserve document flow order among selected chunks
  selected.sort((a, b) => a.index - b.index);

  return { chunks: selected.map((c) => ({
    id: c.id,
    text: c.text,
    index: c.index,
  })), confidence: positiveMatches.length > 0 ? "relevant" : "none" };
}

function retrieveRelevantChunks(question, chunks = [], options = {}) {
  return retrieveRelevantChunksWithConfidence(question, chunks, options).chunks;
}

module.exports = {
  scoreChunkRelevance,
  MIN_RELEVANCE_SCORE,
  retrieveRelevantChunks,
  retrieveRelevantChunksWithConfidence,
};
