"""
test_retrieval.py — End-to-end smoke test for Stage 2.

Run this from the project root after adding your real GEMINI_API_KEY to .env:

    .venv\\Scripts\\python test_retrieval.py

What it does:
  1. Ingests a multi-paragraph sample document about refund policies
  2. Calls retrieve() with three different queries
  3. Prints the top-3 chunks for each query so you can eyeball relevance
"""

import sys
import os

# Make sure we can import from the project root
sys.path.insert(0, os.path.dirname(__file__))

# This will raise clearly if GEMINI_API_KEY is not set
import config  # noqa: F401

from services.chunker import split_into_chunks
from services.embeddings import embed_batch
from services.store import chunk_store
from services.retrieval import retrieve
from models.chunk import StoredChunk

# ---------------------------------------------------------------------------
# Sample document — a fictional refund / cancellation policy
# (long enough to produce at least 3 distinct chunks)
# ---------------------------------------------------------------------------
SAMPLE_TEXT = """
Our cancellation and refund policy is designed to be fair to both customers 
and service providers. Customers who cancel their bookings more than 72 hours 
before the scheduled service date are entitled to a full refund, processed 
within 5–7 business days to the original payment method. No cancellation fee 
applies in this window.

For cancellations made between 24 and 72 hours before the service date, a 
partial refund of 50% of the total booking value will be issued. The remaining 
50% is retained as a late-cancellation fee to compensate the service provider 
for the short notice. Customers in this window may alternatively choose to 
reschedule at no additional cost, subject to availability.

Cancellations made within 24 hours of the scheduled service are considered 
last-minute cancellations. In this case, no refund is issued. However, if the 
cancellation is due to a documented emergency — such as a medical emergency 
verified by a doctor's note, or a natural disaster affecting the customer's 
location — a full refund or a complimentary reschedule may be granted at the 
discretion of our customer support team.

In cases where the service provider cancels the booking for any reason, the 
customer is entitled to a full refund regardless of timing. In addition, the 
customer will receive a 15% discount voucher applicable to their next booking. 
Service provider cancellations made within 12 hours of the scheduled service 
also trigger an automatic escalation to our quality assurance team.

Refunds for digital or subscription-based services are handled differently. 
Monthly subscriptions can be cancelled at any time; the cancellation takes 
effect at the end of the current billing cycle and no partial-month refunds 
are issued. Annual subscriptions cancelled within 14 days of purchase are 
eligible for a full refund. After 14 days, a pro-rata refund is issued for 
the unused months remaining in the subscription term.

For group bookings of five or more participants, special terms apply. Group 
cancellations require 96 hours notice for a full refund. Between 48 and 96 
hours, a 30% fee is retained. Less than 48 hours notice results in forfeiture 
of the full deposit. Group rescheduling is available with at least 48 hours 
notice at no extra charge.

Disputes regarding refund decisions should be submitted in writing to our 
support team within 30 days of the original cancellation. Our team will review 
the case and respond within 10 business days. If the dispute is escalated, it 
will be reviewed by a senior manager whose decision is final and binding.
"""


def main():
    print("=" * 60)
    print("STAGE 2 — Retrieval smoke test")
    print("=" * 60)

    # --- Step 1: chunk ---
    chunks = split_into_chunks(SAMPLE_TEXT)
    print(f"\n[1] Chunked into {len(chunks)} pieces (~200 words each)")
    for i, c in enumerate(chunks):
        wc = len(c.split())
        print(f"    chunk {i+1}: {wc} words — \"{c[:60]}…\"")

    # --- Step 2: embed & store ---
    print(f"\n[2] Embedding {len(chunks)} chunks via gemini-embedding-001 …")
    embeddings = embed_batch(chunks)
    print(f"    Embedding dim: {len(embeddings[0])}")

    stored = [
        StoredChunk(id=f"src_{i+1}", text=text, embedding=emb)
        for i, (text, emb) in enumerate(zip(chunks, embeddings))
    ]
    chunk_store.clear()
    chunk_store.extend(stored)
    print(f"    Stored {len(chunk_store)} chunks in memory.")

    # --- Step 3: retrieve ---
    queries = [
        "What happens if I cancel within 24 hours?",
        "Can I get a refund on my annual subscription?",
        "What if the service provider cancels on me?",
    ]

    for q in queries:
        print(f"\n[3] Query: \"{q}\"")
        results = retrieve(q, k=3)
        for rank, source in enumerate(results, 1):
            preview = source.text[:120].replace("\n", " ")
            print(f"    #{rank} [{source.id}] {preview}…")

    print("\n" + "=" * 60)
    print("Done. Check the chunks above for retrieval quality.")
    print("=" * 60)


if __name__ == "__main__":
    main()
