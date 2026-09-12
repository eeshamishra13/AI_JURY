"""
services/gemini_client.py — Initialise the google-genai client.

This module only sets up the client singleton.
Actual model calls live in later-stage service modules.
"""

from google import genai
from config import GEMINI_API_KEY

# Singleton client — import this wherever you need to make Gemini calls.
client = genai.Client(api_key=GEMINI_API_KEY)
