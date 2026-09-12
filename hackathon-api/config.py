"""
config.py — Load and validate environment variables at startup.
Raises a clear error immediately if required variables are missing.
"""

import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

if not GEMINI_API_KEY:
    raise RuntimeError(
        "\n\n"
        "  ❌  GEMINI_API_KEY is not set.\n"
        "  Copy .env.example → .env and add your key:\n"
        "      GEMINI_API_KEY=your_key_here\n"
    )
