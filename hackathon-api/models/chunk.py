"""
models/chunk.py — Data models for document chunks.

StoredChunk  : internal — chunk + its embedding vector.
Source       : external — the {"id", "text"} shape from CONTRACT.md.
"""

from pydantic import BaseModel
from typing import List


class StoredChunk(BaseModel):
    """A text chunk plus its embedding. Kept in memory only."""

    id: str  # e.g. "src_1", "src_2", …
    text: str
    embedding: List[float]


class Source(BaseModel):
    """Matches the 'sources' item shape in CONTRACT.md exactly."""

    id: str
    text: str
