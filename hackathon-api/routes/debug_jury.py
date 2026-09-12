from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

from models.chunk import Source
from models.juror import JurorResponse
from services.jury import run_jury, compute_overall_verdict, compute_summary_reason

router = APIRouter()

class DebugJuryRequest(BaseModel):
    question: str
    answer: str
    sources: List[Source]

class DebugJuryResponse(BaseModel):
    jurors: List[JurorResponse]
    overallVerdict: str
    summaryReason: str

@router.post("/debug/jury", response_model=DebugJuryResponse)
async def debug_jury(body: DebugJuryRequest) -> DebugJuryResponse:
    """
    Testing-only endpoint to call the jury directly with a hand-written answer,
    bypassing generation.
    """
    jurors = await run_jury(body.question, body.answer, body.sources)
    
    overall_verdict = compute_overall_verdict(jurors)
    summary_reason = compute_summary_reason(jurors)

    return DebugJuryResponse(
        jurors=jurors,
        overallVerdict=overall_verdict,
        summaryReason=summary_reason
    )
