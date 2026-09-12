"""
routes/ingest.py — POST /ingest

Accepts raw text, chunks it, embeds each chunk, and stores in memory.
Replaces any previously ingested content on each call.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.chunker import split_into_chunks
from services.embeddings import embed_batch
from services.store import chunk_store
from models.chunk import StoredChunk

router = APIRouter()


class IngestRequest(BaseModel):
    text: str


class IngestResponse(BaseModel):
    chunks_stored: int
    chunk_ids: list[str]


@router.post("/ingest", response_model=IngestResponse)
async def ingest(body: IngestRequest) -> IngestResponse:
    """
    Split the submitted text into ~200-word chunks, embed them all,
    and store them in the in-memory store (replacing any prior content).
    """
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="'text' must not be empty.")

    raw_chunks = split_into_chunks(body.text)
    if not raw_chunks:
        raise HTTPException(status_code=422, detail="No chunks produced from input text.")

    # Embed all chunks in a single API call
    embeddings = embed_batch(raw_chunks)

    new_chunks = [
        StoredChunk(
            id=f"src_{i + 1}",
            text=text,
            embedding=emb,
        )
        for i, (text, emb) in enumerate(zip(raw_chunks, embeddings))
    ]

    # Replace store contents (no append — keeps it simple for hackathon)
    chunk_store.clear()
    chunk_store.extend(new_chunks)

    return IngestResponse(
        chunks_stored=len(new_chunks),
        chunk_ids=[c.id for c in new_chunks],
    )
