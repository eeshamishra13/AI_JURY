"""
services/retrieval.py — Cosine-similarity retrieval over the in-memory store.
"""

import math
from typing import List

from models.chunk import Source
from services.store import chunk_store
from services.embeddings import embed_text


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Pure-Python cosine similarity (no numpy needed)."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def retrieve(query: str, k: int = 3) -> List[Source]:
    """
    Embed the query, rank stored chunks by cosine similarity, return top-k.

    Returns a list of Source objects matching the CONTRACT.md 'sources' shape:
        [{"id": "src_1", "text": "..."}, ...]
    """
    if not chunk_store:
        return []

    query_vec = embed_text(query)

    scored = [
        (_cosine_similarity(query_vec, chunk.embedding), chunk)
        for chunk in chunk_store
    ]
    scored.sort(key=lambda x: x[0], reverse=True)

    return [Source(id=chunk.id, text=chunk.text) for _, chunk in scored[:k]]
