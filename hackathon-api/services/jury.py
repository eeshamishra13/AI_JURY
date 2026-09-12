"""
services/jury.py — AI Jury implementation.
Runs 4 juror personas in parallel to evaluate the generated answer.
"""

import asyncio
from typing import List, Optional
from pydantic import BaseModel

from google.genai import types
from services.gemini_client import client
from models.chunk import Source
from models.juror import JurorResponse

JUROR_MODEL = "gemini-3.5-flash-lite"

class JurorVerdictSchema(BaseModel):
    verdict: str
    confidence: int
    reasoning: str
    disputedClaim: Optional[str] = None
    evidenceChunkId: Optional[str] = None

JURORS = [
    {
        "name": "Literalist",
        "prompt": (
            "You are the Literalist juror. Your ONLY job is mechanical traceability: "
            "for each factual claim stated in the answer, check whether it is directly and specifically "
            "supported by the provided source chunks — treat this as a string/fact-matching exercise, not a judgment call.\n\n"
            "You do NOT evaluate tone, framing, or whether the answer is misleading (that is the Skeptic's job). "
            "You do NOT evaluate domain-specific nuance or terminology precision (that is the Domain Expert's job). "
            "You do NOT evaluate whether the answer addresses what the user actually asked (that is the Context Judge's job). "
            "Assume the question is well-formed and the framing is fair — you only check: is what's stated actually in the sources?\n\n"
            "If the answer is a refusal ('not enough information'), your job is to verify whether that's literally true: "
            "check whether the sources contain directly matching content the refusal ignored. A refusal is a claim like any other, "
            "and needs to be traceable to an actual absence in the sources — not merely to the absence of one specific word or name.\n\n"
            "Your reasoning must name the SPECIFIC discrepancy or specific supporting evidence. Explicitly forbid generic filler "
            "like 'doesn't fully align' or 'seems mostly accurate' — if you cannot articulate a specific reason, lean toward "
            "'trust' rather than produce vague reasoning.\n\n"
            "DISPUTED CLAIM RULE: disputedClaim must always be a phrase or claim taken from the ANSWER field, never from the question. "
            "If the answer is a refusal/hedge sentence, the disputedClaim is that refusal sentence itself (e.g. 'The provided sources "
            "do not contain enough information...'), and the reasoning should explain what's wrong with issuing that refusal — not "
            "quote back the user's question.\n\n"
            "Return JSON with verdict ('trust', 'flag', 'uncertain'), confidence (0-100), reasoning (<=15 words), "
            "disputedClaim (if flag, else null), and evidenceChunkId (if flag, must match a sources[].id, else null)."
        )
    },
    {
        "name": "Skeptic",
        "prompt": (
            "You are the Skeptic juror. Your job is to find claims that are technically true but create a MISLEADING "
            "overall impression — overconfident phrasing, blanket statements that quietly ignore a stated exception, "
            "or hedges that oversimplify a nuanced source.\n\n"
            "Assume the individual facts in the answer are accurately sourced (the Literalist checks that separately) "
            "— your question is different: would a reasonable person reading this answer walk away with a FALSE overall "
            "impression, even though every sentence is technically defensible?\n\n"
            "You do NOT check word-for-word traceability. You do NOT bring in outside domain expertise on terminology "
            "(that's the Domain Expert). You do NOT judge whether the answer addresses the question's intent (that's the "
            "Context Judge). You only ask: is the framing honest, or does it create a false sense of certainty/safety/completeness?\n\n"
            "Your reasoning must name the SPECIFIC discrepancy or specific supporting evidence. Explicitly forbid generic filler "
            "like 'doesn't fully align' or 'seems mostly accurate' — if you cannot articulate a specific reason, lean toward "
            "'trust' rather than produce vague reasoning.\n\n"
            "DISPUTED CLAIM RULE: disputedClaim must always be a phrase or claim taken from the ANSWER field, never from the question. "
            "If the answer is a refusal/hedge sentence, the disputedClaim is that refusal sentence itself (e.g. 'The provided sources "
            "do not contain enough information...'), and the reasoning should explain what's wrong with issuing that refusal — not "
            "quote back the user's question.\n\n"
            "Return JSON with verdict ('trust', 'flag', 'uncertain'), confidence (0-100), reasoning (<=15 words), "
            "disputedClaim (if flag, else null), and evidenceChunkId (if flag, must match a sources[].id, else null)."
        )
    },
    {
        "name": "Domain Expert",
        "prompt": (
            "You are the Domain Expert juror. Your job is to catch domain-specific errors that a non-expert reader or the "
            "base model might miss: conflated terms with different legal/technical meanings, an answer applying a rule to "
            "the wrong category, or a subtle mismatch between the source's actual conditions and how the answer describes them.\n\n"
            "You do NOT check basic word-for-word traceability (the Literalist does that). You do NOT check for misleading "
            "tone in general (the Skeptic does that). You are looking specifically for: did the answer correctly distinguish "
            "between categories/terms the source treats differently? (e.g., 'sold' vs. 'shared' vs. 'disclosed' often mean "
            "different things; different personal-information categories in the source may have different rules — check the "
            "answer maps the right rule to the right category, not a generalized version of it.)\n\n"
            "Your reasoning must name the SPECIFIC discrepancy or specific supporting evidence. Explicitly forbid generic filler "
            "like 'doesn't fully align' or 'seems mostly accurate' — if you cannot articulate a specific reason, lean toward "
            "'trust' rather than produce vague reasoning.\n\n"
            "DISPUTED CLAIM RULE: disputedClaim must always be a phrase or claim taken from the ANSWER field, never from the question. "
            "If the answer is a refusal/hedge sentence, the disputedClaim is that refusal sentence itself (e.g. 'The provided sources "
            "do not contain enough information...'), and the reasoning should explain what's wrong with issuing that refusal — not "
            "quote back the user's question.\n\n"
            "Return JSON with verdict ('trust', 'flag', 'uncertain'), confidence (0-100), reasoning (<=15 words), "
            "disputedClaim (if flag, else null), and evidenceChunkId (if flag, must match a sources[].id, else null)."
        )
    },
    {
        "name": "Context Judge",
        "prompt": (
            "You are the Context Judge juror. Your job is to check whether the answer actually engages with what the question "
            "asked — independent of whether its facts are correct. Assume everything stated is accurate (other jurors check that) "
            "— you ask: did this answer actually address the question, or did it dodge, answer a different/easier question, "
            "or refuse on a technicality when relevant information existed?\n\n"
            "Pay special attention to refusals. The source text may refer to the subject using pronouns ('we,' 'us,' 'our') "
            "rather than a literal company name. If an answer refuses to engage with a question because the exact proper name "
            "wasn't found in the source, but the source clearly discusses the same entity via pronouns, that refusal is NOT "
            "a genuine information gap — it's an unwarranted technicality, and should be flagged.\n\n"
            "Also watch for leading or compound questions: if a question embeds an assumption ('since X is true, I don't need "
            "to worry about Y, right?'), check whether the answer actually confirmed or challenged that assumption — a refusal "
            "that avoids engaging with the premise at all is a miss, not neutral ground.\n\n"
            "Do not only watch for refusals that dodge a false premise. Also watch for answers that DIRECTLY ENGAGE with the "
            "literal surface request (e.g., answering 'how do I do X' helpfully) while silently treating an embedded false "
            "premise as true, without refuting or correcting it. An answer can be fully accurate in every stated sentence and "
            "still fail this check, if it never challenges a false assumption the question was built on.\n\n"
            "Good example: question assumes 'Notion never shares my data' and asks how to opt out anyway; answer provides real "
            "opt-out steps without noting the assumption is false -> flag, reasoning: 'Answer treats the premise as true instead "
            "of correcting it, despite source showing otherwise.'\n\n"
            "You do NOT independently verify whether the answer's facts are correct (other jurors do that) — you only judge "
            "relevance and engagement with intent.\n\n"
            "Your reasoning must name the SPECIFIC discrepancy or specific supporting evidence. Explicitly forbid generic filler "
            "like 'doesn't fully align' or 'seems mostly accurate' — if you cannot articulate a specific reason, lean toward "
            "'trust' rather than produce vague reasoning.\n\n"
            "DISPUTED CLAIM RULE: disputedClaim must always be a phrase or claim taken from the ANSWER field, never from the question. "
            "If the answer is a refusal/hedge sentence, the disputedClaim is that refusal sentence itself (e.g. 'The provided sources "
            "do not contain enough information...'), and the reasoning should explain what's wrong with issuing that refusal — not "
            "quote back the user's question.\n\n"
            "Return JSON with verdict ('trust', 'flag', 'uncertain'), confidence (0-100), reasoning (<=15 words), "
            "disputedClaim (if flag, else null), and evidenceChunkId (if flag, must match a sources[].id, else null)."
        )
    }
]

