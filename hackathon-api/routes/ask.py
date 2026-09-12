"""
routes/ask.py — POST /ask (Stage 3: answer + sources only)

Stage 4 will add jurors, overallVerdict, and summaryReason on top of this.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from models.chunk import Source
from models.juror import JurorResponse
from services.retrieval import retrieve
from services.answer import generate_answer
from services.jury import run_jury, compute_overall_verdict, compute_summary_reason

router = APIRouter()


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: List[Source]
    jurors: List[JurorResponse]
    overallVerdict: str
    summaryReason: str


@router.post("/ask", response_model=AskResponse)
async def ask(body: AskRequest) -> AskResponse:
    """
    1. Retrieve top-3 chunks relevant to the question.
    2. Send question + chunks to Gemini for a grounded answer.
    3. Run 4 juror personas in parallel on the answer.
    4. Compute final verdict and reason.
    5. Return the full response.
    """
    if not body.question.strip():
        raise HTTPException(status_code=422, detail="'question' must not be empty.")

    sources = retrieve(body.question, k=3)

    if not sources:
        raise HTTPException(
            status_code=400,
            detail="No documents have been ingested yet. Call POST /ingest first.",
        )

    try:
        answer = generate_answer(body.question, sources)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini generation error: {exc}")

    # Run jury in parallel
    jurors = await run_jury(body.question, answer, sources)
    
    overall_verdict = compute_overall_verdict(jurors)
    summary_reason = compute_summary_reason(jurors)

    return AskResponse(
        answer=answer,
        sources=sources,
        jurors=jurors,
        overallVerdict=overall_verdict,
        summaryReason=summary_reason
    )
