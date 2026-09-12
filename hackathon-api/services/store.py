"""
services/store.py — In-memory chunk store.

A plain list — no DB, no persistence. Good enough for hackathon.
Import `chunk_store` wherever you need to read or write chunks.
"""

from models.chunk import StoredChunk
from typing import List

# Global in-memory store. Replaced on each /ingest call.
chunk_store: List[StoredChunk] = []
