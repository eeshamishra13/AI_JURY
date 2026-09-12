"""
routes/health.py — Health-check endpoint.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Returns {"status": "ok"} — used by infra and the frontend to verify the API is up."""
    return {"status": "ok"}
