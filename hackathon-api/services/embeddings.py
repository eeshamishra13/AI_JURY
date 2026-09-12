"""
services/embeddings.py — Embedding helpers using the google-genai SDK.

Model: gemini-embedding-001
Method: client.models.embed_content(model=..., contents=...)
Response: response.embeddings[0].values  (List[float])
"""

from services.gemini_client import client

EMBED_MODEL = "gemini-embedding-001"


def embed_text(text: str) -> list[float]:
    """Return the embedding vector for a single string."""
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
    )
    return response.embeddings[0].values


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Return embedding vectors for a list of strings in one API call."""
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
    )
    return [e.values for e in response.embeddings]
