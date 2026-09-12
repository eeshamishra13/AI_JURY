"""
services/answer.py — Generate a grounded answer from retrieved chunks.

Uses gemini-2.5-flash for speed — Stage 4 adds 4 juror calls on top of this.
"""

from google.genai import types
from services.gemini_client import client
from models.chunk import Source
from typing import List

GENERATION_MODEL = "gemini-3.6-flash"

SYSTEM_PROMPT = """\
You are a precise, factual assistant. You will be given a user question and a
set of numbered source passages retrieved from a document.

Rules:
1. Answer ONLY using information contained in the provided sources.
2. Do not add facts, opinions, or knowledge from outside the sources.
3. If the sources do not contain enough information to answer the question,
   say clearly: "The provided sources do not contain enough information to
   answer this question." — do not speculate or guess.
4. Be concise. One to three sentences is ideal.
5. Do not cite source IDs in your answer — just answer naturally.
"""


import requests

def build_user_prompt(question: str, sources: List[Source]) -> str:
    source_block = "\n\n".join(
        f"[{s.id}] {s.text}" for s in sources
    )
    return (
        f"Sources:\n{source_block}\n\n"
        f"Question: {question}"
    )

def generate_answer_gemini(question: str, sources: List[Source]) -> str:
    response = client.models.generate_content(
        model=GENERATION_MODEL,
        contents=build_user_prompt(question, sources),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.0,
            max_output_tokens=512,
        ),
    )
    return response.text.strip()

def generate_answer(question: str, sources: List[Source]) -> str:
    """
    Send the question + retrieved sources to local Ollama.
    Fallback to Gemini if Ollama fails.
    """
    try:
        # Use a system prompt format typical for local models
        prompt = f"System: {SYSTEM_PROMPT}\n\n{build_user_prompt(question, sources)}\n\nAnswer:"
        
        res = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2:3b",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.0,
                    "num_predict": 512
                }
            },
            timeout=30
        )
        res.raise_for_status()
        return res.json()["response"].strip()
    except Exception as e:
        print(f"Ollama generation failed ({e}). Falling back to Gemini.")
        return generate_answer_gemini(question, sources)
