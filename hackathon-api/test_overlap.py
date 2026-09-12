import requests
import json
import sys
import os

text = """Notion Labs, Inc., referred to in this policy as "Notion," "we," "us," and "our," provides the following privacy practices.

Disclosing your information

We may disclose your information to service providers who help us provide the Services, process payments, and offer customer support. We may also disclose it to business partners at your request, and to our affiliated entities under common ownership or control with us.

We do not disclose or use your information to advertise any third party's products or services via the Services. However, we may disclose your information to third-party advertising partners to market our own Services and grow our user base, including providing targeted marketing about our own Services through third-party channels.

If you submit information in a workspace that other users can access, that information may be displayed to those collaborators, including your email address or photo alongside your workspace profile.

We may also disclose information to comply with law enforcement requests or legal process, to protect rights, property, or safety, to enforce our agreements, or to assist in investigations of suspected illegal activity. If we are involved in a merger, acquisition, bankruptcy, or sale of assets, your information may be transferred as part of that transaction.

Your privacy rights

Depending on your location, you may have the right to access your information, request correction of inaccurate information, request deletion of your information, and request restriction of or object to processing of your information. You will not be discriminated against for exercising these rights.

If you exercise any of these rights, we will process the request in accordance with applicable law. In some circumstances we may need to deny the request in whole or in part — for example, if we have a legal obligation to retain the information for a certain purpose. We may take steps to verify your identity before fulfilling a request, and depending on your location you may have the right to appeal our response.

Data retention

We store the information we receive for as long as you use our Services, or as necessary to fulfill the purposes for which it was collected, provide our Services, resolve disputes, establish legal defenses, conduct audits, pursue legitimate business purposes, enforce our agreements, and comply with applicable laws.

Children's information

Our Services are intended for general audiences and are not directed at children. If we become aware that we have collected data without legally valid parental consent from a child under an age where such consent is required, we will take reasonable steps to delete it as soon as possible.

California residents (CCPA)

In the last 12 months we have disclosed or shared the following categories of personal information. Identifiers, such as name and email, are disclosed to affiliates, service providers, and advertising partners for business purposes, and shared with advertising partners for cross-context behavioral advertising. Commercial information is disclosed to affiliates and service providers for business purposes, but is not sold or shared with advertising partners. Internet or network activity is disclosed to affiliates, service providers, and advertising partners, and is also shared with advertising partners. Geolocation data, meaning general location rather than precise GPS, follows the same pattern as internet activity. Professional or employment-related information is disclosed to affiliates and service providers for business purposes, but is not sold or shared with advertising partners. Inferences drawn to create a consumer profile are disclosed to affiliates, service providers, and advertising partners, and are shared with advertising partners.

You may opt out of the sale or sharing of your personal information for online advertising and analytics by using the "Do Not Sell or Share My Info" link on our website footer. To opt out of offline disclosure for these purposes, you may contact us by email."""

try:
    res = requests.post("http://localhost:8000/ingest", json={"text": text})
    res.raise_for_status()
    print("=== INGEST SUCCESS ===\n")
except Exception as e:
    print("Ingest failed:", e)
    sys.exit(1)

sys.path.insert(0, os.path.dirname(__file__))
from services.chunker import split_into_chunks

chunks = split_into_chunks(text)
print("=" * 60)
print(f"CHUNK STORE CONTENTS — {len(chunks)} chunks total")
print("=" * 60)
for i, c in enumerate(chunks, 1):
    words = c.split()
    first_10 = " ".join(words[:10])
    last_10 = " ".join(words[-10:])
    print(f"\n--- src_{i} ({len(words)} words) ---")
    print(f"  STARTS: \"{first_10} ...\"")
    print(f"  ENDS:   \"... {last_10}\"")
    if "Do Not Sell or Share My Info" in c:
        print("  ✅ CONTAINS EXACT PHRASE: 'Do Not Sell or Share My Info'")
