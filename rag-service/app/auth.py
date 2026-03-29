import os

from fastapi import Header, HTTPException


def verify_service_secret(x_service_secret: str = Header(...)):
    """Validate the shared service secret passed via X-Service-Secret header."""
    expected = os.environ.get("RAG_SERVICE_SECRET", "")
    if not expected or x_service_secret != expected:
        raise HTTPException(status_code=401, detail="Invalid service secret")
