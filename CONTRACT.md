# API Contract — AI Jury

## Base Config
- **Base URL (local dev):** `http://localhost:8000`
- **Casing:** camelCase for all field names
- **Auth:** none (hackathon only)
- **CORS:** open to all origins

---

## POST /ask

### Request
```json
{
  "question": "What is the refund policy for late cancellations?"
}
```

### Response — success
```json
{
  "answer": "Refunds for cancellations made within 24 hours are processed in full.",
  "sources": [
    { "id": "src_1", "text": "Cancellations within 24 hours receive a full refund..." },
    { "id": "src_2", "text": "Late cancellations after the 24-hour window are non-refundable." }
  ],
  "jurors": [
    {
      "name": "Literalist",
      "verdict": "trust",
      "confidence": 92,
      "reasoning": "Directly matches source text.",
      "disputedClaim": null,
      "evidenceChunkId": null
    },
    {
      "name": "Skeptic",
      "verdict": "flag",
      "confidence": 61,
      "reasoning": "Omits the late-cancellation exception in source 2.",
      "disputedClaim": "Refunds are processed in full.",
      "evidenceChunkId": "src_2"
    },
    {
      "name": "Domain Expert",
      "verdict": "trust",
      "confidence": 85,
      "reasoning": "Policy framing is accurate.",
      "disputedClaim": null,
      "evidenceChunkId": null
    },
    {
      "name": "Context Judge",
      "verdict": "trust",
      "confidence": 90,
      "reasoning": "Directly answers the question asked.",
      "disputedClaim": null,
      "evidenceChunkId": null
    }
  ],
  "overallVerdict": "MIXED"
}
```

### Response — juror failure (graceful degradation)
Same shape, but `jurors` may contain fewer than 4 entries. Never pad with placeholders — frontend renders however many are actually present.

```json
{
  "answer": "...",
  "sources": [ "..." ],
  "jurors": [
    { "name": "Literalist", "verdict": "trust", "confidence": 92, "reasoning": "...", "disputedClaim": null, "evidenceChunkId": null },
    { "name": "Domain Expert", "verdict": "trust", "confidence": 85, "reasoning": "...", "disputedClaim": null, "evidenceChunkId": null },
    { "name": "Context Judge", "verdict": "flag", "confidence": 55, "reasoning": "...", "disputedClaim": "...", "evidenceChunkId": "src_2" }
  ],
  "overallVerdict": "TRUSTED"
}
```
(Skeptic dropped after a timeout — 3 of 4 jurors present.)

---

## Field Rules

| Field | Type | Notes |
|---|---|---|
| `name` | string | Exactly one of: `"Literalist"`, `"Skeptic"`, `"Domain Expert"`, `"Context Judge"` |
| `verdict` | string | lowercase only — `"trust"` \| `"flag"` \| `"uncertain"` |
| `confidence` | number | integer, 0–100 |
| `reasoning` | string | ≤15 words (for now) |
| `disputedClaim` | string \| null | present only when `verdict` is `"flag"` |
| `evidenceChunkId` | string \| null | present only when `verdict` is `"flag"`; must match an `id` in `sources` |
| `overallVerdict` | string | ALL CAPS only — `"TRUSTED"` \| `"FLAGGED"` \| `"MIXED"` |

## Ordering
When all 4 jurors respond, they're always returned in this fixed order:
`Literalist → Skeptic → Domain Expert → Context Judge`.
Frontend renders 4 fixed card slots, not a dynamic list.

## Aggregation Rule
Computed in plain code, never by an LLM call:
- **All 4 present:** `TRUSTED` if trust count ≥ 3, `FLAGGED` if flag count ≥ 2, else `MIXED`
- **Fewer than 4 present (a juror was dropped):** `TRUSTED` if trust count > half of jurors present, `FLAGGED` if flag count ≥ half of jurors present, else `MIXED`

## Failure Handling
If a juror's LLM call fails or times out, that juror is dropped from the `jurors` array entirely — never returned as an error object or a placeholder. The aggregator recalculates `overallVerdict` based on however many jurors actually responded.

## Streaming
None. The full response returns in a single call — no SSE, no websockets. The staggered "jurors delivering verdicts one at a time" effect on the Deliberation Room screen is faked entirely on the frontend (e.g. render each card ~400–500ms after the previous one), using the full array that's already in hand.