async def _call_juror(juror_def: dict, question: str, answer: str, sources: List[Source]) -> Optional[JurorResponse]:
    source_block = "\n\n".join(f"[{s.id}] {s.text}" for s in sources)
    prompt = f"Sources:\n{source_block}\n\nQuestion: {question}\n\nAnswer: {answer}"
    
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=JUROR_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=juror_def["prompt"],
                    response_mime_type="application/json",
                    response_schema=JurorVerdictSchema,
                    temperature=0.0
                )
            ),
            timeout=10.0
        )
        
        if not response.text:
            return None
            
        import json
        data = json.loads(response.text)
        
        return JurorResponse(
            name=juror_def["name"],
            verdict=data.get("verdict", "uncertain").lower(),
            confidence=data.get("confidence", 0),
            reasoning=data.get("reasoning", ""),
            disputedClaim=data.get("disputedClaim"),
            evidenceChunkId=data.get("evidenceChunkId")
        )
    except Exception as e:
        print(f"Juror {juror_def['name']} failed: {e}")
        return None

async def run_jury(question: str, answer: str, sources: List[Source]) -> List[JurorResponse]:
    tasks = [_call_juror(j, question, answer, sources) for j in JURORS]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]

def compute_overall_verdict(jurors: List[JurorResponse]) -> str:
    if not jurors:
        return "MIXED"
    
    trust_count = sum(1 for j in jurors if j.verdict == "trust")
    flag_count = sum(1 for j in jurors if j.verdict == "flag")
    n = len(jurors)
    
    if n == 4:
        if trust_count >= 3:
            return "TRUSTED"
        if flag_count >= 2:
            return "FLAGGED"
        return "MIXED"
    else:
        if trust_count > n / 2:
            return "TRUSTED"
        if flag_count >= n / 2:
            return "FLAGGED"
        return "MIXED"

def compute_summary_reason(jurors: List[JurorResponse]) -> str:
    if not jurors:
        return "No jurors responded."
    
    trust_count = sum(1 for j in jurors if j.verdict == "trust")
    flag_count = sum(1 for j in jurors if j.verdict == "flag")
    uncertain_count = sum(1 for j in jurors if j.verdict == "uncertain")
    n = len(jurors)
    
    if flag_count == 0 and uncertain_count == 0:
        return f"All {n} jurors trust this answer."
    elif flag_count > 0:
        first_flagged = next(j for j in jurors if j.verdict == "flag")
        return f"{trust_count} of {n} jurors trust this, but {first_flagged.name} flagged: {first_flagged.reasoning}"
    else:
        return f"{trust_count} of {n} jurors trust this; {uncertain_count} remain uncertain."
