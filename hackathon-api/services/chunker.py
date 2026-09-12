"""
services/chunker.py — Split raw text into ~200-word chunks.
"""

from typing import List


CHUNK_SIZE_WORDS = 200
OVERLAP_WORDS = 25

def split_into_chunks(text: str) -> List[str]:
    """
    Split text into chunks of ~CHUNK_SIZE_WORDS words.
    Adds a ~25 word overlap for chunks after the first to prevent splitting context.
    """
    words = text.split()
    chunks: List[str] = []

    for i in range(0, len(words), CHUNK_SIZE_WORDS):
        start = max(0, i - OVERLAP_WORDS) if i > 0 else 0
        end = i + CHUNK_SIZE_WORDS
        chunk = " ".join(words[start : end])
        if chunk:
            chunks.append(chunk)

    return chunks
