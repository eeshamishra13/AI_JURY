"""
models/juror.py — Data models for AI jurors.
"""

from pydantic import BaseModel
from typing import Optional

class JurorResponse(BaseModel):
    """Shape of a single juror's verdict, matching CONTRACT.md."""
    name: str
    verdict: str
    confidence: int
    reasoning: str
    disputedClaim: Optional[str] = None
    evidenceChunkId: Optional[str] = None
