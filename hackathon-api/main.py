"""
main.py — FastAPI application entry point.

Stage 1: project scaffold + /health endpoint.
Stage 2: POST /ingest — document chunking, embedding, retrieval.
Stage 3: POST /ask — answer generation (answer + sources).
Stage 4 will add jurors, overallVerdict, summaryReason.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Validate env vars and initialise the Gemini client at startup.
# Import order matters: config raises immediately if the key is missing.
import config  # noqa: F401 — side-effect import (env validation)
import services.gemini_client  # noqa: F401 — eagerly init the client singleton

from routes.health import router as health_router
from routes.ingest import router as ingest_router
from routes.ask import router as ask_router
from routes.debug_jury import router as debug_jury_router

app = FastAPI(
    title="AI Jury API",
    description="Multi-juror AI verdict system — hackathon edition",
    version="0.4.0",
)

# CORS — open to all origins (no auth, hackathon only)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(ingest_router)
app.include_router(ask_router)
app.include_router(debug_jury_router)
